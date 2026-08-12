import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'BOOTSTRAP_CONFIGURED_PRODUCTION_CANDIDATE';
const evidenceId = 'P6-08-CANDIDATE';
const environment = 'configured_production_candidate';
const projectName = 'cryptopaymap-production';
const stagingProjectName = 'cryptopaymap-staging';
const productionBranch = 'main';
const platformHost = `${projectName}.pages.dev`;
const baseUrl = `https://${platformHost}`;
const markerPath = 'p6-05-release.json';
const p605Path = 'config/staging-authorization/p6-05-public-export-release-receipt.json';
const requiredDataFiles = [
  ['data/places.json', 'application/json'],
  ['data/place-pins.json', 'application/json'],
  ['data/online-services.json', 'application/json'],
  ['data/stats.json', 'application/json'],
  ['data/updates.json', 'application/json'],
];

function sha256(value) {
  const hash = createHash('sha256');
  hash.update(
    typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value),
  );
  return hash.digest('hex');
}

function boundedHash(value) {
  return `sha256:${sha256(value)}`;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function validCommit(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function validDigest(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function validOwner(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 100;
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
    .filter((path) => relative(root, path).replaceAll('\\', '/') !== markerPath)
    .map((path) => {
      const file = relative(root, path).replaceAll('\\', '/');
      return `${file}\0${sha256(readFileSync(path))}`;
    });
  return sha256(entries.join('\n'));
}

function countRecords(path, value) {
  if (path === 'data/stats.json') return isObject(value.stats) ? 1 : 0;
  return Array.isArray(value.records) ? value.records.length : null;
}

export function materializeMachineMetadata(root, commit) {
  const entries = [];
  let schemaVersion = null;
  let generatedAt = null;

  for (const [path, mediaType] of requiredDataFiles) {
    const fullPath = resolve(root, path);
    const value = readJson(fullPath);
    if (value === null) throw new Error(`public_data_missing_or_invalid:${path}`);
    if (typeof value.schemaVersion !== 'string' || safeTimestamp(value.generatedAt) === null) {
      throw new Error(`public_data_identity_invalid:${path}`);
    }
    schemaVersion ??= value.schemaVersion;
    generatedAt ??= value.generatedAt;
    if (schemaVersion !== value.schemaVersion || generatedAt !== value.generatedAt) {
      throw new Error(`public_data_identity_mismatch:${path}`);
    }
    const bytes = readFileSync(fullPath);
    const recordCount = countRecords(path, value);
    if (!Number.isInteger(recordCount) || recordCount < 0) {
      throw new Error(`public_data_record_count_invalid:${path}`);
    }
    entries.push({
      path: `/${path}`,
      mediaType,
      schemaVersion,
      recordCount,
      sha256: sha256(bytes),
      licenses: ['cpm-public-data'],
    });
  }

  const datasetVersion = `production-candidate-${commit.slice(0, 12)}-${sha256(entries).slice(0, 12)}`;
  const manifest = {
    schemaVersion,
    generatedAt,
    datasetVersion,
    canonicalOnly: true,
    files: entries,
  };
  const version = {
    projectId: 'cryptopaymap',
    siteName: 'CryptoPayMap',
    registryType: 'crypto_payment_acceptance',
    datasetVersion,
    schemaVersion,
    generatedAt,
    canonicalOnly: true,
    verificationMarker: 'reviewed_public_records_only',
  };

  mkdirSync(resolve(root, 'data'), { recursive: true });
  writeFileSync(resolve(root, 'data/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(root, 'version.json'), `${JSON.stringify(version, null, 2)}\n`);
  return { manifest, version };
}

function readP605(statusRoot, commit, now) {
  const receipt = readJson(resolve(statusRoot, p605Path));
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const candidate = receipt?.checks?.releases?.candidate;
  const releaseId = candidate?.releaseId ?? null;
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-05' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    receipt?.checks?.artifactValidation?.status === 'passed' &&
    receipt?.checks?.releases?.status === 'passed' &&
    receipt?.checks?.external?.status === 'passed' &&
    receipt?.checks?.finalState?.status === 'passed' &&
    receipt?.checks?.finalState?.activeKind === 'candidate' &&
    validDigest(releaseId);

  return {
    state: current ? 'current' : receipt === null ? 'missing' : 'stale_or_failed',
    generatedAt: safeTimestamp(receipt?.generatedAt),
    expiresAt,
    releaseId: current ? releaseId : null,
    releaseIdDigest: current ? boundedHash(releaseId) : null,
    receiptDigest: current ? boundedHash(JSON.stringify(receipt)) : null,
  };
}

function writeAuthorityMarker(root, commit, releaseAuthorityId, treeDigest) {
  const candidateArtifactId = boundedHash({
    version: 1,
    commit,
    releaseAuthorityId,
    treeDigest,
    projectName,
  });
  const marker = {
    version: 1,
    environment,
    evidenceId,
    kind: 'candidate',
    sourceCommit: commit,
    releaseId: releaseAuthorityId,
    authorityReleaseId: releaseAuthorityId,
    publicTreeDigest: treeDigest,
    candidateArtifactId,
  };
  writeFileSync(resolve(root, markerPath), `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
}

function buildCandidateArtifact(commit, releaseAuthorityId) {
  const root = resolve('dist');
  const digests = [];
  let identity = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    rmSync(root, { recursive: true, force: true });
    execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
    identity = materializeMachineMetadata(root, commit);
    digests.push(publicTreeDigest(root));
  }

  if (digests[0] !== digests[1]) throw new Error('deterministic_candidate_build_failed');
  const marker = writeAuthorityMarker(root, commit, releaseAuthorityId, digests[1]);
  return {
    treeDigest: digests[1],
    marker,
    datasetVersion: identity.version.datasetVersion,
    schemaVersion: identity.version.schemaVersion,
  };
}

async function cloudflareRequest(path, label) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error('cloudflare_credentials_missing');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${path}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) throw new Error(`${label}:${response.status}`);
  return body.result;
}

async function verifyProjectTopology() {
  const project = await cloudflareRequest(
    `/pages/projects/${encodeURIComponent(projectName)}`,
    'pages_project_get_failed',
  );
  const domains = Array.isArray(project?.domains)
    ? project.domains.filter((value) => typeof value === 'string')
    : [];
  const customDomains = domains.filter((value) => value !== platformHost);
  const safe =
    project?.name === projectName &&
    project?.production_branch === productionBranch &&
    project?.subdomain === platformHost &&
    projectName !== stagingProjectName &&
    customDomains.length === 0;
  return {
    safe,
    projectName: project?.name ?? null,
    productionBranch: project?.production_branch ?? null,
    platformDomainPresent: domains.includes(platformHost),
    customDomainCount: customDomains.length,
    projectIdDigest: typeof project?.id === 'string' ? boundedHash(project.id) : null,
  };
}

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}?p6_014=${Date.now()}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const value = await response.json().catch(() => null);
  return {
    status: response.status,
    contentType: response.headers.get('content-type')?.split(';')[0] ?? null,
    value,
  };
}

async function verifyExternal(plan) {
  const routes = [
    ['/', 200, 'text/html'],
    ['/version.json', 200, 'application/json'],
    ['/data/manifest.json', 200, 'application/json'],
    ['/robots.txt', 200, 'text/plain'],
  ];
  const observations = [];
  for (const [path, expectedStatus, expectedType] of routes) {
    const response = await fetch(`${baseUrl}${path}?p6_014=${Date.now()}`, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? null;
    if (response.status !== expectedStatus)
      throw new Error(`external_status:${path}:${response.status}`);
    if (contentType !== expectedType) throw new Error(`external_type:${path}:${contentType}`);
    observations.push({
      path,
      status: response.status,
      contentType,
      bodyDigest: boundedHash(bytes),
    });
  }

  const marker = await fetchJson(`/${markerPath}`);
  if (
    marker.status !== 200 ||
    marker.value?.releaseId !== plan.releaseAuthorityId ||
    marker.value?.authorityReleaseId !== plan.releaseAuthorityId ||
    marker.value?.candidateArtifactId !== plan.candidateArtifactId ||
    marker.value?.publicTreeDigest !== plan.publicTreeDigest
  ) {
    throw new Error('external_release_marker_mismatch');
  }

  const version = await fetchJson('/version.json');
  const manifest = await fetchJson('/data/manifest.json');
  if (
    version.value?.datasetVersion !== plan.datasetVersion ||
    version.value?.schemaVersion !== plan.schemaVersion ||
    version.value?.canonicalOnly !== true ||
    manifest.value?.datasetVersion !== plan.datasetVersion ||
    manifest.value?.schemaVersion !== plan.schemaVersion ||
    manifest.value?.canonicalOnly !== true
  ) {
    throw new Error('external_machine_identity_mismatch');
  }
  return observations;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function prepareCandidate({
  statusRoot,
  outputPath,
  commit,
  confirmation,
  owner,
  repositoryContractOutcome,
  now = new Date(),
}) {
  const p605 = readP605(statusRoot, commit, now);
  const blockers = [];
  if (!validCommit(commit)) blockers.push('approved_commit:invalid');
  if (confirmation !== exactConfirmation) blockers.push('confirmation:invalid');
  if (!validOwner(owner)) blockers.push('bootstrap_owner:invalid');
  if (repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');
  if (p605.state !== 'current') blockers.push('p6_05_release:not_current');

  if (blockers.length > 0) {
    const receipt = {
      version: 1,
      evidenceId,
      state: 'blocked',
      environment,
      commit: validCommit(commit) ? commit : null,
      generatedAt: now.toISOString(),
      checks: { p605, productionMutation: false },
      blockers,
    };
    writeJson(outputPath, receipt);
    return receipt;
  }

  const artifact = buildCandidateArtifact(commit, p605.releaseId);
  const plan = {
    version: 1,
    evidenceId,
    state: 'prepared',
    environment,
    commit,
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
    ownerDigest: boundedHash(owner),
    project: { name: projectName, productionBranch, platformHost },
    releaseAuthorityId: p605.releaseId,
    releaseAuthorityDigest: p605.releaseIdDigest,
    p605ReceiptDigest: p605.receiptDigest,
    publicTreeDigest: artifact.treeDigest,
    candidateArtifactId: artifact.marker.candidateArtifactId,
    datasetVersion: artifact.datasetVersion,
    schemaVersion: artifact.schemaVersion,
    checks: {
      deterministicBuild: 'passed',
      machineMetadata: 'passed',
      p605: p605.state,
      productionMutation: false,
    },
    blockers: [],
  };
  writeJson(outputPath, plan);
  return plan;
}

export async function verifyCandidate({
  planPath,
  outputPath,
  workflowRunId = null,
  now = new Date(),
}) {
  const plan = readJson(planPath);
  if (
    plan?.state !== 'prepared' ||
    !validCommit(plan?.commit) ||
    !validDigest(plan?.releaseAuthorityId) ||
    !validDigest(plan?.candidateArtifactId) ||
    typeof plan?.publicTreeDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(plan.publicTreeDigest) ||
    safeTimestamp(plan?.expiresAt) === null ||
    Date.parse(plan.expiresAt) <= now.getTime()
  ) {
    throw new Error('candidate_plan_invalid_or_expired');
  }

  const topology = await verifyProjectTopology();
  if (!topology.safe) throw new Error('production_candidate_project_topology_unsafe');
  const external = await verifyExternal(plan);
  const receipt = {
    version: 1,
    evidenceId,
    state: 'accepted',
    environment,
    commit: plan.commit,
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
    workflowRunId,
    releaseAuthorityDigest: plan.releaseAuthorityDigest,
    p605ReceiptDigest: plan.p605ReceiptDigest,
    publicTreeDigest: plan.publicTreeDigest,
    candidateArtifactId: plan.candidateArtifactId,
    datasetVersion: plan.datasetVersion,
    schemaVersion: plan.schemaVersion,
    checks: {
      projectTopology: topology,
      runtimeSecrets: 'configured_by_protected_workflow',
      deployment: 'passed',
      externalVerification: 'passed',
      externalRouteCount: external.length,
      externalRouteDigest: boundedHash(external),
      liveDomainMutation: false,
      dnsMutation: false,
      canonicalHostMutation: false,
    },
    exceptions: [],
  };
  writeJson(outputPath, receipt);
  return receipt;
}

function assert(value, message) {
  if (!value) throw new Error(`self_test_failed:${message}`);
}

function writeFixtureData(root) {
  mkdirSync(resolve(root, 'data'), { recursive: true });
  for (const [path] of requiredDataFiles) {
    const value =
      path === 'data/stats.json'
        ? { schemaVersion: '1.0.0', generatedAt: '2026-08-12T00:00:00.000Z', stats: { places: 0 } }
        : { schemaVersion: '1.0.0', generatedAt: '2026-08-12T00:00:00.000Z', records: [] };
    writeJson(resolve(root, path), value);
  }
  writeFileSync(resolve(root, 'index.html'), '<!doctype html><title>candidate</title>');
}

async function selfTest() {
  const root = mkdtempSync(resolve(tmpdir(), 'cpm-p6-014-'));
  try {
    const dist = resolve(root, 'dist');
    writeFixtureData(dist);
    const first = materializeMachineMetadata(dist, 'a'.repeat(40));
    const digest = publicTreeDigest(dist);
    const releaseId = boundedHash('release-authority');
    const marker = writeAuthorityMarker(dist, 'a'.repeat(40), releaseId, digest);
    assert(marker.releaseId === releaseId, 'marker must reuse P6-05 release authority');
    assert(marker.authorityReleaseId === releaseId, 'authority must be explicit');
    assert(publicTreeDigest(dist) === digest, 'marker must not change public tree digest');
    assert(first.version.canonicalOnly === true, 'version must remain canonical-only');

    const statusRoot = resolve(root, 'status');
    const p605File = resolve(statusRoot, p605Path);
    mkdirSync(dirname(p605File), { recursive: true });
    writeJson(p605File, {
      version: 1,
      evidenceId: 'P6-05',
      environment: 'configured_staging',
      state: 'accepted',
      commit: 'a'.repeat(40),
      generatedAt: '2026-08-12T00:00:00.000Z',
      expiresAt: '2026-08-13T00:00:00.000Z',
      checks: {
        artifactValidation: { status: 'passed' },
        releases: { status: 'passed', candidate: { releaseId } },
        external: { status: 'passed' },
        finalState: { status: 'passed', activeKind: 'candidate' },
      },
    });
    const p605 = readP605(statusRoot, 'a'.repeat(40), new Date('2026-08-12T01:00:00.000Z'));
    assert(p605.state === 'current', 'current P6-05 authority must be accepted');
    const stale = readP605(statusRoot, 'b'.repeat(40), new Date('2026-08-12T01:00:00.000Z'));
    assert(stale.state !== 'current', 'wrong-commit P6-05 authority must be rejected');
    console.log('OPS-P6-014 configured production candidate bootstrap self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const command = process.argv[2];
  if (command === 'prepare') {
    const [statusRoot, outputPath] = process.argv.slice(3);
    if (!statusRoot || !outputPath) throw new Error('Usage: prepare <status-root> <output-path>');
    const result = prepareCandidate({
      statusRoot,
      outputPath,
      commit: process.env.APPROVED_COMMIT ?? '',
      confirmation: process.env.CONFIRMATION ?? '',
      owner: process.env.BOOTSTRAP_OWNER ?? '',
      repositoryContractOutcome: process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failed',
    });
    console.log(`Production candidate preparation state: ${result.state}`);
    if (result.state !== 'prepared') process.exitCode = 1;
    return;
  }
  if (command === 'verify') {
    const [planPath, outputPath] = process.argv.slice(3);
    if (!planPath || !outputPath) throw new Error('Usage: verify <plan-path> <output-path>');
    const result = await verifyCandidate({
      planPath,
      outputPath,
      workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    });
    console.log(`Production candidate verification state: ${result.state}`);
    return;
  }
  throw new Error(
    'Usage: --self-test | prepare <status-root> <output-path> | verify <plan-path> <output-path>',
  );
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
