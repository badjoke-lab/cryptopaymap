import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_05';
const evidenceId = 'P6-05';
const expiryHours = 72;
const projectName = 'cryptopaymap-staging';
const productionBranch = 'staging-review';
const productionBaseUrl = 'https://cryptopaymap-staging.pages.dev';
const markerPath = '/p6-05-release.json';
const predecessorPaths = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
  ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
];

function sha256(value) {
  const hash = createHash('sha256');
  if (typeof value === 'string' || value instanceof Uint8Array) hash.update(value);
  else hash.update(JSON.stringify(value));
  return hash.digest('hex');
}

function boundedHash(value) {
  return `sha256:${sha256(value)}`;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validCommit(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function validOperator(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
}

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function listFiles(root) {
  const output = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else if (stats.isFile()) output.push(path);
    }
  }
  visit(root);
  return output;
}

export function publicTreeDigest(root) {
  const entries = listFiles(root)
    .filter((path) => relative(root, path) !== markerPath.replace(/^\//, ''))
    .map((path) => {
      const file = relative(root, path).replaceAll('\\', '/');
      return `${file}\0${sha256(readFileSync(path))}`;
    });
  return sha256(entries.join('\n'));
}

function readPredecessor(statusRoot, predecessorEvidenceId, path, commit, now) {
  let receipt = null;
  try {
    const value = JSON.parse(readFileSync(resolve(statusRoot, path), 'utf8'));
    receipt = isObject(value) ? value : null;
  } catch {
    receipt = null;
  }
  const generatedAt = safeTimestamp(receipt?.generatedAt);
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const binding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
  const bindingValid =
    binding !== null &&
    bindingKeys.every(
      (key) => typeof binding[key] === 'string' && /^sha256:[a-f0-9]{64}$/.test(binding[key]),
    );
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === predecessorEvidenceId &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    bindingValid;
  return {
    evidenceId: predecessorEvidenceId,
    path,
    state: current
      ? 'current'
      : receipt === null
        ? 'missing'
        : expiresAt !== null && Date.parse(expiresAt) <= now.getTime()
          ? 'stale'
          : 'failed',
    generatedAt,
    expiresAt,
    binding: current ? Object.fromEntries(bindingKeys.map((key) => [key, binding[key]])) : null,
  };
}

function sharedBinding(predecessors) {
  if (predecessors.some((item) => item.state !== 'current' || item.binding === null)) return null;
  const first = JSON.stringify(predecessors[0].binding);
  return predecessors.every((item) => JSON.stringify(item.binding) === first)
    ? predecessors[0].binding
    : null;
}

function releaseMarker(kind, commit, treeDigest) {
  const releaseId = boundedHash({ version: 1, kind, commit, treeDigest });
  return {
    version: 1,
    environment: 'configured_staging',
    evidenceId,
    kind,
    sourceCommit: commit,
    publicTreeDigest: treeDigest,
    releaseId,
  };
}

function writeMarker(root, marker) {
  const path = join(root, markerPath.replace(/^\//, ''));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(marker, null, 2)}\n`);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function safeUrl(value) {
  if (typeof value !== 'string' || value.length < 1) return null;
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
}

function noPrivateLeakage(text) {
  return !/(database_url|secret|token|private submission|storage key|signed url|contact email)/i.test(
    text,
  );
}

async function cloudflareRequest(path, init = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error('cloudflare_credentials_missing');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    },
  );
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok || body?.success !== true) {
    const codes = Array.isArray(body?.errors)
      ? body.errors.map((error) => error?.code).filter(Boolean).join(',')
      : 'unknown';
    throw new Error(`cloudflare_api_${response.status}_${codes}`);
  }
  return body.result;
}

async function fetchMarker(baseUrl) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}${markerPath}?evidence=${Date.now()}-${Math.random()}`,
    { cache: 'no-store', redirect: 'manual' },
  );
  if (response.status !== 200) return null;
  const text = await response.text();
  if (!noPrivateLeakage(text)) throw new Error('marker_private_leakage');
  try {
    const value = JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

async function waitForMarker(baseUrl, expectedReleaseId, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const marker = await fetchMarker(baseUrl);
    if (marker?.releaseId === expectedReleaseId) return marker;
    await sleep(2_000);
  }
  throw new Error('external_release_marker_timeout');
}

async function productionDeployments() {
  const result = await cloudflareRequest('/deployments?env=production');
  return Array.isArray(result) ? result : [];
}

async function classifiedDeployments(commit, treeDigest) {
  const deployments = await productionDeployments();
  const recognized = [];
  const unrecognized = [];
  for (const deployment of deployments) {
    if (deployment?.latest_stage?.status !== 'success') continue;
    const url = safeUrl(deployment.url);
    const marker = url === null ? null : await fetchMarker(url);
    if (
      marker?.version === 1 &&
      marker?.environment === 'configured_staging' &&
      marker?.evidenceId === evidenceId &&
      marker?.sourceCommit === commit &&
      marker?.publicTreeDigest === treeDigest &&
      (marker?.kind === 'baseline' || marker?.kind === 'candidate')
    ) {
      recognized.push({ deployment, marker, url });
    } else {
      unrecognized.push({
        id: boundedHash(deployment?.id ?? 'missing'),
        environment: deployment?.environment ?? null,
      });
    }
  }
  return { recognized, unrecognized };
}

function deployArtifact(root) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'pages',
      'deploy',
      root,
      '--project-name',
      projectName,
      '--branch',
      productionBranch,
    ],
    { stdio: 'inherit', env: process.env },
  );
}

async function findReleaseDeployment(marker, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const classified = await classifiedDeployments(marker.sourceCommit, marker.publicTreeDigest);
    const match = classified.recognized.find((item) => item.marker.releaseId === marker.releaseId);
    if (match) return { ...match, unrecognized: classified.unrecognized };
    await sleep(2_000);
  }
  throw new Error(`deployment_not_found_${marker.kind}`);
}

async function rollbackTo(deploymentId) {
  return cloudflareRequest(`/deployments/${deploymentId}/rollback`, { method: 'POST' });
}

async function verifyExternal(baseUrl, expectedMarker, localDist) {
  await waitForMarker(baseUrl, expectedMarker.releaseId);
  const required = [
    ['/', 200, 'text/html'],
    ['/places/', 200, 'text/html'],
    ['/place/staging-coffee-tokyo/', 200, 'text/html'],
    ['/online/', 200, 'text/html'],
    ['/service/staging-vpn/', 200, 'text/html'],
    ['/version.json', 200, 'application/json'],
    ['/data/manifest.json', 200, 'application/json'],
    ['/robots.txt', 200, 'text/plain'],
    ['/staging-review/media/place-cover.webp', 200, 'image/webp'],
    ['/__p6_05_missing__', 404, 'text/html'],
  ];
  const results = [];
  for (const [path, expectedStatus, expectedType] of required) {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}?p6_05=${Date.now()}`, {
      cache: 'no-store',
      redirect: 'manual',
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes).slice(0, 16_384);
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? null;
    if (response.status !== expectedStatus) throw new Error(`external_status_${path}_${response.status}`);
    if (expectedStatus === 200 && contentType !== expectedType) {
      throw new Error(`external_type_${path}_${contentType}`);
    }
    if (!noPrivateLeakage(text)) throw new Error(`external_private_leakage_${path}`);
    if (path === '/robots.txt' && !text.includes('Disallow: /')) {
      throw new Error('external_robots_policy_missing');
    }
    results.push({ path, status: response.status, contentType, bodyDigest: sha256(bytes) });
  }
  const localVersion = JSON.parse(readFileSync(join(localDist, 'version.json'), 'utf8'));
  const externalVersion = await fetch(
    `${baseUrl.replace(/\/$/, '')}/version.json?p6_05_identity=${Date.now()}`,
    { cache: 'no-store' },
  ).then((response) => response.json());
  if (
    externalVersion.datasetVersion !== localVersion.datasetVersion ||
    externalVersion.schemaVersion !== localVersion.schemaVersion ||
    externalVersion.generatedAt !== localVersion.generatedAt
  ) {
    throw new Error('external_version_identity_mismatch');
  }
  return results;
}

function safeException(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[^a-zA-Z0-9:_./-]/g, '_').slice(0, 200);
}

async function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-05-self-test-'));
  try {
    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>test</title>');
    writeFileSync(join(root, 'data', 'manifest.json'), '{"version":1}\n');
    const first = publicTreeDigest(root);
    const baseline = releaseMarker('baseline', 'a'.repeat(40), first);
    writeMarker(root, baseline);
    if (publicTreeDigest(root) !== first) throw new Error('marker_changed_public_tree_digest');
    const candidate = releaseMarker('candidate', 'a'.repeat(40), first);
    if (baseline.releaseId === candidate.releaseId) throw new Error('release_kind_not_fingerprinted');
    writeFileSync(join(root, 'data', 'manifest.json'), '{"version":2}\n');
    if (publicTreeDigest(root) === first) throw new Error('content_change_not_fingerprinted');
    console.log('OPS-P6-001I configured staging public export/release self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function execute(statusRoot, outputPath) {
  const now = new Date();
  const commit = process.env.APPROVED_COMMIT;
  const owner = process.env.RELEASE_OWNER;
  const confirmation = process.env.CONFIRMATION;
  const repositoryContract = process.env.REPOSITORY_CONTRACT_OUTCOME === 'success';
  const predecessors = validCommit(commit)
    ? predecessorPaths.map(([id, path]) => readPredecessor(statusRoot, id, path, commit, now))
    : predecessorPaths.map(([id, path]) => ({
        evidenceId: id,
        path,
        state: 'failed',
        generatedAt: null,
        expiresAt: null,
        binding: null,
      }));
  const binding = sharedBinding(predecessors);
  const exceptions = [];
  const checks = {
    exactMain: validCommit(commit) ? 'success' : 'failed',
    confirmation: confirmation === exactConfirmation ? 'success' : 'failed',
    owner: validOperator(owner) ? 'success' : 'failed',
    repositoryContract: repositoryContract ? 'success' : 'failed',
    predecessors: predecessors.map(({ binding: _binding, ...item }) => item),
    predecessorBinding: binding === null ? 'failed' : 'matched',
    deterministicGeneration: { status: 'not_run', firstDigest: null, secondDigest: null },
    artifactValidation: { status: 'not_run', datasetVersion: null, schemaVersion: null },
    topology: { status: 'not_run', productionBranch: null, customDomainCount: null },
    releases: { status: 'not_run', baseline: null, candidate: null },
    activation: { status: 'not_run', candidateVisible: false },
    rollback: { status: 'not_run', baselineVisible: false, candidateRestored: false },
    external: { status: 'not_run', routeCount: 0, routeDigest: null },
    finalState: { status: 'not_run', activeKind: null },
  };

  const preconditions =
    checks.exactMain === 'success' &&
    checks.confirmation === 'success' &&
    checks.owner === 'success' &&
    checks.repositoryContract === 'success' &&
    predecessors.every((item) => item.state === 'current') &&
    binding !== null &&
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) &&
    Boolean(process.env.CLOUDFLARE_API_TOKEN);

  if (!preconditions) exceptions.push('preconditions:failed');

  let state = 'failed';
  if (preconditions) {
    const workspace = mkdtempSync(join(tmpdir(), 'cpm-p6-05-'));
    try {
      const firstDist = join(workspace, 'first');
      const baselineDist = join(workspace, 'baseline');
      const candidateDist = join(workspace, 'candidate');

      execFileSync('npm', ['run', 'staging:review:build'], { stdio: 'inherit' });
      cpSync(resolve('dist'), firstDist, { recursive: true });
      const firstDigest = publicTreeDigest(firstDist);

      execFileSync('npm', ['run', 'staging:review:build'], { stdio: 'inherit' });
      const secondDigest = publicTreeDigest(resolve('dist'));
      checks.deterministicGeneration = {
        status: firstDigest === secondDigest ? 'passed' : 'failed',
        firstDigest: boundedHash(firstDigest),
        secondDigest: boundedHash(secondDigest),
      };
      if (firstDigest !== secondDigest) throw new Error('deterministic_generation_failed');

      cpSync(firstDist, baselineDist, { recursive: true });
      cpSync(resolve('dist'), candidateDist, { recursive: true });
      const baselineMarker = releaseMarker('baseline', commit, firstDigest);
      const candidateMarker = releaseMarker('candidate', commit, firstDigest);
      writeMarker(baselineDist, baselineMarker);
      writeMarker(candidateDist, candidateMarker);

      const version = JSON.parse(readFileSync(join(candidateDist, 'version.json'), 'utf8'));
      const manifest = JSON.parse(readFileSync(join(candidateDist, 'data', 'manifest.json'), 'utf8'));
      checks.artifactValidation = {
        status:
          version.canonicalOnly === true &&
          manifest.canonicalOnly === true &&
          version.datasetVersion === manifest.datasetVersion &&
          version.schemaVersion === manifest.schemaVersion
            ? 'passed'
            : 'failed',
        datasetVersion: version.datasetVersion ?? null,
        schemaVersion: version.schemaVersion ?? null,
      };
      if (checks.artifactValidation.status !== 'passed') throw new Error('artifact_identity_failed');

      const project = await cloudflareRequest('');
      const customDomains = Array.isArray(project?.domains) ? project.domains : [];
      checks.topology = {
        status:
          project?.name === projectName &&
          project?.production_branch === productionBranch &&
          customDomains.length === 0
            ? 'passed'
            : 'failed',
        productionBranch: project?.production_branch ?? null,
        customDomainCount: customDomains.length,
      };
      if (checks.topology.status !== 'passed') throw new Error('unsafe_pages_topology');

      let classified = await classifiedDeployments(commit, firstDigest);
      if (classified.unrecognized.length > 0) throw new Error('unrecognized_production_deployment');
      let baseline = classified.recognized.find(
        (item) => item.marker.releaseId === baselineMarker.releaseId,
      );
      let candidate = classified.recognized.find(
        (item) => item.marker.releaseId === candidateMarker.releaseId,
      );

      if (!baseline) {
        deployArtifact(baselineDist);
        baseline = await findReleaseDeployment(baselineMarker);
      }
      if (!candidate) {
        deployArtifact(candidateDist);
        candidate = await findReleaseDeployment(candidateMarker);
      }
      if (baseline.unrecognized?.length > 0 || candidate.unrecognized?.length > 0) {
        throw new Error('unexpected_production_deployment_after_stage');
      }
      checks.releases = {
        status: 'passed',
        baseline: {
          id: boundedHash(baseline.deployment.id),
          releaseId: baselineMarker.releaseId,
          url: boundedHash(baseline.url),
        },
        candidate: {
          id: boundedHash(candidate.deployment.id),
          releaseId: candidateMarker.releaseId,
          url: boundedHash(candidate.url),
        },
      };

      const activeBefore = await fetchMarker(productionBaseUrl);
      if (activeBefore?.releaseId !== candidateMarker.releaseId) {
        await rollbackTo(candidate.deployment.id);
      }
      await waitForMarker(productionBaseUrl, candidateMarker.releaseId);
      checks.activation = { status: 'passed', candidateVisible: true };

      const externalResults = await verifyExternal(
        productionBaseUrl,
        candidateMarker,
        candidateDist,
      );
      checks.external = {
        status: 'passed',
        routeCount: externalResults.length,
        routeDigest: boundedHash(externalResults),
      };

      await rollbackTo(baseline.deployment.id);
      await waitForMarker(productionBaseUrl, baselineMarker.releaseId);
      checks.rollback = { status: 'running', baselineVisible: true, candidateRestored: false };

      await rollbackTo(candidate.deployment.id);
      await waitForMarker(productionBaseUrl, candidateMarker.releaseId);
      checks.rollback = { status: 'passed', baselineVisible: true, candidateRestored: true };
      checks.finalState = { status: 'passed', activeKind: 'candidate' };
      state = 'accepted';
    } catch (error) {
      exceptions.push(`execution:${safeException(error)}`);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }

  for (const [name, value] of Object.entries(checks)) {
    if (isObject(value) && value.status === 'failed') exceptions.push(`${name}:failed`);
  }

  const generatedAt = new Date().toISOString();
  const receipt = {
    version: 1,
    evidenceId,
    launchDomain: 'public_export_release',
    environment: 'configured_staging',
    state: state === 'accepted' && exceptions.length === 0 ? 'accepted' : 'failed',
    commit: validCommit(commit) ? commit : null,
    generatedAt,
    expiresAt: new Date(Date.parse(generatedAt) + expiryHours * 60 * 60 * 1_000).toISOString(),
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    owner: validOperator(owner) ? boundedHash(owner.trim()) : null,
    procedure: 'OPS-P6-001I configured staging public export and release evidence',
    checks,
    binding,
    exceptions: [...new Set(exceptions)],
  };
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  await selfTest();
} else {
  const statusRoot = args[0] ?? 'status';
  const outputPath = args[1] ?? 'p6-05-public-export-release-receipt.json';
  await execute(statusRoot, outputPath);
}
