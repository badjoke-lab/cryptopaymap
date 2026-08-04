import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_07_Q3';
const receiptPath = 'config/staging-authorization/p6-07-backup-integrity-receipt.json';
const prerequisitePath = 'config/staging-authorization/p6-07-prerequisite-diagnostic.json';
const q2Path = 'config/staging-authorization/p6-07-monitoring-alert-receipt.json';
const expiryDays = 30;
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const predecessorPaths = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
  ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
  ['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json'],
  ['P6-06', 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json'],
];
const includedScope = [
  'canonical_database',
  'provenance_evidence',
  'review_receipts',
  'release_metadata',
  'media_linkage',
  'operational_configuration',
];
const excludedScope = [
  'submission_private_payload_data',
  'submission_private_contact_data',
  'transient_build_output',
  'cache_data',
  'unrestricted_logs',
  'credentials_and_secrets',
  'external_provider_control_plane',
];
const excludedTableData = [
  'public.submissions',
  'public.submission_payloads',
  'public.submission_contacts',
  'public.submission_media',
  'public.submission_events',
  'public.submission_decisions',
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

function safeException(error) {
  const value = error instanceof Error ? error.message : String(error);
  if (/configuration_blocked/.test(value)) return 'configuration_blocked';
  if (/pg_dump/.test(value)) return 'pg_dump_failed';
  if (/pg_restore/.test(value)) return 'pg_restore_inventory_failed';
  if (/artifact/.test(value)) return 'backup_artifact_failed';
  if (/inventory/.test(value)) return 'backup_inventory_failed';
  if (/decrypt|auth|cipher/i.test(value)) return 'backup_integrity_failed';
  if (/schema_revision/.test(value)) return 'schema_revision_missing';
  return 'backup_execution_failed';
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

function readQ2(statusRoot, commit, binding, now) {
  const receipt = readJson(statusRoot, q2Path);
  const generatedAt = validTimestamp(receipt?.generatedAt) ? receipt.generatedAt : null;
  const expiresAt = validTimestamp(receipt?.expiresAt) ? receipt.expiresAt : null;
  const receiptBinding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingMatched =
    binding !== null &&
    receiptBinding !== null &&
    bindingKeys.every((key) => receiptBinding[key] === binding[key]);
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
    bindingMatched &&
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

function readPrerequisite(statusRoot, commit, binding, now) {
  const receipt = readJson(statusRoot, prerequisitePath);
  const generatedAt = validTimestamp(receipt?.generatedAt) ? receipt.generatedAt : null;
  const expiresAt = validTimestamp(receipt?.expiresAt) ? receipt.expiresAt : null;
  const blockers = Array.isArray(receipt?.blockers)
    ? receipt.blockers.filter((value) => typeof value === 'string').sort()
    : [];
  const blockerSet = new Set(blockers);
  const blockersAllowed = blockers.every((value) => value === 'isolated_restore_database:missing');
  const receiptBinding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingMatched =
    binding !== null &&
    receiptBinding !== null &&
    bindingKeys.every((key) => receiptBinding[key] === binding[key]);
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
    receipt?.checks?.configuration?.sourceDatabase?.status === 'configured' &&
    receipt?.checks?.configuration?.backupEncryption?.status === 'configured' &&
    !blockerSet.has('backup_encryption:missing') &&
    blockersAllowed &&
    bindingMatched &&
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

function buildPgEnvironment(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
    PGCONNECT_TIMEOUT: '20',
  };
}

function actualDump(databaseUrl) {
  const args = ['--format=custom', '--compress=9', '--no-owner', '--no-privileges'];
  for (const table of excludedTableData) args.push(`--exclude-table-data=${table}`);
  try {
    return execFileSync('pg_dump', args, {
      env: buildPgEnvironment(databaseUrl),
      encoding: 'buffer',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('pg_dump_failed');
  }
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
  } catch {
    throw new Error('pg_restore_inventory_failed');
  } finally {
    rmSync(plainPath, { force: true });
  }
}

function parseInventory(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(';'));
  const normalized = lines.slice().sort();
  const tableCount = lines.filter(
    (line) => /\bTABLE\b/.test(line) && !/\bTABLE DATA\b/.test(line),
  ).length;
  const tableDataCount = lines.filter((line) => /\bTABLE DATA\b/.test(line)).length;
  const schemaCount = lines.filter((line) => /\bSCHEMA\b/.test(line)).length;
  if (lines.length === 0 || tableCount === 0 || tableDataCount === 0 || schemaCount === 0) {
    throw new Error('backup_inventory_failed');
  }
  return {
    objectCount: lines.length,
    tableCount,
    tableDataCount,
    schemaCount,
    digest: boundedHash(normalized.join('\n')),
  };
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
    throw new Error('backup_artifact_failed');
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

function corruptionRejected(envelope, secret) {
  const corrupted = structuredClone(envelope);
  const tag = Buffer.from(corrupted.tag, 'base64');
  tag[0] ^= 0xff;
  corrupted.tag = tag.toString('base64');
  try {
    decryptEnvelope(corrupted, secret);
    return false;
  } catch {
    return true;
  }
}

function noSecretLeakage(value, secrets) {
  const text = JSON.stringify(value);
  return secrets.every(
    (secret) => typeof secret !== 'string' || secret.length === 0 || !text.includes(secret),
  );
}

async function execute(
  statusRoot,
  outputPath,
  artifactPath,
  {
    now = new Date(),
    sourceRoot = process.cwd(),
    dumpImpl = actualDump,
    listImpl = actualList,
    env = process.env,
  } = {},
) {
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  const commit = env.APPROVED_COMMIT ?? '';
  const owner = env.BACKUP_OWNER ?? '';
  const databaseUrl = env.DATABASE_URL ?? '';
  const encryptionKey = env.P6_07_BACKUP_ENCRYPTION_KEY ?? '';
  const retentionDays = Number(env.P6_07_BACKUP_RETENTION_DAYS ?? '30');
  const predecessors = predecessorPaths.map(([evidenceId, path]) =>
    readPredecessor(statusRoot, evidenceId, path, commit, now),
  );
  const binding = sharedBinding(predecessors);
  const q2 = readQ2(statusRoot, commit, binding, now);
  const prerequisite = readPrerequisite(statusRoot, commit, binding, now);
  const checks = {
    exactMain: validCommit(commit) ? 'success' : 'failed',
    confirmation: env.CONFIRMATION === exactConfirmation ? 'success' : 'failed',
    owner: validOwner(owner) ? 'success' : 'failed',
    repositoryContract: env.REPOSITORY_CONTRACT_OUTCOME === 'success' ? 'success' : 'failed',
    predecessors: predecessors.map(({ receipt, binding: predecessorBinding, ...item }) => item),
    predecessorBinding: binding === null ? 'failed' : 'matched',
    q2,
    prerequisite,
    configuration: {
      sourceDatabase: validDatabaseUrl(databaseUrl) ? 'configured' : 'missing',
      backupEncryption: encryptionKey.length >= 32 ? 'configured' : 'missing_or_too_short',
      retentionDays:
        Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 90
          ? retentionDays
          : null,
    },
    backup: { status: 'not_run' },
  };
  const receipt = {
    version: 1,
    evidenceId: 'P6-07-Q3',
    launchDomain: 'backup_integrity',
    environment: 'configured_staging',
    state: 'failed',
    commit,
    generatedAt,
    expiresAt,
    workflowRunId: /^\d+$/.test(env.WORKFLOW_RUN_ID ?? '') ? env.WORKFLOW_RUN_ID : null,
    owner: validOwner(owner) ? boundedHash(owner.trim()) : null,
    procedure: 'OPS-P6-001Y configured staging P6-07 backup integrity evidence',
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
    q2.state === 'current' &&
    prerequisite.state === 'current';
  const configurationReady =
    checks.configuration.sourceDatabase === 'configured' &&
    checks.configuration.backupEncryption === 'configured' &&
    checks.configuration.retentionDays !== null;

  if (!baseReady) {
    receipt.exceptions.push('precondition_failed');
    writeJson(outputPath, receipt);
    return receipt;
  }
  if (!configurationReady) {
    receipt.state = 'configuration_blocked';
    if (checks.configuration.sourceDatabase !== 'configured')
      receipt.exceptions.push('source_database:missing');
    if (checks.configuration.backupEncryption !== 'configured')
      receipt.exceptions.push('backup_encryption:missing');
    if (checks.configuration.retentionDays === null)
      receipt.exceptions.push('backup_retention:invalid');
    writeJson(outputPath, receipt);
    return receipt;
  }

  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-07-q3-'));
  try {
    const plain = dumpImpl(databaseUrl, root);
    if (!(plain instanceof Uint8Array) || plain.byteLength < 64)
      throw new Error('backup_artifact_failed');
    const beforeInventory = parseInventory(listImpl(Buffer.from(plain), root));
    const metadata = {
      evidenceId: 'P6-07-Q3',
      environment: 'configured_staging',
      sourceCommit: commit,
      schemaRevision: schemaRevision(sourceRoot),
      sourceStoreClass: 'fixed_review_canonical',
      scopeDigest: boundedHash({ includedScope, excludedScope, excludedTableData }),
      createdAt: generatedAt,
    };
    const envelope = encryptBuffer(Buffer.from(plain), encryptionKey, metadata);
    writeJson(artifactPath, envelope);
    const artifactBytes = readFileSync(artifactPath);
    const retainedEnvelope = JSON.parse(artifactBytes.toString('utf8'));
    const decrypted = decryptEnvelope(retainedEnvelope, encryptionKey);
    const afterInventory = parseInventory(listImpl(decrypted, root));
    const plainDigest = boundedHash(Buffer.from(plain));
    const decryptedDigest = boundedHash(decrypted);
    const inventoryMatched =
      beforeInventory.digest === afterInventory.digest &&
      beforeInventory.objectCount === afterInventory.objectCount;
    const rejected = corruptionRejected(retainedEnvelope, encryptionKey);
    if (plainDigest !== decryptedDigest || !inventoryMatched || !rejected) {
      throw new Error('backup_integrity_failed');
    }
    checks.backup = {
      status: 'passed',
      backupIdentity: boundedHash({
        commit,
        generatedAt,
        artifactDigest: boundedHash(artifactBytes),
      }),
      sourceStoreClass: 'fixed_review_canonical',
      schemaRevision: metadata.schemaRevision,
      scope: {
        included: includedScope,
        excluded: excludedScope,
        excludedTableDataCount: excludedTableData.length,
        digest: metadata.scopeDigest,
      },
      artifact: {
        format: 'pg_dump_custom_encrypted_json_envelope',
        algorithm: 'aes-256-gcm',
        encrypted: true,
        byteLength: artifactBytes.byteLength,
        digest: boundedHash(artifactBytes),
        plaintextDigest: plainDigest,
      },
      inventory: {
        status: 'passed',
        ...afterInventory,
        reconciled: inventoryMatched,
      },
      encryption: {
        status: 'passed',
        algorithm: 'aes-256-gcm',
        keyReference: boundedHash('P6_07_BACKUP_ENCRYPTION_KEY'),
        keyMaterialRetained: false,
      },
      retention: {
        status: 'passed',
        days: retentionDays,
        deleteAfter: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
        immutability: 'run_scoped_artifact',
      },
      integrity: {
        status: 'passed',
        decryptVerified: true,
        digestMatched: true,
        inventoryMatched,
        corruptionRejected: rejected,
      },
    };
    receipt.state = 'accepted';
  } catch (error) {
    receipt.exceptions.push(safeException(error));
    rmSync(artifactPath, { force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (!noSecretLeakage(receipt, [databaseUrl, encryptionKey])) {
    receipt.state = 'failed';
    receipt.exceptions = ['secret_leakage_detected'];
    rmSync(artifactPath, { force: true });
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
    generatedAt: new Date(now.getTime() - 60_000).toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    binding,
    exceptions: [],
    ...extra,
  };
}

async function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-07-q3-self-test-'));
  try {
    mkdirSync(resolve(root, 'status/config/staging-authorization'), { recursive: true });
    writeFileSync(resolve(root, 'drizzle.config.ts'), 'export default {};\n');
    const now = new Date('2026-08-04T00:00:00.000Z');
    const commit = 'a'.repeat(40);
    const binding = makeBinding('q3');
    for (const [evidenceId, path] of predecessorPaths) {
      writeJson(resolve(root, `status/${path}`), makeReceipt(evidenceId, commit, binding, now));
    }
    writeJson(
      resolve(root, `status/${q2Path}`),
      makeReceipt('P6-07-Q2', commit, binding, now, {
        checks: {
          liveMonitoring: { status: 'passed' },
          syntheticFailures: { status: 'passed' },
          alertExercise: { status: 'passed' },
        },
      }),
    );
    writeJson(resolve(root, `status/${prerequisitePath}`), {
      version: 1,
      evidenceId: 'P6-07',
      diagnostic: 'prerequisite_inventory',
      environment: 'configured_staging',
      state: 'diagnosed',
      decision: 'configuration_blocked',
      commit,
      generatedAt: new Date(now.getTime() - 60_000).toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      checks: {
        configuration: {
          sourceDatabase: { status: 'configured' },
          backupEncryption: { status: 'configured' },
        },
      },
      binding,
      blockers: ['isolated_restore_database:missing'],
      exceptions: [],
    });
    const inventory = [
      '; archive',
      '1; 2615 2200 SCHEMA - public owner',
      '2; 1259 100 TABLE public entities owner',
      '3; 0 100 TABLE DATA public entities owner',
      '4; 2606 101 CONSTRAINT public entities entities_pkey owner',
    ].join('\n');
    const env = {
      APPROVED_COMMIT: commit,
      CONFIRMATION: exactConfirmation,
      BACKUP_OWNER: 'test-owner',
      REPOSITORY_CONTRACT_OUTCOME: 'success',
      WORKFLOW_RUN_ID: '123',
      DATABASE_URL: 'postgresql://user:secret@example.invalid/db?sslmode=require',
      P6_07_BACKUP_ENCRYPTION_KEY: 'x'.repeat(64),
      P6_07_BACKUP_RETENTION_DAYS: '30',
    };
    const acceptedPath = resolve(root, 'accepted.json');
    const artifactPath = resolve(root, 'backup.enc.json');
    const accepted = await execute(resolve(root, 'status'), acceptedPath, artifactPath, {
      now,
      sourceRoot: root,
      env,
      dumpImpl: () => Buffer.from(`PGDMP${'a'.repeat(128)}`),
      listImpl: () => inventory,
    });
    if (
      accepted.state !== 'accepted' ||
      accepted.checks.backup.status !== 'passed' ||
      accepted.checks.backup.integrity.corruptionRejected !== true ||
      !existsSync(artifactPath) ||
      accepted.exceptions.length !== 0
    ) {
      throw new Error('accepted_backup_self_test_failed');
    }
    const acceptedText = `${readFileSync(acceptedPath, 'utf8')}\n${readFileSync(artifactPath, 'utf8')}`;
    if (
      acceptedText.includes(env.DATABASE_URL) ||
      acceptedText.includes(env.P6_07_BACKUP_ENCRYPTION_KEY)
    ) {
      throw new Error('secret_leakage_self_test_failed');
    }

    const blocked = await execute(
      resolve(root, 'status'),
      resolve(root, 'blocked.json'),
      resolve(root, 'blocked.enc.json'),
      { now, sourceRoot: root, env: { ...env, P6_07_BACKUP_ENCRYPTION_KEY: '' } },
    );
    if (
      blocked.state !== 'configuration_blocked' ||
      !blocked.exceptions.includes('backup_encryption:missing')
    ) {
      throw new Error('missing_key_not_blocked');
    }

    const q2Receipt = readJson(resolve(root, 'status'), q2Path);
    q2Receipt.binding = makeBinding('wrong');
    writeJson(resolve(root, `status/${q2Path}`), q2Receipt);
    const mismatched = await execute(
      resolve(root, 'status'),
      resolve(root, 'mismatched.json'),
      resolve(root, 'mismatched.enc.json'),
      { now, sourceRoot: root, env },
    );
    if (mismatched.state !== 'failed' || !mismatched.exceptions.includes('precondition_failed')) {
      throw new Error('q2_binding_mismatch_not_rejected');
    }

    const envelope = encryptBuffer(Buffer.from('test backup payload'), 'z'.repeat(64), {
      sourceCommit: commit,
    });
    if (!corruptionRejected(envelope, 'z'.repeat(64))) {
      throw new Error('corruption_not_rejected');
    }
    console.log('OPS-P6-001Y configured staging P6-07 backup integrity self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  await selfTest();
} else {
  const statusRoot = args[0];
  const outputPath = args[1];
  const artifactPath = args[2];
  if (!statusRoot || !outputPath || !artifactPath) {
    throw new Error(
      'usage: node scripts/run-ops-p6-001y-configured-staging-p6-07-backup-integrity.mjs <status-root> <receipt-path> <encrypted-artifact-path>',
    );
  }
  const receipt = await execute(statusRoot, outputPath, artifactPath);
  if (receipt.state !== 'accepted') process.exitCode = 1;
}

export { corruptionRejected, decryptEnvelope, encryptBuffer, execute, parseInventory, receiptPath };
