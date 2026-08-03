import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'DIAGNOSE_CONFIGURED_STAGING_P6_07';
const approvedHostname = 'staging.cryptopaymap.com';
const predecessorSpecs = Object.freeze(
  ['P6-01', 'P6-02', 'P6-03', 'P6-04', 'P6-05', 'P6-06'].map((evidenceId) => ({
    evidenceId,
    path:
      evidenceId === 'P6-01'
        ? 'config/staging-authorization/p6-01-data-qa-receipt.json'
        : evidenceId === 'P6-02'
          ? 'config/staging-authorization/p6-02-identity-admin-receipt.json'
          : evidenceId === 'P6-03'
            ? 'config/staging-authorization/p6-03-neon-transaction-receipt.json'
            : evidenceId === 'P6-04'
              ? 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'
              : evidenceId === 'P6-05'
                ? 'config/staging-authorization/p6-05-public-export-release-receipt.json'
                : 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json',
  })),
);
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];

function hash(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(root, relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) return { state: 'missing', value: null };
  try {
    const value = JSON.parse(readFileSync(absolutePath, 'utf8'));
    return isObject(value) ? { state: 'parsed', value } : { state: 'invalid', value: null };
  } catch {
    return { state: 'invalid', value: null };
  }
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function boundedOwner(value) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 100) {
    throw new Error('OPERATIONS_OWNER must be a bounded non-empty identity.');
  }
  return value.trim();
}

function validatePredecessor(root, spec, approvedCommit, now) {
  const loaded = readJson(root, spec.path);
  if (loaded.state !== 'parsed') {
    return {
      evidenceId: spec.evidenceId,
      path: spec.path,
      state: loaded.state,
      generatedAt: null,
      expiresAt: null,
      binding: null,
    };
  }

  const receipt = loaded.value;
  const generatedAt = validTimestamp(receipt.generatedAt) ? receipt.generatedAt : null;
  const expiresAt = validTimestamp(receipt.expiresAt) ? receipt.expiresAt : null;
  const binding = isObject(receipt.binding) ? receipt.binding : null;
  const bindingValid =
    binding !== null &&
    bindingKeys.every(
      (key) => typeof binding[key] === 'string' && binding[key].startsWith('sha256:'),
    );
  const p606Valid =
    spec.evidenceId !== 'P6-06' ||
    (receipt.checks?.externalFinal?.status === 'passed' &&
      Array.isArray(receipt.exceptions) &&
      receipt.exceptions.length === 0);

  let state = 'failed';
  if (
    receipt.version === 1 &&
    receipt.evidenceId === spec.evidenceId &&
    receipt.environment === 'configured_staging' &&
    receipt.state === 'accepted' &&
    receipt.commit === approvedCommit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    bindingValid &&
    p606Valid
  ) {
    state = 'current';
  } else if (expiresAt !== null && Date.parse(expiresAt) <= now.getTime()) {
    state = 'stale';
  }

  return {
    evidenceId: spec.evidenceId,
    path: spec.path,
    state,
    generatedAt,
    expiresAt,
    binding:
      state === 'current'
        ? Object.fromEntries(bindingKeys.map((key) => [key, binding[key]]))
        : null,
  };
}

function bindingsMatch(predecessors) {
  if (!predecessors.every((item) => item.state === 'current')) return false;
  const first = JSON.stringify(predecessors[0].binding);
  return predecessors.every((item) => JSON.stringify(item.binding) === first);
}

async function externalCheck(fetchImpl, path, expectedStatuses, expectedType) {
  const response = await fetchImpl(`https://${approvedHostname}${path}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    headers: { 'user-agent': 'CryptoPayMap-P6-07-Prerequisite-Diagnostic/1' },
  });
  const body = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const statusAccepted = expectedStatuses.includes(response.status);
  const typeAccepted = expectedType === null || contentType.toLowerCase().includes(expectedType);
  return {
    status: statusAccepted && typeAccepted ? 'passed' : 'failed',
    httpStatus: response.status,
    contentTypeClass: contentType.split(';')[0].trim().toLowerCase() || 'missing',
    bodyDigest: hash(body),
    byteLength: Buffer.byteLength(body),
  };
}

function inspectConfiguration(env) {
  const source = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL : '';
  const restore =
    typeof env.P6_07_RESTORE_DATABASE_URL === 'string' ? env.P6_07_RESTORE_DATABASE_URL : '';
  const encryptionKey =
    typeof env.P6_07_BACKUP_ENCRYPTION_KEY === 'string' ? env.P6_07_BACKUP_ENCRYPTION_KEY : '';
  const issueNumber = Number.parseInt(env.P6_07_ALERT_ISSUE_NUMBER ?? '', 10);
  const retentionDays = Number.parseInt(env.P6_07_BACKUP_RETENTION_DAYS ?? '', 10);

  return {
    sourceDatabase: {
      status: source.length > 0 ? 'configured' : 'missing',
      digest: source.length > 0 ? hash(source) : null,
    },
    isolatedRestoreDatabase: {
      status: restore.length > 0 ? 'configured' : 'missing',
      digest: restore.length > 0 ? hash(restore) : null,
      distinctFromSource:
        source.length > 0 && restore.length > 0 ? hash(source) !== hash(restore) : false,
    },
    backupEncryption: {
      status: encryptionKey.length >= 32 ? 'configured' : 'missing_or_too_short',
      digest: encryptionKey.length >= 32 ? hash(encryptionKey) : null,
    },
    alertEvidenceIssue: {
      status:
        Number.isInteger(issueNumber) && issueNumber > 0 ? 'configured' : 'missing_or_invalid',
      issueNumber: Number.isInteger(issueNumber) && issueNumber > 0 ? issueNumber : null,
    },
    backupRetention: {
      status:
        Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 90
          ? 'configured'
          : 'missing_or_invalid',
      days:
        Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 90
          ? retentionDays
          : null,
    },
  };
}

export async function runDiagnostic({
  statusRoot,
  approvedCommit,
  confirmation,
  operationsOwner,
  workflowRunId = null,
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
}) {
  if (confirmation !== exactConfirmation) {
    throw new Error(`Exact confirmation ${exactConfirmation} is required.`);
  }
  if (!/^[a-f0-9]{40}$/.test(approvedCommit)) {
    throw new Error('APPROVED_COMMIT must be an exact lowercase 40-character SHA.');
  }

  const predecessors = predecessorSpecs.map((spec) =>
    validatePredecessor(statusRoot, spec, approvedCommit, now),
  );
  const predecessorBinding = bindingsMatch(predecessors);
  const external = {
    home: await externalCheck(fetchImpl, '/', [200], 'text/html'),
    version: await externalCheck(fetchImpl, '/version.json', [200], 'application/json'),
    manifest: await externalCheck(fetchImpl, '/data/manifest.json', [200], 'application/json'),
    adminDenial: await externalCheck(fetchImpl, '/admin/api/dashboard', [401, 403], null),
  };
  const configuration = inspectConfiguration(env);

  const evidenceBlockers = [];
  for (const item of predecessors) {
    if (item.state !== 'current') evidenceBlockers.push(`${item.evidenceId}:${item.state}`);
  }
  if (predecessors.every((item) => item.state === 'current') && !predecessorBinding) {
    evidenceBlockers.push('predecessor_binding:mismatch');
  }
  for (const [name, result] of Object.entries(external)) {
    if (result.status !== 'passed') evidenceBlockers.push(`external_${name}:failed`);
  }

  const configurationBlockers = [];
  if (configuration.sourceDatabase.status !== 'configured') {
    configurationBlockers.push('source_database:missing');
  }
  if (configuration.isolatedRestoreDatabase.status !== 'configured') {
    configurationBlockers.push('isolated_restore_database:missing');
  } else if (!configuration.isolatedRestoreDatabase.distinctFromSource) {
    configurationBlockers.push('isolated_restore_database:not_distinct');
  }
  if (configuration.backupEncryption.status !== 'configured') {
    configurationBlockers.push('backup_encryption:missing');
  }
  if (configuration.alertEvidenceIssue.status !== 'configured') {
    configurationBlockers.push('alert_evidence_issue:missing');
  }
  if (configuration.backupRetention.status !== 'configured') {
    configurationBlockers.push('backup_retention:missing');
  }

  evidenceBlockers.sort();
  configurationBlockers.sort();
  const decision =
    evidenceBlockers.length > 0
      ? 'evidence_blocked'
      : configurationBlockers.length > 0
        ? 'configuration_blocked'
        : 'ready';
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return {
    version: 1,
    diagnosticId: hash(
      ['configured_staging', 'P6-07', approvedCommit, workflowRunId ?? 'manual', generatedAt].join(
        ':',
      ),
    ),
    evidenceId: 'P6-07',
    diagnostic: 'prerequisite_inventory',
    environment: 'configured_staging',
    state: 'diagnosed',
    decision,
    commit: approvedCommit,
    generatedAt,
    expiresAt,
    workflowRunId,
    owner: hash(boundedOwner(operationsOwner)),
    checks: {
      exactMain: env.REPOSITORY_CONTRACT_OUTCOME === 'success' ? 'success' : 'unproven',
      predecessors: predecessors.map(({ binding, ...item }) => item),
      predecessorBinding: predecessorBinding ? 'matched' : 'unproven',
      external,
      configuration,
    },
    ...(predecessorBinding ? { binding: predecessors[0].binding } : {}),
    blockers: [...evidenceBlockers, ...configurationBlockers],
    exceptions: [],
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Self-test failed: ${message}`);
}

function writeFixture(root, spec, commit, binding, expiresAt) {
  const value = {
    version: 1,
    evidenceId: spec.evidenceId,
    environment: 'configured_staging',
    state: 'accepted',
    commit,
    generatedAt: '2026-08-03T00:00:00.000Z',
    expiresAt,
    binding,
    checks: spec.evidenceId === 'P6-06' ? { externalFinal: { status: 'passed' } } : {},
    exceptions: [],
  };
  const absolutePath = resolve(root, spec.path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fakeFetch(url) {
  const path = new URL(url).pathname;
  const admin = path === '/admin/api/dashboard';
  const body = admin
    ? 'Forbidden'
    : path.endsWith('.json')
      ? '{}'
      : '<!doctype html><title>CPM</title>';
  return Promise.resolve({
    status: admin ? 403 : 200,
    headers: {
      get: () => (admin ? 'text/plain' : path.endsWith('.json') ? 'application/json' : 'text/html'),
    },
    text: async () => body,
  });
}

async function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-07-q1-'));
  const commit = 'a'.repeat(40);
  const binding = Object.fromEntries(
    bindingKeys.map((key) => [key, `sha256:${key.padEnd(64, 'a').slice(0, 64)}`]),
  );
  const now = new Date('2026-08-03T01:00:00.000Z');
  const expiresAt = '2026-08-04T01:00:00.000Z';
  try {
    for (const spec of predecessorSpecs) writeFixture(root, spec, commit, binding, expiresAt);
    const common = {
      statusRoot: root,
      approvedCommit: commit,
      confirmation: exactConfirmation,
      operationsOwner: 'configured-staging-operations-owner',
      workflowRunId: 'self-test',
      fetchImpl: fakeFetch,
      now,
      env: {
        REPOSITORY_CONTRACT_OUTCOME: 'success',
        DATABASE_URL: 'postgresql://source.example.invalid/db',
        P6_07_RESTORE_DATABASE_URL: 'postgresql://restore.example.invalid/db',
        P6_07_BACKUP_ENCRYPTION_KEY: 'x'.repeat(32),
        P6_07_ALERT_ISSUE_NUMBER: '349',
        P6_07_BACKUP_RETENTION_DAYS: '30',
      },
    };

    const ready = await runDiagnostic(common);
    assert(ready.state === 'diagnosed', 'diagnostic state must be diagnosed');
    assert(ready.decision === 'ready', 'complete safe inputs must be ready');
    assert(ready.blockers.length === 0, 'ready diagnostic must have no blockers');
    const serialized = JSON.stringify(ready);
    assert(!serialized.includes('postgresql://'), 'connection strings must not be retained');
    assert(!serialized.includes('x'.repeat(32)), 'encryption key must not be retained');

    const unsafeRestore = await runDiagnostic({
      ...common,
      env: { ...common.env, P6_07_RESTORE_DATABASE_URL: common.env.DATABASE_URL },
    });
    assert(
      unsafeRestore.decision === 'configuration_blocked',
      'source and restore identity collision must block configuration',
    );
    assert(
      unsafeRestore.blockers.includes('isolated_restore_database:not_distinct'),
      'identity collision blocker must be retained',
    );

    rmSync(resolve(root, predecessorSpecs[5].path));
    const missingEvidence = await runDiagnostic(common);
    assert(missingEvidence.decision === 'evidence_blocked', 'missing P6-06 must block evidence');
    assert(missingEvidence.blockers.includes('P6-06:missing'), 'missing P6-06 must be named');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log('OPS-P6-001Q configured staging P6-07 prerequisite diagnostic self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }
  const statusRoot = process.argv[2];
  const outputPath = process.argv[3];
  if (!statusRoot || !outputPath) {
    throw new Error('Usage: node script.mjs <status-root> <output-path>');
  }
  const receipt = await runDiagnostic({
    statusRoot,
    approvedCommit: process.env.APPROVED_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    operationsOwner: process.env.OPERATIONS_OWNER ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
  });
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
