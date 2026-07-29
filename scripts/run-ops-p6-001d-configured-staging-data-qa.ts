import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parsePublicExport,
  publicExportPaths,
  type PublicExportPath,
} from '../src/schemas/public-exports';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_01';
const evidenceId = 'P6-01';
const expiryHours = 72;
const defaultReviewBaseUrl = 'https://review.cryptopaymap-staging.pages.dev';
const deploymentReceiptPath = 'config/staging-review/deployment-receipt.json';
const liveAuditReceiptPath = 'config/staging-review/p5-02r-live-audit-receipt.json';
const forbiddenPublicKeys = new Set([
  'candidateId',
  'contactAllowed',
  'encryptedEmail',
  'emailHash',
  'internalId',
  'internalNote',
  'intakeRequestId',
  'statusSecret',
  'statusTokenHash',
  'storageKey',
  'submissionId',
]);

interface JsonObject {
  [key: string]: unknown;
}

interface ManifestEntry {
  path: PublicExportPath;
  mediaType: string;
  schemaVersion: string;
  recordCount: number;
  sha256: string;
  licenses: string[];
}

interface PublicManifest extends JsonObject {
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: string;
  canonicalOnly: true;
  files: ManifestEntry[];
}

interface PublicVersion extends JsonObject {
  projectId: 'cryptopaymap';
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: string;
  canonicalOnly: true;
  verificationMarker: 'reviewed_public_records_only';
}

interface ReceiptCheck {
  state: string;
  generatedAt: string | null;
  path?: string;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function readStatusJson(statusRoot: string, relativePath: string): JsonObject | null {
  const absolutePath = resolve(statusRoot, relativePath);
  if (!existsSync(absolutePath)) return null;
  try {
    const value = readJson(absolutePath);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function sha256Bytes(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function boundedHash(value: unknown): string {
  return `sha256:${sha256Bytes(JSON.stringify(value))}`;
}

function validCommit(value: string): boolean {
  return /^[a-f0-9]{40}$/.test(value);
}

function validOwner(value: string): boolean {
  return value.trim().length >= 2 && value.trim().length <= 100;
}

function safeTimestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function countRecords(path: PublicExportPath, value: unknown): number {
  if (!isObject(value)) return -1;
  if (Array.isArray(value.records)) return value.records.length;
  if (path === '/data/places.geojson' && Array.isArray(value.features)) return value.features.length;
  if (path === '/data/stats.json' && isObject(value.stats)) return 1;
  return -1;
}

function collectForbiddenKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenKeys(item, found);
    return found;
  }
  if (!isObject(value)) return found;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenPublicKeys.has(key)) found.add(key);
    collectForbiddenKeys(child, found);
  }
  return found;
}

function deploymentCheck(receipt: JsonObject | null, approvedCommit: string): ReceiptCheck {
  const checks = receipt && isObject(receipt.checks) ? receipt.checks : null;
  const current =
    receipt?.status === 'deployed' &&
    receipt.commit === approvedCommit &&
    checks?.credentials === 'success' &&
    checks.configuredInputs === 'success' &&
    checks.durableObjectWorker === 'success' &&
    checks.pagesSecrets === 'success' &&
    checks.pagesDeployment === 'success' &&
    checks.configuredVerification === 'success';
  return {
    path: deploymentReceiptPath,
    state: current ? 'current' : 'failed',
    generatedAt: safeTimestamp(receipt?.generatedAt),
  };
}

function liveAuditCheck(receipt: JsonObject | null, approvedCommit: string): ReceiptCheck {
  const checks = receipt && isObject(receipt.checks) ? receipt.checks : null;
  const result = receipt && isObject(receipt.result) ? receipt.result : null;
  const exactReplay = result && isObject(result.exactReplay) ? result.exactReplay : null;
  const firstPost = result && isObject(result.firstPost) ? result.firstPost : null;
  const changedContent = result && isObject(result.changedContent) ? result.changedContent : null;
  const current =
    receipt?.status === 'complete' &&
    receipt.commit === approvedCommit &&
    checks?.databaseSchema === 'success' &&
    checks.liveJourney === 'success' &&
    result?.status === 'complete' &&
    firstPost?.httpStatus === 202 &&
    exactReplay?.httpStatus === 202 &&
    exactReplay.publicReferenceMatches === true &&
    exactReplay.statusSecretMatches === true &&
    changedContent?.httpStatus === 409;
  return {
    path: liveAuditReceiptPath,
    state: current ? 'current' : 'failed',
    generatedAt: safeTimestamp(receipt?.generatedAt),
  };
}

async function fetchBytes(url: URL): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`public_fetch_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchJson(url: URL): Promise<{ bytes: Uint8Array; value: unknown }> {
  const bytes = await fetchBytes(url);
  return { bytes, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
}

async function inspectPublicProjection(baseUrl: URL) {
  const versionResponse = await fetchJson(new URL('/version.json', baseUrl));
  const manifestResponse = await fetchJson(new URL('/data/manifest.json', baseUrl));
  const version = parsePublicExport('/version.json', versionResponse.value) as PublicVersion;
  const manifest = parsePublicExport('/data/manifest.json', manifestResponse.value) as PublicManifest;
  const allowedPaths = new Set<PublicExportPath>(publicExportPaths);
  const uniquePaths = new Set<string>();
  const fileChecks: Array<{
    path: string;
    schema: 'success' | 'failure';
    digest: 'match' | 'mismatch';
    recordCount: 'match' | 'mismatch';
  }> = [];
  const publicValues = new Map<PublicExportPath, unknown>();

  for (const entry of manifest.files) {
    if (!allowedPaths.has(entry.path) || uniquePaths.has(entry.path)) {
      throw new Error('manifest_path_invalid');
    }
    if (entry.path === '/data/manifest.json' || entry.path === '/version.json') {
      throw new Error('manifest_self_reference');
    }
    uniquePaths.add(entry.path);
    const response = await fetchJson(new URL(entry.path, baseUrl));
    let schema: 'success' | 'failure' = 'success';
    try {
      parsePublicExport(entry.path, response.value);
    } catch {
      schema = 'failure';
    }
    const digest = sha256Bytes(response.bytes) === entry.sha256 ? 'match' : 'mismatch';
    const recordCount = countRecords(entry.path, response.value) === entry.recordCount ? 'match' : 'mismatch';
    fileChecks.push({ path: entry.path, schema, digest, recordCount });
    publicValues.set(entry.path, response.value);
  }

  const forbiddenKeys = [...collectForbiddenKeys([...publicValues.values()])].sort();
  const datasetIdentityMatches =
    version.datasetVersion === manifest.datasetVersion &&
    version.schemaVersion === manifest.schemaVersion &&
    version.generatedAt === manifest.generatedAt;
  const filesPass = fileChecks.every(
    (check) =>
      check.schema === 'success' && check.digest === 'match' && check.recordCount === 'match',
  );
  const candidateExcluded = forbiddenKeys.length === 0;
  const sortedEntries = [...manifest.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ path, sha256, recordCount, schemaVersion, licenses }) => ({
      path,
      sha256,
      recordCount,
      schemaVersion,
      licenses: [...licenses].sort(),
    }));

  return {
    status:
      datasetIdentityMatches && filesPass && candidateExcluded && manifest.canonicalOnly
        ? 'passed'
        : 'failed',
    version: {
      projectId: version.projectId,
      datasetVersion: version.datasetVersion,
      schemaVersion: version.schemaVersion,
      generatedAt: version.generatedAt,
      canonicalOnly: version.canonicalOnly,
      verificationMarker: version.verificationMarker,
      sha256: sha256Bytes(versionResponse.bytes),
    },
    manifest: {
      datasetVersion: manifest.datasetVersion,
      schemaVersion: manifest.schemaVersion,
      generatedAt: manifest.generatedAt,
      canonicalOnly: manifest.canonicalOnly,
      sha256: sha256Bytes(manifestResponse.bytes),
      fileCount: manifest.files.length,
    },
    datasetIdentityMatches,
    candidateExcluded,
    forbiddenKeys,
    files: fileChecks,
    sortedEntries,
  };
}

function safeDeploymentConfiguration(receipt: JsonObject | null, baseUrl: URL): JsonObject {
  const reviewConfiguration = receipt && isObject(receipt.reviewConfiguration)
    ? receipt.reviewConfiguration
    : {};
  return {
    host: baseUrl.hostname,
    derivedSecretsVersion: reviewConfiguration.derivedSecretsVersion ?? null,
    turnstileMode: reviewConfiguration.turnstileMode ?? null,
    browserAction: reviewConfiguration.browserAction ?? null,
    siteverifyExpectedHostname: reviewConfiguration.siteverifyExpectedHostname ?? null,
    siteverifyExpectedAction: reviewConfiguration.siteverifyExpectedAction ?? null,
    contactRetentionDays: reviewConfiguration.contactRetentionDays ?? null,
    rateLimit: reviewConfiguration.rateLimit ?? null,
  };
}

export async function evaluateConfiguredStagingDataQa(input: {
  statusRoot: string;
  approvedCommit: string;
  currentMainCommit: string;
  confirmation: string;
  dataOwner: string;
  workflowRunId: string | null;
  repositoryDataQaOutcome: string;
  migrationCheckOutcome: string;
  liveSchemaOutcome: string;
  liveSchemaPath: string;
  reviewBaseUrl?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.confirmation !== exactConfirmation) {
    throw new Error(`Exact confirmation ${exactConfirmation} is required.`);
  }
  if (!validCommit(input.approvedCommit) || !validCommit(input.currentMainCommit)) {
    throw new Error('Approved and current main commits must be exact lowercase 40-character SHAs.');
  }
  if (!validOwner(input.dataOwner)) throw new Error('A bounded data-owner identity is required.');

  const baseUrl = new URL(input.reviewBaseUrl ?? defaultReviewBaseUrl);
  const deploymentReceipt = readStatusJson(input.statusRoot, deploymentReceiptPath);
  const liveAuditReceipt = readStatusJson(input.statusRoot, liveAuditReceiptPath);
  const deployment = deploymentCheck(deploymentReceipt, input.approvedCommit);
  const liveAudit = liveAuditCheck(liveAuditReceipt, input.approvedCommit);
  const liveSchema = existsSync(input.liveSchemaPath)
    ? (readJson(input.liveSchemaPath) as unknown)
    : null;
  const liveSchemaReady = isObject(liveSchema) && liveSchema.status === 'ready';
  let publicProjection: Awaited<ReturnType<typeof inspectPublicProjection>> | null = null;
  let publicProjectionError: string | null = null;
  try {
    publicProjection = await inspectPublicProjection(baseUrl);
  } catch (error) {
    publicProjectionError = error instanceof Error ? error.message.slice(0, 120) : 'unknown_error';
  }

  const blockers: string[] = [];
  if (input.approvedCommit !== input.currentMainCommit) blockers.push('exact_main:mismatch');
  if (input.repositoryDataQaOutcome !== 'success') blockers.push('repository_data_qa:failed');
  if (input.migrationCheckOutcome !== 'success') blockers.push('migration_history:failed');
  if (input.liveSchemaOutcome !== 'success' || !liveSchemaReady) blockers.push('live_schema:failed');
  if (deployment.state !== 'current') blockers.push('deployment_receipt:failed');
  if (liveAudit.state !== 'current') blockers.push('live_audit_receipt:failed');
  if (publicProjection?.status !== 'passed') blockers.push('public_projection:failed');
  blockers.sort();

  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1_000).toISOString();
  const safeConfiguration = safeDeploymentConfiguration(deploymentReceipt, baseUrl);
  const binding = publicProjection
    ? {
        releaseId: boundedHash({
          commit: input.approvedCommit,
          datasetVersion: publicProjection.version.datasetVersion,
          files: publicProjection.sortedEntries.map(({ path, sha256 }) => ({ path, sha256 })),
        }),
        dataSnapshotId: boundedHash({
          datasetVersion: publicProjection.version.datasetVersion,
          manifestSha256: publicProjection.manifest.sha256,
          files: publicProjection.sortedEntries,
        }),
        configurationId: boundedHash(safeConfiguration),
        environmentId: boundedHash({ environment: 'configured_staging', host: baseUrl.hostname }),
      }
    : null;
  const accepted = blockers.length === 0 && binding !== null;

  return {
    version: 1,
    evidenceId,
    launchDomain: 'data_qa',
    environment: 'configured_staging',
    state: accepted ? 'accepted' : 'failed',
    commit: input.approvedCommit,
    generatedAt,
    expiresAt,
    workflowRunId: input.workflowRunId,
    owner: boundedHash(input.dataOwner.trim()),
    procedure: 'OPS-P6-001D configured staging data QA',
    checks: {
      exactMain: input.approvedCommit === input.currentMainCommit ? 'success' : 'failure',
      repositoryDataQa: input.repositoryDataQaOutcome,
      migrationHistory: input.migrationCheckOutcome,
      liveSchema: {
        outcome: input.liveSchemaOutcome,
        ready: liveSchemaReady,
        migrationCount:
          isObject(liveSchema) && isObject(liveSchema.migrationLedger)
            ? (liveSchema.migrationLedger.migrationCount ?? null)
            : null,
      },
      deployment,
      liveAudit,
      publicProjection: publicProjection
        ? {
            status: publicProjection.status,
            datasetIdentityMatches: publicProjection.datasetIdentityMatches,
            candidateExcluded: publicProjection.candidateExcluded,
            forbiddenKeys: publicProjection.forbiddenKeys,
            version: publicProjection.version,
            manifest: publicProjection.manifest,
            files: publicProjection.files,
          }
        : { status: 'failed', error: publicProjectionError },
    },
    ...(binding ? { binding } : {}),
    exceptions: blockers,
  };
}

async function runSelfTest() {
  const originalFetch = globalThis.fetch;
  try {
    const approvedCommit = 'a'.repeat(40);
    const version = {
      projectId: 'cryptopaymap',
      siteName: 'CryptoPayMap',
      registryType: 'crypto_payment_acceptance',
      datasetVersion: 'test.1',
      schemaVersion: '1.0.0',
      generatedAt: '2026-07-30T00:00:00.000Z',
      canonicalOnly: true,
      verificationMarker: 'reviewed_public_records_only',
    };
    const records = {
      schemaVersion: '1.0.0',
      generatedAt: '2026-07-30T00:00:00.000Z',
      records: [],
    };
    const recordsBytes = new TextEncoder().encode(`${JSON.stringify(records)}\n`);
    const manifest = {
      schemaVersion: '1.0.0',
      generatedAt: '2026-07-30T00:00:00.000Z',
      datasetVersion: 'test.1',
      canonicalOnly: true,
      files: [
        {
          path: '/data/assets.json',
          mediaType: 'application/json',
          schemaVersion: '1.0.0',
          recordCount: 0,
          sha256: sha256Bytes(recordsBytes),
          licenses: ['cpm-public-data'],
        },
      ],
    };
    const responses = new Map<string, Uint8Array>([
      ['/version.json', new TextEncoder().encode(`${JSON.stringify(version)}\n`)],
      ['/data/manifest.json', new TextEncoder().encode(`${JSON.stringify(manifest)}\n`)],
      ['/data/assets.json', recordsBytes],
    ]);
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      const bytes = responses.get(path);
      return bytes
        ? new Response(bytes, { status: 200 })
        : new Response('not found', { status: 404 });
    };
    const projection = await inspectPublicProjection(new URL(defaultReviewBaseUrl));
    if (projection.status !== 'passed') throw new Error('valid projection did not pass');
    manifest.files[0]!.sha256 = '0'.repeat(64);
    responses.set(
      '/data/manifest.json',
      new TextEncoder().encode(`${JSON.stringify(manifest)}\n`),
    );
    const failed = await inspectPublicProjection(new URL(defaultReviewBaseUrl));
    if (failed.status !== 'failed') throw new Error('digest mismatch did not fail');
    console.log('OPS-P6-001D configured staging data QA self-test passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath) {
    throw new Error('Usage: tsx script.ts <status-root> <output-path>');
  }
  const receipt = await evaluateConfiguredStagingDataQa({
    statusRoot,
    approvedCommit: process.env.APPROVED_COMMIT ?? '',
    currentMainCommit: process.env.CURRENT_MAIN_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    dataOwner: process.env.DATA_OWNER ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    repositoryDataQaOutcome: process.env.REPOSITORY_DATA_QA_OUTCOME ?? 'failure',
    migrationCheckOutcome: process.env.MIGRATION_CHECK_OUTCOME ?? 'failure',
    liveSchemaOutcome: process.env.LIVE_SCHEMA_OUTCOME ?? 'failure',
    liveSchemaPath: process.env.LIVE_SCHEMA_PATH ?? 'p6-01-live-schema.json',
    reviewBaseUrl: process.env.CPM_REVIEW_BASE_URL,
  });
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`Configured staging P6-01 state: ${receipt.state}`);
  if (receipt.exceptions.length > 0) console.log(`Exceptions: ${receipt.exceptions.join(', ')}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
