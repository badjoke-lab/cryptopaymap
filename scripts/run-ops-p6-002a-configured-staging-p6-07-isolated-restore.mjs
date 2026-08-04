import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_07_Q4';
const receiptPath = 'config/staging-authorization/p6-07-isolated-restore-receipt.json';
const prerequisitePath = 'config/staging-authorization/p6-07-prerequisite-diagnostic.json';
const q2Path = 'config/staging-authorization/p6-07-monitoring-alert-receipt.json';
const q3Path = 'config/staging-authorization/p6-07-backup-integrity-receipt.json';
const expiryDays = 30;
const targetNamePattern = /^cpm_p6_07_restore_[a-z0-9_]{4,48}$/;
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const predecessorPaths = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
  ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
  ['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json'],
  ['P6-06', 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json'],
];
const privateSubmissionTables = [
  'submissions',
  'submission_payloads',
  'submission_contacts',
  'submission_media',
  'submission_events',
  'submission_decisions',
];
const excludedScope = [
  'submission_private_payload_data',
  'submission_private_contact_data',
  'credentials_and_secrets',
  'unrestricted_logs',
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

function validDigest(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validOwner(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
}

function validDatabaseUrl(value) {
  if (typeof value !== 'string' || value.length < 20) return false;
  try {
    const url = new URL(value);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      Boolean(url.pathname.slice(1))
    );
  } catch {
    return false;
  }
}

function boundedPositiveInteger(value, minimum = 1, maximum = 43_200) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function safeException(error) {
  const value = error instanceof Error ? error.message : String(error);
  if (/artifact_digest_mismatch/.test(value)) return 'artifact_digest_mismatch';
  if (/artifact|envelope/.test(value)) return 'backup_artifact_failed';
  if (/decrypt|auth|cipher/.test(value)) return 'backup_integrity_failed';
  if (/inventory/.test(value)) return 'backup_inventory_failed';
  if (/same_database/.test(value)) return 'same_database_identity';
  if (/target_name/.test(value)) return 'restore_target_name_failed';
  if (/non_empty_target/.test(value)) return 'restore_target_not_empty';
  if (/restore_execution/.test(value)) return 'restore_execution_failed';
  if (/schema/.test(value)) return 'restore_schema_mismatch';
  if (/private_rows/.test(value)) return 'private_rows_restored';
  if (/row_count|table_set|constraint|representative/.test(value))
    return 'restore_reconciliation_failed';
  if (/rpo/.test(value)) return 'rpo_objective_breached';
  if (/rto/.test(value)) return 'rto_objective_breached';
  if (/target_disposal/.test(value)) return 'target_disposal_failed';
  return 'isolated_restore_failed';
}

function readJson(root, relativePath) {
  try {
    const value = JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readPredecessor(statusRoot, evidenceId, relativePath, commit, now) {
  const receipt = readJson(statusRoot, relativePath);
  const generatedAt = validTimestamp(receipt?.generatedAt) ? receipt.generatedAt : null;
  const expiresAt = validTimestamp(receipt?.expiresAt) ? receipt.expiresAt : null;
  const binding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingValid = binding !== null && bindingKeys.every((key) => validDigest(binding[key]));
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === evidenceId &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    bindingValid &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  return {
    evidenceId,
    path: relativePath,
    state: current ? 'current' : receipt === null ? 'missing' : 'failed',
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

function bindingMatches(receipt, binding) {
  const candidate = isObject(receipt?.binding) ? receipt.binding : null;
  return (
    binding !== null &&
    candidate !== null &&
    bindingKeys.every((key) => candidate[key] === binding[key])
  );
}

function readQ1(statusRoot, commit, binding, now) {
  const receipt = readJson(statusRoot, prerequisitePath);
  const generatedAt = validTimestamp(receipt?.generatedAt) ? receipt.generatedAt : null;
  const expiresAt = validTimestamp(receipt?.expiresAt) ? receipt.expiresAt : null;
  const blockers = Array.isArray(receipt?.blockers)
    ? receipt.blockers.filter((value) => typeof value === 'string').sort()
    : [];
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-07' &&
    receipt?.diagnostic === 'prerequisite_inventory' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'diagnosed' &&
    ['ready', 'configuration_blocked'].includes(receipt?.decision) &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    bindingMatches(receipt, binding) &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  return {
    path: prerequisitePath,
    state: current ? 'current' : receipt === null ? 'missing' : 'failed',
    decision: receipt?.decision ?? null,
    generatedAt,
    expiresAt,
    digest: current ? boundedHash(JSON.stringify(receipt)) : null,
    blockers,
    configuration:
      current && isObject(receipt?.checks?.configuration) ? receipt.checks.configuration : null,
  };
}

function readQ2(statusRoot, commit, binding, now) {
  const receipt = readJson(statusRoot, q2Path);
  const generatedAt = validTimestamp(receipt?.generatedAt) ? receipt.generatedAt : null;
  const expiresAt = validTimestamp(receipt?.expiresAt) ? receipt.expiresAt : null;
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-07-Q2' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    receipt?.checks?.liveMonitoring?.status === 'passed' &&
    receipt?.checks?.syntheticFailures?.status === 'passed' &&
    receipt?.checks?.alertExercise?.status === 'passed' &&
    bindingMatches(receipt, binding) &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  return {
    path: q2Path,
    state: current ? 'current' : receipt === null ? 'missing' : 'failed',
    generatedAt,
    expiresAt,
    digest: current ? boundedHash(JSON.stringify(receipt)) : null,
  };
}

function readQ3(statusRoot, commit, binding, now) {
  const receipt = readJson(statusRoot, q3Path);
  const generatedAt = validTimestamp(receipt?.generatedAt) ? receipt.generatedAt : null;
  const expiresAt = validTimestamp(receipt?.expiresAt) ? receipt.expiresAt : null;
  const backup = receipt?.checks?.backup;
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-07-Q3' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    /^\d+$/.test(receipt?.workflowRunId ?? '') &&
    backup?.status === 'passed' &&
    backup?.artifact?.encrypted === true &&
    backup?.artifact?.format === 'pg_dump_custom_encrypted_json_envelope' &&
    backup?.artifact?.algorithm === 'aes-256-gcm' &&
    validDigest(backup?.artifact?.digest) &&
    validDigest(backup?.artifact?.plaintextDigest) &&
    backup?.inventory?.status === 'passed' &&
    validDigest(backup?.inventory?.digest) &&
    Number.isInteger(backup?.inventory?.objectCount) &&
    backup.inventory.objectCount > 0 &&
    validDigest(backup?.schemaRevision) &&
    backup?.encryption?.status === 'passed' &&
    backup?.integrity?.status === 'passed' &&
    backup?.integrity?.decryptVerified === true &&
    backup?.integrity?.digestMatched === true &&
    backup?.integrity?.inventoryMatched === true &&
    backup?.integrity?.corruptionRejected === true &&
    bindingMatches(receipt, binding) &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  return {
    path: q3Path,
    state: current ? 'current' : receipt === null ? 'missing' : 'failed',
    generatedAt,
    expiresAt,
    digest: current ? boundedHash(JSON.stringify(receipt)) : null,
    workflowRunId: current ? receipt.workflowRunId : null,
    backup: current ? backup : null,
  };
}

function schemaRevision(sourceRoot) {
  const candidates = [
    'drizzle/meta/_journal.json',
    'drizzle.config.ts',
    'scripts/materialize-drizzle-snapshot.mjs',
  ];
  const material = candidates
    .filter((path) => existsSync(resolve(sourceRoot, path)))
    .map((path) => `${path}\n${readFileSync(resolve(sourceRoot, path), 'utf8')}`);
  if (material.length === 0) throw new Error('schema_revision_missing');
  return boundedHash(material.join('\n---\n'));
}

function loadExpectedSchema(sourceRoot) {
  const journal = JSON.parse(
    readFileSync(resolve(sourceRoot, 'drizzle/meta/_journal.json'), 'utf8'),
  );
  const entries = Array.isArray(journal?.entries) ? journal.entries : [];
  const tag = entries.at(-1)?.tag;
  if (typeof tag !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tag)) {
    throw new Error('schema_snapshot_missing');
  }
  const snapshot = JSON.parse(
    readFileSync(resolve(sourceRoot, `drizzle/meta/${tag}_snapshot.json`), 'utf8'),
  );
  const tables = isObject(snapshot?.tables) ? snapshot.tables : {};
  const expectedTables = Object.keys(tables)
    .filter((key) => key.startsWith('public.'))
    .map((key) => key.slice('public.'.length))
    .sort();
  const expectedForeignKeyCount = Object.values(tables).reduce(
    (total, table) => total + Object.keys(table?.foreignKeys ?? {}).length,
    0,
  );
  const expectedCheckCount = Object.values(tables).reduce(
    (total, table) => total + Object.keys(table?.checkConstraints ?? {}).length,
    0,
  );
  if (expectedTables.length === 0) throw new Error('schema_snapshot_missing');
  return { tag, expectedTables, expectedForeignKeyCount, expectedCheckCount };
}

function deriveKey(secret) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encryptBuffer(buffer, secret, metadata) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(metadata), 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    metadata,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptEnvelope(envelope, secret) {
  if (
    envelope?.version !== 1 ||
    envelope?.algorithm !== 'aes-256-gcm' ||
    !isObject(envelope?.metadata) ||
    typeof envelope?.iv !== 'string' ||
    typeof envelope?.tag !== 'string' ||
    typeof envelope?.ciphertext !== 'string'
  ) {
    throw new Error('backup_envelope_invalid');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(JSON.stringify(envelope.metadata), 'utf8'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
}

function parseInventory(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(';'));
  const normalized = lines.slice().sort();
  if (lines.length === 0) throw new Error('backup_inventory_failed');
  return { objectCount: lines.length, digest: boundedHash(normalized.join('\n')) };
}

function buildPgEnvironment(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
    PGCONNECT_TIMEOUT: '20',
  };
}

function runPsql(databaseUrl, sql) {
  return execFileSync(
    'psql',
    ['--no-psqlrc', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', sql],
    {
      env: buildPgEnvironment(databaseUrl),
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim();
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('unsafe_identifier');
  return `"${value}"`;
}

function normalizeSchemaDump(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^-- Dumped (from|by)/.test(line))
    .filter((line) => !/^\\(un)?restrict\b/.test(line))
    .join('\n')
    .trim();
}

function actualList(buffer, root) {
  const plainPath = join(root, 'backup.dump');
  writeFileSync(plainPath, buffer);
  try {
    return execFileSync('pg_restore', ['--list', plainPath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    rmSync(plainPath, { force: true });
  }
}

function createActualDbOps(root) {
  return {
    identity(databaseUrl) {
      return runPsql(
        databaseUrl,
        "select current_database() || '|' || current_user || '|' || coalesce(inet_server_addr()::text, 'local') || '|' || coalesce(inet_server_port()::text, 'local')",
      );
    },
    databaseName(databaseUrl) {
      return runPsql(databaseUrl, 'select current_database()');
    },
    countUserObjects(databaseUrl) {
      return Number(
        runPsql(
          databaseUrl,
          "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_toast' and c.relkind in ('r','p','v','m','S','f')",
        ),
      );
    },
    listTables(databaseUrl) {
      const value = runPsql(
        databaseUrl,
        "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
      );
      return value.length === 0 ? [] : value.split(/\r?\n/).filter(Boolean);
    },
    rowCounts(databaseUrl, tables) {
      return Object.fromEntries(
        tables.map((table) => [
          table,
          Number(runPsql(databaseUrl, `select count(*) from public.${quoteIdentifier(table)}`)),
        ]),
      );
    },
    schemaDigest(databaseUrl) {
      const value = execFileSync('pg_dump', ['--schema-only', '--no-owner', '--no-privileges'], {
        env: buildPgEnvironment(databaseUrl),
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return boundedHash(normalizeSchemaDump(value));
    },
    invalidConstraintCount(databaseUrl) {
      return Number(
        runPsql(
          databaseUrl,
          "select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.convalidated = false",
        ),
      );
    },
    foreignKeyCount(databaseUrl) {
      return Number(
        runPsql(
          databaseUrl,
          "select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'f'",
        ),
      );
    },
    checkConstraintCount(databaseUrl) {
      return Number(
        runPsql(
          databaseUrl,
          "select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'c'",
        ),
      );
    },
    restore(databaseUrl, buffer) {
      const plainPath = join(root, 'restore.dump');
      writeFileSync(plainPath, buffer);
      try {
        execFileSync(
          'pg_restore',
          ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', plainPath],
          {
            env: buildPgEnvironment(databaseUrl),
            encoding: 'utf8',
            maxBuffer: 128 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
      } catch {
        throw new Error('restore_execution_failed');
      } finally {
        rmSync(plainPath, { force: true });
      }
    },
    disposeTarget(databaseUrl) {
      runPsql(databaseUrl, 'drop schema if exists public cascade; create schema public');
      if (this.countUserObjects(databaseUrl) !== 0) throw new Error('target_disposal_failed');
    },
  };
}

function databaseIdentityFromUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  return boundedHash({
    host: url.hostname.toLowerCase(),
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
  });
}

function sameSortedValues(left, right) {
  return JSON.stringify(left.slice().sort()) === JSON.stringify(right.slice().sort());
}

function rowCountDigest(value) {
  return boundedHash(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([table, count]) => `${table}:${count}`)
      .join('\n'),
  );
}

function noSecretLeakage(value, secrets) {
  const text = JSON.stringify(value);
  return secrets.every(
    (secret) => typeof secret !== 'string' || secret.length === 0 || !text.includes(secret),
  );
}

function artifactReference(statusRoot, outputPath, env = process.env, now = new Date()) {
  const commit = env.APPROVED_COMMIT ?? '';
  const predecessors = predecessorPaths.map(([evidenceId, path]) =>
    readPredecessor(statusRoot, evidenceId, path, commit, now),
  );
  const binding = sharedBinding(predecessors);
  const q1 = readQ1(statusRoot, commit, binding, now);
  const q2 = readQ2(statusRoot, commit, binding, now);
  const q3 = readQ3(statusRoot, commit, binding, now);
  if (
    !validCommit(commit) ||
    binding === null ||
    q1.state !== 'current' ||
    q1.decision !== 'ready' ||
    q1.blockers.length !== 0 ||
    q2.state !== 'current' ||
    q3.state !== 'current'
  ) {
    throw new Error('artifact_reference_precondition_failed');
  }
  const reference = {
    version: 1,
    runId: q3.workflowRunId,
    artifactName: `ops-p6-001y-configured-staging-p6-07-encrypted-backup-${q3.workflowRunId}`,
    artifactFile: 'p6-07-q3-backup.enc.json',
    artifactDigest: q3.backup.artifact.digest,
    immutability: 'q3_run_scoped_artifact',
  };
  writeJson(outputPath, reference);
  return reference;
}

async function execute(
  statusRoot,
  artifactPath,
  outputPath,
  {
    now = new Date(),
    sourceRoot = process.cwd(),
    env = process.env,
    listImpl = actualList,
    dbOpsFactory = createActualDbOps,
    timer = () => performance.now(),
  } = {},
) {
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  const commit = env.APPROVED_COMMIT ?? '';
  const owner = env.RESTORE_OWNER ?? '';
  const sourceDatabaseUrl = env.DATABASE_URL ?? '';
  const restoreDatabaseUrl = env.P6_07_RESTORE_DATABASE_URL ?? '';
  const encryptionKey = env.P6_07_BACKUP_ENCRYPTION_KEY ?? '';
  const targetDatabaseName = env.RESTORE_TARGET_DATABASE_NAME ?? '';
  const rpoObjectiveMinutes = boundedPositiveInteger(env.RPO_OBJECTIVE_MINUTES);
  const rtoObjectiveMinutes = boundedPositiveInteger(env.RTO_OBJECTIVE_MINUTES, 1, 1_440);
  const predecessors = predecessorPaths.map(([evidenceId, path]) =>
    readPredecessor(statusRoot, evidenceId, path, commit, now),
  );
  const binding = sharedBinding(predecessors);
  const q1 = readQ1(statusRoot, commit, binding, now);
  const q2 = readQ2(statusRoot, commit, binding, now);
  const q3 = readQ3(statusRoot, commit, binding, now);
  const checks = {
    exactMain: validCommit(commit) ? 'success' : 'failed',
    confirmation: env.CONFIRMATION === exactConfirmation ? 'success' : 'failed',
    owner: validOwner(owner) ? 'success' : 'failed',
    repositoryContract: env.REPOSITORY_CONTRACT_OUTCOME === 'success' ? 'success' : 'failed',
    predecessors,
    predecessorBinding: binding === null ? 'failed' : 'matched',
    prerequisite: q1,
    q2,
    q3: { ...q3, backup: undefined },
    configuration: {
      sourceDatabase: validDatabaseUrl(sourceDatabaseUrl) ? 'configured' : 'missing',
      restoreDatabase: validDatabaseUrl(restoreDatabaseUrl) ? 'configured' : 'missing',
      backupEncryption: encryptionKey.length >= 32 ? 'configured' : 'missing_or_too_short',
      targetDatabaseName: targetNamePattern.test(targetDatabaseName) ? 'configured' : 'invalid',
      rpoObjectiveMinutes,
      rtoObjectiveMinutes,
    },
    artifact: { status: 'not_run' },
    targetSafety: { status: 'not_run' },
    restore: { status: 'not_run' },
    reconciliation: { status: 'not_run' },
    objectives: {
      rpo: { status: 'not_run', objectiveMinutes: rpoObjectiveMinutes },
      rto: { status: 'not_run', objectiveMinutes: rtoObjectiveMinutes },
    },
    disposal: { status: 'not_run' },
  };
  const receipt = {
    version: 1,
    evidenceId: 'P6-07-Q4',
    launchDomain: 'isolated_restore',
    environment: 'configured_staging',
    state: 'failed',
    commit,
    generatedAt,
    expiresAt,
    workflowRunId: /^\d+$/.test(env.WORKFLOW_RUN_ID ?? '') ? env.WORKFLOW_RUN_ID : null,
    owner: validOwner(owner) ? boundedHash(owner.trim()) : null,
    procedure: 'OPS-P6-002A configured staging P6-07 isolated restore evidence',
    checks,
    binding,
    exceptions: [],
  };

  const baseReady =
    checks.exactMain === 'success' &&
    checks.confirmation === 'success' &&
    checks.owner === 'success' &&
    checks.repositoryContract === 'success' &&
    checks.predecessorBinding === 'matched' &&
    q1.state === 'current' &&
    q2.state === 'current' &&
    q3.state === 'current';
  const q1ConfigurationReady =
    q1.decision === 'ready' &&
    q1.blockers.length === 0 &&
    q1.configuration?.sourceDatabase?.status === 'configured' &&
    q1.configuration?.isolatedRestoreDatabase?.status === 'configured' &&
    q1.configuration?.isolatedRestoreDatabase?.distinctFromSource === true &&
    q1.configuration?.backupEncryption?.status === 'configured';
  const configurationReady =
    q1ConfigurationReady &&
    checks.configuration.sourceDatabase === 'configured' &&
    checks.configuration.restoreDatabase === 'configured' &&
    checks.configuration.backupEncryption === 'configured' &&
    checks.configuration.targetDatabaseName === 'configured' &&
    rpoObjectiveMinutes !== null &&
    rtoObjectiveMinutes !== null;

  if (!baseReady) {
    receipt.exceptions.push('precondition_failed');
    writeJson(outputPath, receipt);
    return receipt;
  }
  if (!configurationReady) {
    receipt.state = 'configuration_blocked';
    if (!q1ConfigurationReady) receipt.exceptions.push('prerequisite_configuration:not_ready');
    if (checks.configuration.sourceDatabase !== 'configured')
      receipt.exceptions.push('source_database:missing');
    if (checks.configuration.restoreDatabase !== 'configured')
      receipt.exceptions.push('isolated_restore_database:missing');
    if (checks.configuration.backupEncryption !== 'configured')
      receipt.exceptions.push('backup_encryption:missing');
    if (checks.configuration.targetDatabaseName !== 'configured')
      receipt.exceptions.push('restore_target_name:invalid');
    if (rpoObjectiveMinutes === null) receipt.exceptions.push('rpo_objective:invalid');
    if (rtoObjectiveMinutes === null) receipt.exceptions.push('rto_objective:invalid');
    writeJson(outputPath, receipt);
    return receipt;
  }

  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-07-q4-'));
  const dbOps = dbOpsFactory(root);
  let decrypted = null;
  let restoreBegan = false;
  try {
    if (!existsSync(artifactPath)) throw new Error('backup_artifact_missing');
    const artifactBytes = readFileSync(artifactPath);
    const artifactDigest = boundedHash(artifactBytes);
    if (artifactDigest !== q3.backup.artifact.digest) throw new Error('artifact_digest_mismatch');
    const envelope = JSON.parse(artifactBytes.toString('utf8'));
    const currentSchemaRevision = schemaRevision(sourceRoot);
    if (
      envelope?.metadata?.sourceCommit !== commit ||
      envelope?.metadata?.environment !== 'configured_staging' ||
      envelope?.metadata?.schemaRevision !== q3.backup.schemaRevision ||
      currentSchemaRevision !== q3.backup.schemaRevision
    ) {
      throw new Error('schema_revision_mismatch');
    }
    decrypted = decryptEnvelope(envelope, encryptionKey);
    const plaintextDigest = boundedHash(decrypted);
    if (plaintextDigest !== q3.backup.artifact.plaintextDigest) {
      throw new Error('backup_plaintext_digest_mismatch');
    }
    const inventory = parseInventory(listImpl(decrypted, root));
    if (
      inventory.digest !== q3.backup.inventory.digest ||
      inventory.objectCount !== q3.backup.inventory.objectCount
    ) {
      throw new Error('backup_inventory_mismatch');
    }
    checks.artifact = {
      status: 'passed',
      workflowRunIdentity: boundedHash(q3.workflowRunId),
      artifactIdentity: boundedHash({ workflowRunId: q3.workflowRunId, artifactDigest }),
      artifactDigest,
      plaintextDigest,
      inventoryDigest: inventory.digest,
      inventoryObjectCount: inventory.objectCount,
      schemaRevision: currentSchemaRevision,
      encrypted: true,
      algorithm: 'aes-256-gcm',
      immutability: 'q3_run_scoped_artifact',
    };

    const sourceUrlIdentity = databaseIdentityFromUrl(sourceDatabaseUrl);
    const targetUrlIdentity = databaseIdentityFromUrl(restoreDatabaseUrl);
    if (sourceUrlIdentity === targetUrlIdentity) throw new Error('same_database_url_identity');
    const sourceRuntimeIdentity = dbOps.identity(sourceDatabaseUrl);
    const targetRuntimeIdentity = dbOps.identity(restoreDatabaseUrl);
    if (sourceRuntimeIdentity === targetRuntimeIdentity)
      throw new Error('same_database_runtime_identity');
    const liveTargetName = dbOps.databaseName(restoreDatabaseUrl);
    if (liveTargetName !== targetDatabaseName || !targetNamePattern.test(liveTargetName)) {
      throw new Error('target_name_mismatch');
    }
    const initialTargetObjectCount = dbOps.countUserObjects(restoreDatabaseUrl);
    if (initialTargetObjectCount !== 0) throw new Error('non_empty_target');
    checks.targetSafety = {
      status: 'passed',
      sourceIdentity: boundedHash(sourceRuntimeIdentity),
      targetIdentity: boundedHash(targetRuntimeIdentity),
      sourceUrlIdentity,
      targetUrlIdentity,
      distinct: true,
      targetNameDigest: boundedHash(liveTargetName),
      initialUserObjectCount: 0,
      destructiveScopeAuthorized: true,
    };

    const expected = loadExpectedSchema(sourceRoot);
    const privateTables = privateSubmissionTables.filter((table) =>
      expected.expectedTables.includes(table),
    );
    const nonPrivateTables = expected.expectedTables.filter(
      (table) => !privateTables.includes(table),
    );
    if (privateTables.length === 0 || nonPrivateTables.length === 0) {
      throw new Error('schema_expected_scope_missing');
    }
    const sourceTables = dbOps.listTables(sourceDatabaseUrl);
    if (!sameSortedValues(sourceTables, expected.expectedTables)) {
      throw new Error('source_table_set_mismatch');
    }
    const sourceRowCounts = dbOps.rowCounts(sourceDatabaseUrl, nonPrivateTables);
    const sourceSchemaDigest = dbOps.schemaDigest(sourceDatabaseUrl);
    const restoreStartWallClock = now.getTime();
    const restoreStartTimer = timer();
    const rpoMinutes = Math.max(0, (restoreStartWallClock - Date.parse(q3.generatedAt)) / 60_000);
    checks.objectives.rpo = {
      status: rpoMinutes <= rpoObjectiveMinutes ? 'passed' : 'failed',
      objectiveMinutes: rpoObjectiveMinutes,
      measuredMinutes: Number(rpoMinutes.toFixed(3)),
      backupGeneratedAt: q3.generatedAt,
    };

    restoreBegan = true;
    dbOps.restore(restoreDatabaseUrl, decrypted);
    checks.restore = {
      status: 'passed',
      mode: 'pg_restore_single_transaction',
      sourceArtifactIdentity: checks.artifact.artifactIdentity,
    };

    const targetTables = dbOps.listTables(restoreDatabaseUrl);
    if (!sameSortedValues(targetTables, expected.expectedTables)) {
      throw new Error('target_table_set_mismatch');
    }
    const targetRowCounts = dbOps.rowCounts(restoreDatabaseUrl, expected.expectedTables);
    const targetNonPrivateRowCounts = Object.fromEntries(
      nonPrivateTables.map((table) => [table, targetRowCounts[table]]),
    );
    const allExpectedNonPrivateTablesMatched = nonPrivateTables.every(
      (table) => targetNonPrivateRowCounts[table] === sourceRowCounts[table],
    );
    if (!allExpectedNonPrivateTablesMatched) throw new Error('row_count_mismatch');
    const privateTablesZeroRows = privateTables.every((table) => targetRowCounts[table] === 0);
    if (!privateTablesZeroRows) throw new Error('private_rows_restored');
    const targetSchemaDigest = dbOps.schemaDigest(restoreDatabaseUrl);
    if (targetSchemaDigest !== sourceSchemaDigest) throw new Error('schema_digest_mismatch');
    const invalidConstraintCount = dbOps.invalidConstraintCount(restoreDatabaseUrl);
    const foreignKeyCount = dbOps.foreignKeyCount(restoreDatabaseUrl);
    const checkConstraintCount = dbOps.checkConstraintCount(restoreDatabaseUrl);
    if (
      invalidConstraintCount !== 0 ||
      foreignKeyCount < expected.expectedForeignKeyCount ||
      checkConstraintCount < expected.expectedCheckCount
    ) {
      throw new Error('constraint_reconciliation_failed');
    }
    const representativeRowCount = Object.values(targetNonPrivateRowCounts).reduce(
      (total, count) => total + count,
      0,
    );
    if (representativeRowCount <= 0) throw new Error('representative_read_failed');
    const restoreElapsedMinutes = (timer() - restoreStartTimer) / 60_000;
    checks.objectives.rto = {
      status: restoreElapsedMinutes <= rtoObjectiveMinutes ? 'passed' : 'failed',
      objectiveMinutes: rtoObjectiveMinutes,
      measuredMinutes: Number(restoreElapsedMinutes.toFixed(3)),
    };
    checks.reconciliation = {
      status: 'passed',
      snapshotTag: expected.tag,
      expectedTableCount: expected.expectedTables.length,
      restoredTableCount: targetTables.length,
      tableSetDigest: boundedHash(targetTables.slice().sort().join('\n')),
      allExpectedNonPrivateTablesMatched,
      nonPrivateTableCount: nonPrivateTables.length,
      nonPrivateRowCountDigest: rowCountDigest(targetNonPrivateRowCounts),
      privateTablesZeroRows,
      privateTableCount: privateTables.length,
      privateScopeDigest: boundedHash({ privateTables, excludedScope }),
      sourceSchemaDigest,
      targetSchemaDigest,
      foreignKeyCount,
      expectedForeignKeyCount: expected.expectedForeignKeyCount,
      checkConstraintCount,
      expectedCheckConstraintCount: expected.expectedCheckCount,
      invalidConstraintCount,
      representativeRead: 'passed',
      representativeRowCount,
    };
    if (checks.objectives.rpo.status !== 'passed') throw new Error('rpo_objective_breached');
    if (checks.objectives.rto.status !== 'passed') throw new Error('rto_objective_breached');
  } catch (error) {
    receipt.exceptions.push(safeException(error));
  } finally {
    if (decrypted instanceof Uint8Array) decrypted.fill(0);
    if (restoreBegan) {
      try {
        dbOps.disposeTarget(restoreDatabaseUrl);
        const remaining = dbOps.countUserObjects(restoreDatabaseUrl);
        if (remaining !== 0) throw new Error('target_disposal_failed');
        checks.disposal = {
          status: 'passed',
          mode: 'drop_and_recreate_public_schema',
          remainingUserObjectCount: 0,
        };
      } catch {
        checks.disposal = { status: 'failed', mode: 'drop_and_recreate_public_schema' };
        if (!receipt.exceptions.includes('target_disposal_failed')) {
          receipt.exceptions.push('target_disposal_failed');
        }
      }
    }
    rmSync(root, { recursive: true, force: true });
  }

  const accepted =
    receipt.exceptions.length === 0 &&
    checks.artifact.status === 'passed' &&
    checks.targetSafety.status === 'passed' &&
    checks.restore.status === 'passed' &&
    checks.reconciliation.status === 'passed' &&
    checks.objectives.rpo.status === 'passed' &&
    checks.objectives.rto.status === 'passed' &&
    checks.disposal.status === 'passed';
  if (accepted) receipt.state = 'accepted';
  if (!noSecretLeakage(receipt, [sourceDatabaseUrl, restoreDatabaseUrl, encryptionKey])) {
    receipt.state = 'failed';
    receipt.exceptions = ['secret_leakage_detected'];
  }
  writeJson(outputPath, receipt);
  return receipt;
}

function makeBinding(seed) {
  return Object.fromEntries(bindingKeys.map((key) => [key, boundedHash(`${seed}:${key}`)]));
}

function makeReceipt(evidenceId, commit, binding, now, extra = {}) {
  return {
    version: 1,
    evidenceId,
    environment: 'configured_staging',
    state: 'accepted',
    commit,
    generatedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
    binding,
    exceptions: [],
    ...extra,
  };
}

function makeMockDb(expectedTables, privateTables, options = {}) {
  let restored = false;
  let disposed = false;
  const sourceCounts = Object.fromEntries(
    expectedTables.map((table) => [table, privateTables.includes(table) ? 3 : 2]),
  );
  return {
    identity(databaseUrl) {
      if (options.sameIdentity) return 'same-runtime';
      return databaseUrl.includes('restore') ? 'target-runtime' : 'source-runtime';
    },
    databaseName(databaseUrl) {
      return databaseUrl.includes('restore') ? 'cpm_p6_07_restore_test' : 'source';
    },
    countUserObjects(databaseUrl) {
      if (!databaseUrl.includes('restore')) return expectedTables.length;
      if (disposed) return 0;
      if (!restored) return options.nonEmptyTarget ? 1 : 0;
      return expectedTables.length;
    },
    listTables(databaseUrl) {
      if (!databaseUrl.includes('restore')) return expectedTables;
      if (disposed || !restored) return [];
      return expectedTables;
    },
    rowCounts(databaseUrl, tables) {
      return Object.fromEntries(
        tables.map((table) => {
          if (!databaseUrl.includes('restore')) return [table, sourceCounts[table]];
          if (privateTables.includes(table)) return [table, options.privateRows ? 1 : 0];
          return [table, sourceCounts[table]];
        }),
      );
    },
    schemaDigest() {
      return options.schemaMismatch && restored
        ? boundedHash('target-mismatch')
        : boundedHash('schema');
    },
    invalidConstraintCount() {
      return 0;
    },
    foreignKeyCount() {
      return 4;
    },
    checkConstraintCount() {
      return 4;
    },
    restore() {
      if (options.restoreFailure) throw new Error('restore_execution_failed');
      restored = true;
    },
    disposeTarget() {
      if (options.disposalFailure) throw new Error('target_disposal_failed');
      disposed = true;
      restored = false;
    },
    state() {
      return { restored, disposed };
    },
  };
}

async function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-07-q4-self-test-'));
  try {
    const statusRoot = resolve(root, 'status');
    mkdirSync(resolve(statusRoot, 'config/staging-authorization'), { recursive: true });
    mkdirSync(resolve(root, 'drizzle/meta'), { recursive: true });
    mkdirSync(resolve(root, 'scripts'), { recursive: true });
    const now = new Date('2026-08-04T00:00:00.000Z');
    const commit = 'a'.repeat(40);
    const binding = makeBinding('q4');
    const expectedTables = [
      'entities',
      'locations',
      'acceptance_claims',
      'evidence',
      'verification_events',
      'media',
      ...privateSubmissionTables,
    ].sort();
    const snapshotTables = Object.fromEntries(
      expectedTables.map((table) => [
        `public.${table}`,
        {
          foreignKeys:
            table === 'locations' || table === 'acceptance_claims' ? { [`${table}_fk`]: {} } : {},
          checkConstraints: table === 'acceptance_claims' ? { claim_check: {} } : {},
        },
      ]),
    );
    writeJson(resolve(root, 'drizzle/meta/_journal.json'), { entries: [{ tag: '0001_test' }] });
    writeJson(resolve(root, 'drizzle/meta/0001_test_snapshot.json'), { tables: snapshotTables });
    writeFileSync(resolve(root, 'drizzle.config.ts'), 'export default {};\n');
    writeFileSync(resolve(root, 'scripts/materialize-drizzle-snapshot.mjs'), 'export {};\n');
    for (const [evidenceId, path] of predecessorPaths) {
      writeJson(resolve(statusRoot, path), makeReceipt(evidenceId, commit, binding, now));
    }
    writeJson(resolve(statusRoot, prerequisitePath), {
      version: 1,
      evidenceId: 'P6-07',
      diagnostic: 'prerequisite_inventory',
      environment: 'configured_staging',
      state: 'diagnosed',
      decision: 'ready',
      commit,
      generatedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      checks: {
        configuration: {
          sourceDatabase: { status: 'configured' },
          isolatedRestoreDatabase: { status: 'configured', distinctFromSource: true },
          backupEncryption: { status: 'configured' },
        },
      },
      binding,
      blockers: [],
      exceptions: [],
    });
    writeJson(
      resolve(statusRoot, q2Path),
      makeReceipt('P6-07-Q2', commit, binding, now, {
        checks: {
          liveMonitoring: { status: 'passed' },
          syntheticFailures: { status: 'passed' },
          alertExercise: { status: 'passed' },
        },
      }),
    );
    const plain = Buffer.from(`PGDMP${'a'.repeat(256)}`);
    const inventoryText = [
      '; archive',
      '1; 2615 2200 SCHEMA - public owner',
      ...expectedTables.flatMap((table, index) => [
        `${index + 2}; 1259 ${100 + index} TABLE public ${table} owner`,
        `${index + 100}; 0 ${100 + index} TABLE DATA public ${table} owner`,
      ]),
    ].join('\n');
    const inventory = parseInventory(inventoryText);
    const currentSchemaRevision = schemaRevision(root);
    const key = 'k'.repeat(64);
    const envelope = encryptBuffer(plain, key, {
      evidenceId: 'P6-07-Q3',
      environment: 'configured_staging',
      sourceCommit: commit,
      schemaRevision: currentSchemaRevision,
      createdAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    });
    const artifactPath = resolve(root, 'p6-07-q3-backup.enc.json');
    writeJson(artifactPath, envelope);
    const artifactBytes = readFileSync(artifactPath);
    writeJson(
      resolve(statusRoot, q3Path),
      makeReceipt('P6-07-Q3', commit, binding, now, {
        workflowRunId: '12345',
        checks: {
          backup: {
            status: 'passed',
            schemaRevision: currentSchemaRevision,
            artifact: {
              format: 'pg_dump_custom_encrypted_json_envelope',
              algorithm: 'aes-256-gcm',
              encrypted: true,
              digest: boundedHash(artifactBytes),
              plaintextDigest: boundedHash(plain),
            },
            inventory: { status: 'passed', ...inventory },
            encryption: { status: 'passed' },
            integrity: {
              status: 'passed',
              decryptVerified: true,
              digestMatched: true,
              inventoryMatched: true,
              corruptionRejected: true,
            },
          },
        },
      }),
    );
    const sourceUrl = 'postgresql://source:secret@source.invalid/source?sslmode=require';
    const targetUrl =
      'postgresql://restore:secret@restore.invalid/cpm_p6_07_restore_test?sslmode=require';
    const env = {
      APPROVED_COMMIT: commit,
      CONFIRMATION: exactConfirmation,
      RESTORE_OWNER: 'test-owner',
      RESTORE_TARGET_DATABASE_NAME: 'cpm_p6_07_restore_test',
      RPO_OBJECTIVE_MINUTES: '60',
      RTO_OBJECTIVE_MINUTES: '30',
      WORKFLOW_RUN_ID: '67890',
      REPOSITORY_CONTRACT_OUTCOME: 'success',
      DATABASE_URL: sourceUrl,
      P6_07_RESTORE_DATABASE_URL: targetUrl,
      P6_07_BACKUP_ENCRYPTION_KEY: key,
    };
    const reference = artifactReference(statusRoot, resolve(root, 'reference.json'), env, now);
    if (reference.runId !== '12345' || !reference.artifactName.endsWith('-12345')) {
      throw new Error('artifact_reference_self_test_failed');
    }

    const acceptedDb = makeMockDb(expectedTables, privateSubmissionTables);
    const acceptedPath = resolve(root, 'accepted.json');
    const accepted = await execute(statusRoot, artifactPath, acceptedPath, {
      now,
      sourceRoot: root,
      env,
      listImpl: () => inventoryText,
      dbOpsFactory: () => acceptedDb,
      timer: (() => {
        let value = 0;
        return () => (value += 1_000);
      })(),
    });
    if (
      accepted.state !== 'accepted' ||
      accepted.checks.reconciliation.allExpectedNonPrivateTablesMatched !== true ||
      accepted.checks.reconciliation.privateTablesZeroRows !== true ||
      accepted.checks.disposal.status !== 'passed' ||
      accepted.exceptions.length !== 0
    ) {
      throw new Error('accepted_restore_self_test_failed');
    }
    const acceptedText = readFileSync(acceptedPath, 'utf8');
    if (
      acceptedText.includes(sourceUrl) ||
      acceptedText.includes(targetUrl) ||
      acceptedText.includes(key)
    ) {
      throw new Error('secret_leakage_self_test_failed');
    }

    const sameIdentity = await execute(statusRoot, artifactPath, resolve(root, 'same.json'), {
      now,
      sourceRoot: root,
      env,
      listImpl: () => inventoryText,
      dbOpsFactory: () =>
        makeMockDb(expectedTables, privateSubmissionTables, { sameIdentity: true }),
    });
    if (!sameIdentity.exceptions.includes('same_database_identity')) {
      throw new Error('same_database_identity_not_rejected');
    }

    const nonEmpty = await execute(statusRoot, artifactPath, resolve(root, 'non-empty.json'), {
      now,
      sourceRoot: root,
      env,
      listImpl: () => inventoryText,
      dbOpsFactory: () =>
        makeMockDb(expectedTables, privateSubmissionTables, { nonEmptyTarget: true }),
    });
    if (!nonEmpty.exceptions.includes('restore_target_not_empty')) {
      throw new Error('non_empty_target_not_rejected');
    }

    const privateDb = makeMockDb(expectedTables, privateSubmissionTables, { privateRows: true });
    const privateRows = await execute(statusRoot, artifactPath, resolve(root, 'private.json'), {
      now,
      sourceRoot: root,
      env,
      listImpl: () => inventoryText,
      dbOpsFactory: () => privateDb,
    });
    if (!privateRows.exceptions.includes('private_rows_restored') || !privateDb.state().disposed) {
      throw new Error('private_rows_not_rejected');
    }

    const objectiveDb = makeMockDb(expectedTables, privateSubmissionTables);
    const objective = await execute(statusRoot, artifactPath, resolve(root, 'objective.json'), {
      now,
      sourceRoot: root,
      env: { ...env, RPO_OBJECTIVE_MINUTES: '1' },
      listImpl: () => inventoryText,
      dbOpsFactory: () => objectiveDb,
    });
    if (!objective.exceptions.includes('rpo_objective_breached') || !objectiveDb.state().disposed) {
      throw new Error('objective_breach_not_rejected');
    }

    const disposal = await execute(statusRoot, artifactPath, resolve(root, 'disposal.json'), {
      now,
      sourceRoot: root,
      env,
      listImpl: () => inventoryText,
      dbOpsFactory: () =>
        makeMockDb(expectedTables, privateSubmissionTables, { disposalFailure: true }),
    });
    if (!disposal.exceptions.includes('target_disposal_failed')) {
      throw new Error('disposal_failure_not_rejected');
    }

    const corruptedPath = resolve(root, 'corrupted.enc.json');
    writeFileSync(corruptedPath, Buffer.concat([artifactBytes, Buffer.from('x')]));
    const corrupted = await execute(statusRoot, corruptedPath, resolve(root, 'corrupted.json'), {
      now,
      sourceRoot: root,
      env,
      listImpl: () => inventoryText,
      dbOpsFactory: () => makeMockDb(expectedTables, privateSubmissionTables),
    });
    if (!corrupted.exceptions.includes('artifact_digest_mismatch')) {
      throw new Error('artifact_digest_mismatch_not_rejected');
    }

    console.log('OPS-P6-002A configured staging P6-07 isolated restore self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  await selfTest();
} else if (args[0] === '--resolve-artifact') {
  const statusRoot = args[1];
  const outputPath = args[2];
  if (!statusRoot || !outputPath) {
    throw new Error('usage: --resolve-artifact <status-root> <output-path>');
  }
  artifactReference(statusRoot, outputPath);
} else {
  const statusRoot = args[0];
  const artifactPath = args[1];
  const outputPath = args[2];
  if (!statusRoot || !artifactPath || !outputPath) {
    throw new Error(
      'usage: node scripts/run-ops-p6-002a-configured-staging-p6-07-isolated-restore.mjs <status-root> <encrypted-artifact-path> <receipt-path>',
    );
  }
  const receipt = await execute(statusRoot, artifactPath, outputPath);
  if (receipt.state !== 'accepted') process.exitCode = 1;
}

export { artifactReference, decryptEnvelope, execute, parseInventory, receiptPath };
