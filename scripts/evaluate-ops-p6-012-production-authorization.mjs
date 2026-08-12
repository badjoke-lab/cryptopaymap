import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'AUTHORIZE_CONFIGURED_PRODUCTION';
const stagingAuthorizationPath = 'config/staging-authorization/authorization-receipt.json';
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const evidenceIds = ['P6-01', 'P6-02', 'P6-03', 'P6-04', 'P6-05', 'P6-06', 'P6-07'];

function digest(value) {
  const hash = createHash('sha256');
  hash.update(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  return `sha256:${hash.digest('hex')}`;
}

function readJson(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
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

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function validOwner(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 100;
}

function boundedInt(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function stagingAuthorization(statusRoot, commit, now) {
  const receipt = readJson(resolve(statusRoot, stagingAuthorizationPath));
  const generatedAt = safeTimestamp(receipt?.generatedAt);
  const binding = receipt?.binding;
  const bindingValid =
    binding !== null &&
    typeof binding === 'object' &&
    !Array.isArray(binding) &&
    bindingKeys.every((key) => validDigest(binding[key]));
  const predecessors = Array.isArray(receipt?.checks?.predecessors)
    ? receipt.checks.predecessors
    : [];
  const predecessorMap = new Map(predecessors.map((item) => [item?.evidenceId, item]));
  const expectedPredecessors = evidenceIds.map((evidenceId) => {
    const item = predecessorMap.get(evidenceId) ?? null;
    const expiresAt = safeTimestamp(item?.expiresAt);
    const current =
      item?.state === 'current' &&
      expiresAt !== null &&
      Date.parse(expiresAt) > now.getTime();
    return {
      evidenceId,
      state: current ? 'current' : item === null ? 'missing' : 'stale_or_failed',
      generatedAt: safeTimestamp(item?.generatedAt),
      expiresAt,
    };
  });
  const earliestExpiry = expectedPredecessors
    .map((item) => (item.expiresAt === null ? Number.NaN : Date.parse(item.expiresAt)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0] ?? null;
  const current =
    receipt?.version === 1 &&
    receipt?.state === 'authorized' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.mode === 'authorization' &&
    receipt?.approvedCommit === commit &&
    generatedAt !== null &&
    receipt?.checks?.deployment?.state === 'current' &&
    receipt?.checks?.liveAudit?.state === 'current' &&
    receipt?.checks?.predecessorBinding === 'matched' &&
    expectedPredecessors.every((item) => item.state === 'current') &&
    Array.isArray(receipt?.blockers) &&
    receipt.blockers.length === 0 &&
    bindingValid;
  return {
    path: stagingAuthorizationPath,
    state: current ? 'current_authorized' : receipt === null ? 'missing' : 'failed_or_stale',
    generatedAt,
    workflowRunId: typeof receipt?.workflowRunId === 'string' ? receipt.workflowRunId : null,
    predecessors: expectedPredecessors,
    predecessorBinding: receipt?.checks?.predecessorBinding ?? null,
    binding: current ? Object.fromEntries(bindingKeys.map((key) => [key, binding[key]])) : null,
    earliestExpiry: current ? earliestExpiry : null,
  };
}

export function evaluateProductionAuthorization(options) {
  const now = options.now instanceof Date ? options.now : new Date();
  const mode = options.mode === 'inventory' ? 'inventory' : 'authorization';
  const commit = String(options.commit ?? '').trim();
  const confirmation = String(options.confirmation ?? '').trim();
  const launchOwner = String(options.launchOwner ?? '').trim();
  const observer = String(options.observer ?? '').trim();
  const rollbackOwner = String(options.rollbackOwner ?? '').trim();
  const communicationOwner = String(options.communicationOwner ?? '').trim();
  const executionWindowMinutes = boundedInt(options.executionWindowMinutes, 5, 60);
  const authorizationTtlMinutes = boundedInt(options.authorizationTtlMinutes, 5, 60);
  const repositoryContractOutcome = String(options.repositoryContractOutcome ?? 'failed');
  const staging = stagingAuthorization(options.statusRoot, commit, now);
  const blockers = [];

  if (!validCommit(commit)) blockers.push('approved_commit:invalid');
  if (repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');
  if (staging.state !== 'current_authorized') blockers.push('configured_staging_authorization:not_current');
  if (!validOwner(launchOwner)) blockers.push('launch_owner:invalid');
  if (!validOwner(observer)) blockers.push('observer:invalid');
  if (!validOwner(rollbackOwner)) blockers.push('rollback_owner:invalid');
  if (!validOwner(communicationOwner)) blockers.push('communication_owner:invalid');

  const owners = [launchOwner, observer, rollbackOwner, communicationOwner].filter(validOwner);
  if (owners.length === 4 && new Set(owners).size !== owners.length) blockers.push('operator_roles:not_distinct');
  if (executionWindowMinutes === null) blockers.push('execution_window:invalid');
  if (authorizationTtlMinutes === null) blockers.push('authorization_ttl:invalid');

  const proposedExpiry =
    authorizationTtlMinutes === null
      ? null
      : new Date(now.getTime() + authorizationTtlMinutes * 60_000).toISOString();
  if (
    proposedExpiry !== null &&
    staging.earliestExpiry !== null &&
    Date.parse(proposedExpiry) >= staging.earliestExpiry
  ) {
    blockers.push('authorization_ttl:exceeds_predecessor_expiry');
  }

  if (mode === 'inventory') blockers.push('explicit_dispatch:required');
  else if (confirmation !== exactConfirmation) blockers.push('confirmation:invalid');

  const uniqueBlockers = [...new Set(blockers)];
  const authorized = mode === 'authorization' && uniqueBlockers.length === 0;
  const binding = staging.binding;
  const generatedAt = now.toISOString();
  const expiresAt = authorized ? proposedExpiry : null;
  const operatorDigests = {
    launchOwner: validOwner(launchOwner) ? digest(launchOwner) : null,
    observer: validOwner(observer) ? digest(observer) : null,
    rollbackOwner: validOwner(rollbackOwner) ? digest(rollbackOwner) : null,
    communicationOwner: validOwner(communicationOwner) ? digest(communicationOwner) : null,
  };
  const authorizationId = digest({
    commit,
    binding,
    operatorDigests,
    generatedAt,
    expiresAt,
    executionWindowMinutes,
    workflowRunId: options.workflowRunId ?? null,
  });

  const receipt = {
    version: 1,
    authorizationId,
    state: authorized ? 'authorized' : 'not_authorized',
    environment: 'configured_production',
    mode,
    approvedCommit: validCommit(commit) ? commit : null,
    generatedAt,
    expiresAt,
    workflowRunId: options.workflowRunId ?? null,
    operators: operatorDigests,
    checks: {
      repositoryContract: repositoryContractOutcome === 'success' ? 'passed' : 'failed',
      configuredStagingAuthorization: {
        path: staging.path,
        state: staging.state,
        generatedAt: staging.generatedAt,
        workflowRunId: staging.workflowRunId,
      },
      predecessors: staging.predecessors,
      predecessorBinding: staging.predecessorBinding,
      operatorSeparation:
        owners.length === 4 && new Set(owners).size === owners.length ? 'passed' : 'failed',
      executionWindow: {
        status: executionWindowMinutes === null ? 'failed' : 'passed',
        minutes: executionWindowMinutes,
      },
      authorizationTtl: {
        status:
          authorizationTtlMinutes !== null &&
          !uniqueBlockers.includes('authorization_ttl:exceeds_predecessor_expiry')
            ? 'passed'
            : 'failed',
        minutes: authorizationTtlMinutes,
        boundedByPredecessorExpiry: staging.earliestExpiry === null ? null : new Date(staging.earliestExpiry).toISOString(),
      },
      productionMutation: false,
    },
    binding,
    blockers: uniqueBlockers,
  };

  writeFileSync(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function fixtureStagingAuthorization(commit, now, overrides = {}) {
  const binding = Object.fromEntries(bindingKeys.map((key) => [key, digest(`fixture:${key}`)]));
  const generatedAt = new Date(now.getTime() - 60_000).toISOString();
  const expiresAt = new Date(now.getTime() + 120 * 60_000).toISOString();
  return {
    version: 1,
    state: 'authorized',
    environment: 'configured_staging',
    mode: 'authorization',
    approvedCommit: commit,
    generatedAt,
    workflowRunId: '1001',
    checks: {
      deployment: { state: 'current' },
      liveAudit: { state: 'current' },
      predecessors: evidenceIds.map((evidenceId) => ({
        evidenceId,
        state: 'current',
        generatedAt,
        expiresAt,
      })),
      predecessorBinding: 'matched',
    },
    binding,
    blockers: [],
    ...overrides,
  };
}

function assert(value, message) {
  if (!value) throw new Error(`self_test_failed:${message}`);
}

function selfTest() {
  const root = mkdtempSync(resolve(tmpdir(), 'cpm-p6-012-'));
  const statusRoot = resolve(root, 'status');
  const outputPath = resolve(root, 'receipt.json');
  const authPath = resolve(statusRoot, stagingAuthorizationPath);
  const commit = 'a'.repeat(40);
  const now = new Date('2026-08-12T00:00:00.000Z');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(resolve(authPath, '..'), { recursive: true });

  const base = {
    statusRoot,
    outputPath,
    commit,
    confirmation: exactConfirmation,
    launchOwner: 'production-launch-owner',
    observer: 'production-independent-observer',
    rollbackOwner: 'production-rollback-owner',
    communicationOwner: 'production-communication-owner',
    executionWindowMinutes: '30',
    authorizationTtlMinutes: '30',
    repositoryContractOutcome: 'success',
    workflowRunId: '2002',
    now,
  };

  try {
    writeFileSync(authPath, `${JSON.stringify(fixtureStagingAuthorization(commit, now), null, 2)}\n`);
    let receipt = evaluateProductionAuthorization(base);
    assert(receipt.state === 'authorized', 'valid explicit authorization must pass');
    assert(receipt.checks.productionMutation === false, 'authorization must not mutate production');
    assert(receipt.checks.operatorSeparation === 'passed', 'operator roles must be separated');

    receipt = evaluateProductionAuthorization({ ...base, mode: 'inventory' });
    assert(receipt.state === 'not_authorized', 'inventory must not authorize');
    assert(receipt.blockers.includes('explicit_dispatch:required'), 'inventory must require explicit dispatch');

    receipt = evaluateProductionAuthorization({ ...base, confirmation: 'WRONG' });
    assert(receipt.blockers.includes('confirmation:invalid'), 'wrong confirmation must fail');

    receipt = evaluateProductionAuthorization({ ...base, observer: base.launchOwner });
    assert(receipt.blockers.includes('operator_roles:not_distinct'), 'duplicate operator roles must fail');

    const stale = fixtureStagingAuthorization(commit, now);
    stale.checks.predecessors[0].expiresAt = new Date(now.getTime() - 1_000).toISOString();
    writeFileSync(authPath, `${JSON.stringify(stale, null, 2)}\n`);
    receipt = evaluateProductionAuthorization(base);
    assert(receipt.blockers.includes('configured_staging_authorization:not_current'), 'stale staging evidence must fail');

    writeFileSync(authPath, `${JSON.stringify(fixtureStagingAuthorization('b'.repeat(40), now), null, 2)}\n`);
    receipt = evaluateProductionAuthorization(base);
    assert(receipt.blockers.includes('configured_staging_authorization:not_current'), 'wrong staging commit must fail');

    const short = fixtureStagingAuthorization(commit, now);
    for (const item of short.checks.predecessors) {
      item.expiresAt = new Date(now.getTime() + 20 * 60_000).toISOString();
    }
    writeFileSync(authPath, `${JSON.stringify(short, null, 2)}\n`);
    receipt = evaluateProductionAuthorization(base);
    assert(receipt.blockers.includes('authorization_ttl:exceeds_predecessor_expiry'), 'authorization may not outlive evidence');

    console.log('OPS-P6-012 configured production authorization self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath) throw new Error('Usage: evaluator <status-root> <output-path>');
  const receipt = evaluateProductionAuthorization({
    statusRoot,
    outputPath,
    commit: process.env.APPROVED_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    launchOwner: process.env.LAUNCH_OWNER ?? '',
    observer: process.env.OBSERVER ?? '',
    rollbackOwner: process.env.ROLLBACK_OWNER ?? '',
    communicationOwner: process.env.COMMUNICATION_OWNER ?? '',
    executionWindowMinutes: process.env.EXECUTION_WINDOW_MINUTES ?? '',
    authorizationTtlMinutes: process.env.AUTHORIZATION_TTL_MINUTES ?? '',
    repositoryContractOutcome: process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failed',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    mode: process.env.EVALUATION_MODE ?? 'authorization',
  });
  console.log(`Configured production authorization state: ${receipt.state}`);
  if (receipt.blockers.length > 0) console.log(`Blockers: ${receipt.blockers.join(', ')}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
