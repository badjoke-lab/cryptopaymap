import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const predecessorSpecs = Object.freeze(
  [
    ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
    ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
    ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
    ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
    ['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json'],
    ['P6-06', 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json'],
    ['P6-07', 'config/staging-authorization/p6-07-operations-recovery-receipt.json'],
  ].map(([evidenceId, path]) => Object.freeze({ evidenceId, path })),
);

const deploymentPath = 'config/staging-review/deployment-receipt.json';
const liveAuditPath = 'config/staging-review/p5-02r-live-audit-receipt.json';
const exactConfirmation = 'AUTHORIZE_CONFIGURED_STAGING';
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const boundedIdentityPattern = /^[A-Za-z0-9][A-Za-z0-9:._/-]{7,199}$/;

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

function validIsoTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function safeTimestamp(value) {
  return validIsoTimestamp(value) ? value : null;
}

function hashIdentity(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function requireOperatorIdentity(value, label) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 100) {
    throw new Error(`${label} must be a bounded non-empty operator identity.`);
  }
  return value.trim();
}

function deploymentCheck(root, approvedCommit) {
  const loaded = readJson(root, deploymentPath);
  if (loaded.state !== 'parsed') {
    return { path: deploymentPath, state: loaded.state, generatedAt: null };
  }
  const receipt = loaded.value;
  const checks = isObject(receipt.checks) ? Object.values(receipt.checks) : [];
  const current =
    receipt.status === 'deployed' &&
    receipt.commit === approvedCommit &&
    checks.length === 6 &&
    checks.every((value) => value === 'success');
  return {
    path: deploymentPath,
    state: current ? 'current' : 'failed',
    generatedAt: safeTimestamp(receipt.generatedAt),
  };
}

function liveAuditCheck(root, approvedCommit) {
  const loaded = readJson(root, liveAuditPath);
  if (loaded.state !== 'parsed') {
    return { path: liveAuditPath, state: loaded.state, generatedAt: null };
  }
  const receipt = loaded.value;
  const checks = isObject(receipt.checks) ? receipt.checks : {};
  const result = isObject(receipt.result) ? receipt.result : {};
  const current =
    receipt.status === 'complete' &&
    receipt.commit === approvedCommit &&
    checks.databaseSchema === 'success' &&
    checks.liveJourney === 'success' &&
    checks.schemaResultParsed === true &&
    checks.auditResultParsed === true &&
    result.status === 'complete' &&
    result.firstPost?.httpStatus === 202 &&
    result.exactReplay?.httpStatus === 202 &&
    result.exactReplay?.publicReferenceMatches === true &&
    result.exactReplay?.statusSecretMatches === true &&
    result.changedContent?.httpStatus === 409;
  return {
    path: liveAuditPath,
    state: current ? 'current' : 'failed',
    generatedAt: safeTimestamp(receipt.generatedAt),
  };
}

function predecessorCheck(root, spec, approvedCommit, evaluatedAt) {
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
  const binding = isObject(receipt.binding) ? receipt.binding : null;
  const bindingValid =
    binding !== null &&
    bindingKeys.every(
      (key) => typeof binding[key] === 'string' && boundedIdentityPattern.test(binding[key]),
    );
  const generatedAt = safeTimestamp(receipt.generatedAt);
  const expiresAt = safeTimestamp(receipt.expiresAt);
  let state = 'failed';
  if (
    receipt.version === 1 &&
    receipt.evidenceId === spec.evidenceId &&
    receipt.environment === 'configured_staging' &&
    receipt.state === 'accepted' &&
    receipt.commit === approvedCommit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > evaluatedAt.getTime() &&
    bindingValid
  ) {
    state = 'current';
  } else if (expiresAt !== null && Date.parse(expiresAt) <= evaluatedAt.getTime()) {
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
  const current = predecessors.filter((receipt) => receipt.state === 'current');
  if (current.length !== predecessorSpecs.length) return false;
  const first = JSON.stringify(current[0].binding);
  return current.every((receipt) => JSON.stringify(receipt.binding) === first);
}

export function evaluateConfiguredStagingAuthorization({
  statusRoot,
  approvedCommit,
  confirmation,
  launchOwner,
  observer,
  rollbackOwner,
  workflowRunId = null,
  evaluatedAt = new Date(),
  mode = 'authorization',
}) {
  if (confirmation !== exactConfirmation) {
    throw new Error(`Exact confirmation ${exactConfirmation} is required.`);
  }
  if (!/^[a-f0-9]{40}$/.test(approvedCommit)) {
    throw new Error('approvedCommit must be an exact 40-character lowercase commit SHA.');
  }
  if (!['authorization', 'inventory'].includes(mode)) {
    throw new Error('mode must be authorization or inventory.');
  }
  const operators = {
    launchOwner: hashIdentity(requireOperatorIdentity(launchOwner, 'launchOwner')),
    observer: hashIdentity(requireOperatorIdentity(observer, 'observer')),
    rollbackOwner: hashIdentity(requireOperatorIdentity(rollbackOwner, 'rollbackOwner')),
  };
  const deployment = deploymentCheck(statusRoot, approvedCommit);
  const liveAudit = liveAuditCheck(statusRoot, approvedCommit);
  const predecessors = predecessorSpecs.map((spec) =>
    predecessorCheck(statusRoot, spec, approvedCommit, evaluatedAt),
  );
  const sharedBinding = bindingsMatch(predecessors);
  const blockers = [];
  if (deployment.state !== 'current') blockers.push(`deployment_receipt:${deployment.state}`);
  if (liveAudit.state !== 'current') blockers.push(`live_audit_receipt:${liveAudit.state}`);
  for (const receipt of predecessors) {
    if (receipt.state !== 'current') blockers.push(`${receipt.evidenceId}:${receipt.state}`);
  }
  if (predecessors.every((receipt) => receipt.state === 'current') && !sharedBinding) {
    blockers.push('predecessor_binding:mismatch');
  }
  if (mode !== 'authorization') blockers.push('explicit_dispatch:required');
  blockers.sort();
  const authorized = blockers.length === 0;
  const generatedAt = evaluatedAt.toISOString();
  return {
    version: 1,
    authorizationId: hashIdentity(
      ['configured_staging', approvedCommit, workflowRunId ?? 'manual', generatedAt].join(':'),
    ),
    state: authorized ? 'authorized' : 'not_authorized',
    environment: 'configured_staging',
    mode,
    approvedCommit,
    generatedAt,
    workflowRunId,
    operators,
    checks: {
      deployment,
      liveAudit,
      predecessors: predecessors.map(({ binding, ...receipt }) => receipt),
      predecessorBinding: sharedBinding ? 'matched' : 'unproven',
    },
    ...(authorized ? { binding: predecessors[0].binding } : {}),
    blockers,
  };
}

function writeFixture(root, relativePath, value) {
  const absolutePath = resolve(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Self-test failed: ${message}`);
}

function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-ops-p6-001c-'));
  const approvedCommit = 'a'.repeat(40);
  const evaluatedAt = new Date('2026-07-30T00:00:00.000Z');
  const common = {
    statusRoot: root,
    approvedCommit,
    confirmation: exactConfirmation,
    launchOwner: 'launch-owner',
    observer: 'independent-observer',
    rollbackOwner: 'rollback-owner',
    workflowRunId: 'self-test',
    evaluatedAt,
  };
  try {
    let receipt = evaluateConfiguredStagingAuthorization(common);
    assert(receipt.state === 'not_authorized', 'missing evidence must not authorize');
    assert(receipt.blockers.includes('P6-01:missing'), 'missing P6-01 must be named');

    writeFixture(root, deploymentPath, {
      status: 'deployed',
      commit: approvedCommit,
      generatedAt: '2026-07-29T23:50:00.000Z',
      checks: {
        credentials: 'success',
        configuredInputs: 'success',
        durableObjectWorker: 'success',
        pagesSecrets: 'success',
        pagesDeployment: 'success',
        configuredVerification: 'success',
      },
    });
    writeFixture(root, liveAuditPath, {
      status: 'complete',
      commit: approvedCommit,
      generatedAt: '2026-07-29T23:55:00.000Z',
      checks: {
        databaseSchema: 'success',
        schemaResultParsed: true,
        liveJourney: 'success',
        auditResultParsed: true,
      },
      result: {
        status: 'complete',
        firstPost: { httpStatus: 202 },
        exactReplay: {
          httpStatus: 202,
          publicReferenceMatches: true,
          statusSecretMatches: true,
        },
        changedContent: { httpStatus: 409 },
      },
    });
    const binding = {
      releaseId: 'sha256:release000000000000000000000000000000000000000000000000000000000000',
      dataSnapshotId: 'sha256:data000000000000000000000000000000000000000000000000000000000000000',
      configurationId: 'sha256:config0000000000000000000000000000000000000000000000000000000000000',
      environmentId: 'sha256:environment0000000000000000000000000000000000000000000000000000000000',
    };
    for (const spec of predecessorSpecs) {
      writeFixture(root, spec.path, {
        version: 1,
        evidenceId: spec.evidenceId,
        environment: 'configured_staging',
        state: 'accepted',
        commit: approvedCommit,
        generatedAt: '2026-07-29T23:58:00.000Z',
        expiresAt: '2026-07-31T00:00:00.000Z',
        binding,
      });
    }
    receipt = evaluateConfiguredStagingAuthorization(common);
    assert(receipt.state === 'authorized', 'complete matching evidence must authorize');
    assert(receipt.blockers.length === 0, 'authorized receipt must have no blockers');

    const staleSpec = predecessorSpecs[3];
    writeFixture(root, staleSpec.path, {
      version: 1,
      evidenceId: staleSpec.evidenceId,
      environment: 'configured_staging',
      state: 'accepted',
      commit: approvedCommit,
      generatedAt: '2026-07-28T00:00:00.000Z',
      expiresAt: '2026-07-29T00:00:00.000Z',
      binding,
    });
    receipt = evaluateConfiguredStagingAuthorization(common);
    assert(receipt.state === 'not_authorized', 'expired evidence must fail closed');
    assert(receipt.blockers.includes('P6-04:stale'), 'stale predecessor must be named');
    console.log('OPS-P6-001C staging authorization self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath) {
    throw new Error('Usage: node script.mjs <status-root> <output-path>');
  }
  const receipt = evaluateConfiguredStagingAuthorization({
    statusRoot,
    approvedCommit: process.env.APPROVED_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    launchOwner: process.env.LAUNCH_OWNER ?? '',
    observer: process.env.OBSERVER ?? '',
    rollbackOwner: process.env.ROLLBACK_OWNER ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    mode: process.env.EVALUATION_MODE ?? 'authorization',
  });
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`Configured staging authorization state: ${receipt.state}`);
  if (receipt.blockers.length > 0) console.log(`Blockers: ${receipt.blockers.join(', ')}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) main();
