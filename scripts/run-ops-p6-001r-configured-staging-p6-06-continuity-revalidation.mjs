import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import tls from 'node:tls';

const exactConfirmation = 'REVALIDATE_CONFIGURED_STAGING_P6_06_CONTINUITY';
const evidenceId = 'P6-06';
const approvedHostname = 'staging.cryptopaymap.com';
const expiryHours = 72;
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const predecessorPaths = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
  ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
  ['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json'],
];
const diagnosticPath = 'config/staging-authorization/p6-06-domain-topology-diagnostic.json';
const acceptedReceiptPath =
  'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json';
const publicRoutes = [
  ['/', 200, 'text/html'],
  ['/places/', 200, 'text/html'],
  ['/place/staging-coffee-tokyo/', 200, 'text/html'],
  ['/online/', 200, 'text/html'],
  ['/service/staging-vpn/', 200, 'text/html'],
  ['/version.json', 200, 'application/json'],
  ['/data/manifest.json', 200, 'application/json'],
  ['/robots.txt', 200, 'text/plain'],
  ['/staging-review/media/place-cover.webp', 200, 'image/webp'],
  ['/__p6_06_missing__', 404, 'text/html'],
  ['/admin/api/dashboard', 403, 'text/plain'],
];

function sha256(value) {
  const hash = createHash('sha256');
  if (typeof value === 'string' || value instanceof Uint8Array) hash.update(value);
  else hash.update(JSON.stringify(value), 'utf8');
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

function readJson(root, relativePath) {
  try {
    const value = JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function readPredecessor(statusRoot, expectedEvidenceId, relativePath, commit, now) {
  const receipt = readJson(statusRoot, relativePath);
  const generatedAt = safeTimestamp(receipt?.generatedAt);
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const binding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingValid =
    binding !== null &&
    bindingKeys.every(
      (key) => typeof binding[key] === 'string' && /^sha256:[a-f0-9]{64}$/.test(binding[key]),
    );
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === expectedEvidenceId &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    bindingValid;
  return {
    evidenceId: expectedEvidenceId,
    path: relativePath,
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
    receipt: current ? receipt : null,
  };
}

function sharedBinding(predecessors) {
  if (predecessors.some((item) => item.state !== 'current' || item.binding === null)) return null;
  const first = JSON.stringify(predecessors[0].binding);
  return predecessors.every((item) => JSON.stringify(item.binding) === first)
    ? predecessors[0].binding
    : null;
}

function readDiagnostic(statusRoot, commit, now) {
  const receipt = readJson(statusRoot, diagnosticPath);
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-06-DIAGNOSTIC' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'diagnosed' &&
    receipt?.decision === 'existing_candidate_requires_approval' &&
    receipt?.commit === commit &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    receipt?.checks?.permissions?.dnsList === 'success' &&
    receipt?.checks?.topology?.projectSafe === true &&
    receipt?.checks?.topology?.zoneMatchesExpected === true &&
    receipt?.checks?.topology?.platformDomainPresent === true &&
    receipt?.checks?.topology?.platformDomainMatches === true &&
    receipt?.checks?.inventory?.selectedZoneCount === 1 &&
    receipt?.checks?.inventory?.projectCustomDomainCount === 1 &&
    receipt?.checks?.inventory?.candidateCount === 1 &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  return {
    path: diagnosticPath,
    state: current ? 'current_existing_candidate' : receipt === null ? 'missing' : 'failed',
    decision: receipt?.decision ?? null,
    generatedAt: safeTimestamp(receipt?.generatedAt),
    expiresAt,
    digest: current ? boundedHash(JSON.stringify(receipt)) : null,
  };
}

function readPriorAccepted(statusRoot, commit, now) {
  const receipt = readJson(statusRoot, acceptedReceiptPath);
  const generatedAt = safeTimestamp(receipt?.generatedAt);
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const valid =
    receipt?.version === 1 &&
    receipt?.evidenceId === evidenceId &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    validCommit(receipt?.commit) &&
    receipt.commit !== commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    receipt?.checks?.hostname?.digest === boundedHash(approvedHostname) &&
    ['passed', 'existing'].includes(receipt?.checks?.cutover?.status) &&
    receipt?.checks?.externalCutover?.status === 'passed' &&
    receipt?.checks?.rollback?.status === 'passed' &&
    receipt?.checks?.externalRollback?.status === 'passed' &&
    receipt?.checks?.finalRestore?.status === 'passed' &&
    receipt?.checks?.externalFinal?.status === 'passed' &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  if (!valid) {
    return {
      state: receipt === null ? 'missing' : 'failed',
      commit: receipt?.commit ?? null,
      generatedAt,
      expiresAt,
      digest: null,
      rollbackDigest: null,
      finalRestoreDigest: null,
    };
  }
  return {
    state: 'authenticated_prior',
    commit: receipt.commit,
    generatedAt,
    expiresAt,
    digest: boundedHash(JSON.stringify(receipt)),
    rollbackDigest: boundedHash({
      rollback: receipt.checks.rollback,
      externalRollback: receipt.checks.externalRollback,
    }),
    finalRestoreDigest: boundedHash({
      finalRestore: receipt.checks.finalRestore,
      externalFinal: receipt.checks.externalFinal,
    }),
  };
}

async function queryDoh(endpoint, hostname) {
  const response = await fetch(`${endpoint}?name=${encodeURIComponent(hostname)}&type=A`, {
    headers: { Accept: 'application/dns-json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  const answers = Array.isArray(body?.Answer)
    ? body.Answer.map((item) => ({
        type: item?.type ?? null,
        dataDigest: boundedHash(item?.data ?? 'missing'),
      }))
    : [];
  return {
    status: Number.isInteger(body?.Status) ? body.Status : null,
    answerCount: answers.length,
    answerDigest: boundedHash(answers),
  };
}

async function observeDns() {
  const [system, cloudflare, google] = await Promise.all([
    dns.resolve4(approvedHostname, { ttl: true }),
    queryDoh('https://cloudflare-dns.com/dns-query', approvedHostname),
    queryDoh('https://dns.google/resolve', approvedHostname),
  ]);
  const passed =
    system.length > 0 &&
    cloudflare.status === 0 &&
    cloudflare.answerCount > 0 &&
    google.status === 0 &&
    google.answerCount > 0;
  return {
    passed,
    resolverCount: 3,
    digest: boundedHash({
      system: system
        .map((item) => ({ address: boundedHash(item.address), ttl: item.ttl }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      cloudflare,
      google,
    }),
  };
}

async function observeTls() {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = tls.connect(
      {
        host: approvedHostname,
        port: 443,
        servername: approvedHostname,
        rejectUnauthorized: true,
        timeout: 15_000,
      },
      () => {
        try {
          const certificate = socket.getPeerCertificate(true);
          const san =
            typeof certificate?.subjectaltname === 'string' ? certificate.subjectaltname : '';
          const validTo = safeTimestamp(certificate?.valid_to);
          const protocol = socket.getProtocol();
          const passed =
            socket.authorized === true &&
            san.toLowerCase().includes(approvedHostname) &&
            validTo !== null &&
            Date.parse(validTo) > Date.now() + 7 * 24 * 60 * 60 * 1_000 &&
            ['TLSv1.2', 'TLSv1.3'].includes(protocol);
          socket.end();
          resolvePromise({
            passed,
            protocol,
            validTo,
            certificateDigest: boundedHash(
              certificate?.fingerprint256 ?? certificate?.fingerprint ?? 'missing',
            ),
            issuerDigest: boundedHash(JSON.stringify(certificate?.issuer ?? {})),
            hostnameCovered: san.toLowerCase().includes(approvedHostname),
          });
        } catch (error) {
          socket.destroy();
          rejectPromise(error);
        }
      },
    );
    socket.on('timeout', () => socket.destroy(new Error('tls_timeout')));
    socket.on('error', rejectPromise);
  });
}

function noPrivateLeakage(text) {
  return !/(database_url|cloudflare_api_token|private submission|storage key|signed url|contact email|session cookie)/i.test(
    text,
  );
}

async function verifyExternal(p6Receipt) {
  const dnsResult = await observeDns();
  if (!dnsResult.passed) throw new Error('dns_continuity_failed');
  const tlsResult = await observeTls();
  if (!tlsResult.passed) throw new Error('tls_continuity_failed');

  const redirect = await fetch(`http://${approvedHostname}/?p6_06_continuity=${Date.now()}`, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const location = redirect.headers.get('location');
  if (
    ![301, 302, 307, 308].includes(redirect.status) ||
    typeof location !== 'string' ||
    !location.startsWith(`https://${approvedHostname}/`)
  ) {
    throw new Error(`http_redirect_invalid_${redirect.status}`);
  }

  const routeResults = [];
  for (const [path, expectedStatus, expectedType] of publicRoutes) {
    const response = await fetch(
      `https://${approvedHostname}${path}?p6_06_continuity=${Date.now()}-${Math.random()}`,
      { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20_000) },
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? null;
    const text = new TextDecoder().decode(bytes).slice(0, 32_768);
    if (response.status !== expectedStatus) {
      throw new Error(`route_status_${path}_${response.status}`);
    }
    if (contentType !== expectedType) throw new Error(`route_type_${path}_${contentType}`);
    if (!noPrivateLeakage(text)) throw new Error(`route_private_leakage_${path}`);
    routeResults.push({
      path,
      status: response.status,
      contentType,
      bodyDigest: sha256(bytes),
    });
  }

  const markerResponse = await fetch(
    `https://${approvedHostname}/p6-05-release.json?p6_06_continuity_marker=${Date.now()}`,
    { cache: 'no-store', signal: AbortSignal.timeout(20_000) },
  );
  if (markerResponse.status !== 200) {
    throw new Error(`release_marker_status_${markerResponse.status}`);
  }
  const marker = await markerResponse.json();
  const expectedReleaseId = p6Receipt?.checks?.releases?.candidate?.releaseId;
  if (typeof expectedReleaseId !== 'string' || marker?.releaseId !== expectedReleaseId) {
    throw new Error('active_release_identity_mismatch');
  }

  return {
    status: 'passed',
    dns: dnsResult,
    tls: tlsResult,
    redirect: { status: redirect.status, locationDigest: boundedHash(location) },
    routeCount: routeResults.length,
    routeDigest: boundedHash(routeResults),
    releaseId: expectedReleaseId,
  };
}

async function runContinuity({
  statusRoot,
  outputPath,
  commit,
  confirmation,
  owner,
  workflowRunId = null,
  repositoryContract = false,
  now = new Date(),
  observeExternal = verifyExternal,
}) {
  const predecessors = validCommit(commit)
    ? predecessorPaths.map(([id, path]) => readPredecessor(statusRoot, id, path, commit, now))
    : predecessorPaths.map(([id, path]) => ({
        evidenceId: id,
        path,
        state: 'failed',
        generatedAt: null,
        expiresAt: null,
        binding: null,
        receipt: null,
      }));
  const binding = sharedBinding(predecessors);
  const diagnostic = validCommit(commit)
    ? readDiagnostic(statusRoot, commit, now)
    : { path: diagnosticPath, state: 'failed', decision: null, digest: null };
  const prior = validCommit(commit)
    ? readPriorAccepted(statusRoot, commit, now)
    : { state: 'failed', digest: null, rollbackDigest: null, finalRestoreDigest: null };
  const p6Receipt = predecessors.find((item) => item.evidenceId === 'P6-05')?.receipt ?? null;
  const checks = {
    exactMain: validCommit(commit) ? 'success' : 'failed',
    confirmation: confirmation === exactConfirmation ? 'success' : 'failed',
    hostname: { status: 'success', digest: boundedHash(approvedHostname) },
    owner: validOperator(owner) ? 'success' : 'failed',
    repositoryContract: repositoryContract ? 'success' : 'failed',
    predecessors: predecessors.map(({ binding: _binding, receipt: _receipt, ...item }) => item),
    predecessorBinding: binding === null ? 'failed' : 'matched',
    diagnostic,
    continuity: {
      status: prior.state === 'authenticated_prior' ? 'prior_authenticated' : 'failed',
      previousCommitDigest: validCommit(prior.commit) ? boundedHash(prior.commit) : null,
      previousGeneratedAt: prior.generatedAt ?? null,
      previousReceiptDigest: prior.digest,
      previousRollbackDigest: prior.rollbackDigest,
      previousFinalRestoreDigest: prior.finalRestoreDigest,
    },
    duplicate: { status: 'not_run', reused: false },
    preState: { status: 'not_run', digest: null, recheckMatched: false },
    cutover: { status: 'not_run', providerDigest: diagnostic.digest },
    externalCutover: { status: 'not_run' },
    rollback: { status: 'not_run', evidenceSource: null, evidenceDigest: null },
    externalRollback: { status: 'not_run', evidenceSource: null, evidenceDigest: null },
    finalRestore: { status: 'not_run', evidenceSource: null, evidenceDigest: null },
    externalFinal: { status: 'not_run' },
  };
  const exceptions = [];
  const preconditions =
    checks.exactMain === 'success' &&
    checks.confirmation === 'success' &&
    checks.owner === 'success' &&
    checks.repositoryContract === 'success' &&
    predecessors.every((item) => item.state === 'current') &&
    binding !== null &&
    diagnostic.state === 'current_existing_candidate' &&
    prior.state === 'authenticated_prior';

  let state = 'failed';
  if (!preconditions) {
    exceptions.push('preconditions:failed');
  } else {
    try {
      const external = await observeExternal(p6Receipt);
      if (external?.status !== 'passed') throw new Error('external_continuity_failed');
      checks.duplicate = { status: 'passed', reused: true };
      checks.preState = {
        status: 'existing_final',
        digest: diagnostic.digest,
        recheckMatched: true,
      };
      checks.cutover = { status: 'existing', providerDigest: diagnostic.digest };
      checks.externalCutover = {
        status: 'passed',
        evidenceSource: 'current_external_revalidation',
        evidenceDigest: boundedHash(external),
      };
      checks.rollback = {
        status: 'passed',
        evidenceSource: 'prior_accepted_receipt',
        evidenceDigest: prior.rollbackDigest,
      };
      checks.externalRollback = {
        status: 'passed',
        evidenceSource: 'prior_accepted_receipt',
        evidenceDigest: prior.rollbackDigest,
      };
      checks.finalRestore = {
        status: 'passed',
        evidenceSource: 'prior_accepted_receipt',
        evidenceDigest: prior.finalRestoreDigest,
      };
      checks.externalFinal = external;
      state = 'accepted';
    } catch (error) {
      exceptions.push(`execution:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const generatedAt = now.toISOString();
  const receipt = {
    version: 1,
    evidenceId,
    launchDomain: 'domain_cutover_rollback',
    environment: 'configured_staging',
    state: state === 'accepted' && exceptions.length === 0 ? 'accepted' : 'failed',
    commit: validCommit(commit) ? commit : null,
    generatedAt,
    expiresAt: new Date(now.getTime() + expiryHours * 60 * 60 * 1_000).toISOString(),
    workflowRunId,
    owner: validOperator(owner) ? boundedHash(owner.trim()) : null,
    procedure: 'OPS-P6-001R configured staging P6-06 continuity revalidation',
    checks,
    ...(binding === null ? {} : { binding }),
    exceptions: [...new Set(exceptions)].sort(),
  };
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Self-test failed: ${message}`);
}

function writeFixture(root, relativePath, value) {
  const absolutePath = resolve(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-06-continuity-'));
  const commit = 'b'.repeat(40);
  const priorCommit = 'a'.repeat(40);
  const now = new Date('2026-08-03T03:00:00.000Z');
  const expiresAt = '2026-08-05T03:00:00.000Z';
  const binding = {
    releaseId: `sha256:${'1'.repeat(64)}`,
    dataSnapshotId: `sha256:${'2'.repeat(64)}`,
    configurationId: `sha256:${'3'.repeat(64)}`,
    environmentId: `sha256:${'4'.repeat(64)}`,
  };
  try {
    for (const [id, path] of predecessorPaths) {
      writeFixture(root, path, {
        version: 1,
        evidenceId: id,
        environment: 'configured_staging',
        state: 'accepted',
        commit,
        generatedAt: '2026-08-03T02:00:00.000Z',
        expiresAt,
        binding,
        checks:
          id === 'P6-05'
            ? { releases: { candidate: { releaseId: 'sha256:current-release' } } }
            : {},
      });
    }
    writeFixture(root, diagnosticPath, {
      version: 1,
      evidenceId: 'P6-06-DIAGNOSTIC',
      environment: 'configured_staging',
      state: 'diagnosed',
      decision: 'existing_candidate_requires_approval',
      commit,
      generatedAt: '2026-08-03T02:30:00.000Z',
      expiresAt,
      checks: {
        permissions: { dnsList: 'success' },
        topology: {
          projectSafe: true,
          zoneMatchesExpected: true,
          platformDomainPresent: true,
          platformDomainMatches: true,
        },
        inventory: {
          selectedZoneCount: 1,
          projectCustomDomainCount: 1,
          candidateCount: 1,
        },
      },
      exceptions: [],
    });
    writeFixture(root, acceptedReceiptPath, {
      version: 1,
      evidenceId,
      environment: 'configured_staging',
      state: 'accepted',
      commit: priorCommit,
      generatedAt: '2026-08-02T17:15:00.000Z',
      expiresAt,
      checks: {
        hostname: { digest: boundedHash(approvedHostname) },
        cutover: { status: 'passed' },
        externalCutover: { status: 'passed' },
        rollback: { status: 'passed' },
        externalRollback: { status: 'passed' },
        finalRestore: { status: 'passed' },
        externalFinal: { status: 'passed' },
      },
      binding: {
        releaseId: `sha256:${'5'.repeat(64)}`,
        dataSnapshotId: `sha256:${'6'.repeat(64)}`,
        configurationId: `sha256:${'7'.repeat(64)}`,
        environmentId: `sha256:${'8'.repeat(64)}`,
      },
      exceptions: [],
    });

    const outputPath = resolve(root, 'output.json');
    const accepted = await runContinuity({
      statusRoot: root,
      outputPath,
      commit,
      confirmation: exactConfirmation,
      owner: 'continuity-test-owner',
      workflowRunId: 'self-test',
      repositoryContract: true,
      now,
      observeExternal: async () => ({
        status: 'passed',
        dns: { passed: true },
        tls: { passed: true },
        routeCount: 11,
        releaseId: 'sha256:current-release',
      }),
    });
    assert(accepted.state === 'accepted', 'safe continuity must be accepted');
    assert(accepted.checks.duplicate.reused === true, 'existing topology must be reused');
    assert(
      accepted.checks.rollback.evidenceSource === 'prior_accepted_receipt',
      'rollback proof must remain attributed to the prior receipt',
    );
    assert(accepted.binding.releaseId === binding.releaseId, 'current binding must be retained');
    const serialized = JSON.stringify(accepted);
    assert(!serialized.includes(priorCommit), 'raw prior commit must not be retained');
    assert(!serialized.includes(approvedHostname), 'raw hostname must not be retained');

    const diagnostic = readJson(root, diagnosticPath);
    diagnostic.checks.inventory.candidateCount = 2;
    writeFixture(root, diagnosticPath, diagnostic);
    const failed = await runContinuity({
      statusRoot: root,
      outputPath,
      commit,
      confirmation: exactConfirmation,
      owner: 'continuity-test-owner',
      repositoryContract: true,
      now,
      observeExternal: async () => ({ status: 'passed' }),
    });
    assert(failed.state === 'failed', 'ambiguous candidate inventory must fail');
    assert(failed.exceptions.includes('preconditions:failed'), 'failure must be fail-closed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log('OPS-P6-001R configured staging P6-06 continuity self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }
  const statusRoot = process.argv[2];
  const outputPath = process.argv[3];
  if (!statusRoot || !outputPath || !existsSync(statusRoot)) {
    throw new Error('Usage: node script.mjs <status-root> <output-path>');
  }
  const receipt = await runContinuity({
    statusRoot,
    outputPath,
    commit: process.env.APPROVED_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    owner: process.env.DOMAIN_OWNER ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    repositoryContract: process.env.REPOSITORY_CONTRACT_OUTCOME === 'success',
  });
  console.log(`OPS-P6-001R receipt state: ${receipt.state}`);
  if (receipt.state !== 'accepted') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { readDiagnostic, readPriorAccepted, runContinuity };
