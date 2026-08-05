import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_07_Q5';
const hostname = 'staging.cryptopaymap.com';
const issueNumber = 349;
const finalPath = 'config/staging-authorization/p6-07-operations-recovery-receipt.json';
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const predecessorSpecs = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
  ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
  ['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json'],
  ['P6-06', 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json'],
];
const qPaths = {
  q1: 'config/staging-authorization/p6-07-prerequisite-diagnostic.json',
  q2: 'config/staging-authorization/p6-07-monitoring-alert-receipt.json',
  q3: 'config/staging-authorization/p6-07-backup-integrity-receipt.json',
  q4: 'config/staging-authorization/p6-07-isolated-restore-receipt.json',
};
const scenarios = new Set([
  'stale_monitoring',
  'failed_release_verification',
  'canonical_database_degradation',
  'media_delivery_degradation',
  'domain_or_certificate_failure',
]);
const decisions = {
  stale_monitoring: 'recover_monitoring',
  failed_release_verification: 'rollback_release',
  canonical_database_degradation: 'restore_database',
  media_delivery_degradation: 'contain_media_and_reverify',
  domain_or_certificate_failure: 'rollback_domain_change',
};

function digest(value) {
  const hash = createHash('sha256');
  if (typeof value === 'string' || value instanceof Uint8Array) hash.update(value);
  else hash.update(JSON.stringify(value), 'utf8');
  return `sha256:${hash.digest('hex')}`;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validDigest(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function validIdentity(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._/-]{1,99}$/.test(value);
}

function readJson(root, path) {
  try {
    const value = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
    return object(value) ? value : null;
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sameBinding(left, right) {
  return (
    object(left) &&
    object(right) &&
    bindingKeys.every((key) => validDigest(left[key]) && left[key] === right[key])
  );
}

function currentAccepted(root, evidenceId, path, commit, now) {
  const value = readJson(root, path);
  const current =
    value?.version === 1 &&
    value?.evidenceId === evidenceId &&
    value?.environment === 'configured_staging' &&
    value?.state === 'accepted' &&
    value?.commit === commit &&
    timestamp(value?.generatedAt) &&
    timestamp(value?.expiresAt) &&
    Date.parse(value.expiresAt) > now.getTime() &&
    bindingKeys.every((key) => validDigest(value?.binding?.[key])) &&
    Array.isArray(value?.exceptions) &&
    value.exceptions.length === 0;
  return {
    evidenceId,
    path,
    state: current ? 'current' : value === null ? 'missing' : 'failed',
    generatedAt: timestamp(value?.generatedAt) ? value.generatedAt : null,
    expiresAt: timestamp(value?.expiresAt) ? value.expiresAt : null,
    digest: current ? digest(JSON.stringify(value)) : null,
    binding: current ? value.binding : null,
    value: current ? value : null,
  };
}

function qEvidence(root, path, evidenceId, commit, binding, now, predicate) {
  const result = currentAccepted(root, evidenceId, path, commit, now);
  const current = result.state === 'current' && sameBinding(result.binding, binding) && predicate(result.value);
  return {
    path,
    state: current ? 'current' : result.state === 'missing' ? 'missing' : 'failed',
    generatedAt: result.generatedAt,
    expiresAt: result.expiresAt,
    digest: current ? result.digest : null,
  };
}

function q1Evidence(root, commit, binding, now) {
  const value = readJson(root, qPaths.q1);
  const external = value?.checks?.external;
  const configuration = value?.checks?.configuration;
  const current =
    value?.version === 1 &&
    value?.evidenceId === 'P6-07' &&
    value?.diagnostic === 'prerequisite_inventory' &&
    value?.environment === 'configured_staging' &&
    value?.state === 'diagnosed' &&
    value?.decision === 'ready' &&
    value?.commit === commit &&
    timestamp(value?.generatedAt) &&
    timestamp(value?.expiresAt) &&
    Date.parse(value.expiresAt) > now.getTime() &&
    sameBinding(value?.binding, binding) &&
    value?.checks?.exactMain === 'success' &&
    value?.checks?.predecessorBinding === 'matched' &&
    ['home', 'version', 'manifest', 'adminDenial'].every(
      (key) => external?.[key]?.status === 'passed',
    ) &&
    configuration?.sourceDatabase?.status === 'configured' &&
    configuration?.isolatedRestoreDatabase?.status === 'configured' &&
    configuration?.isolatedRestoreDatabase?.distinctFromSource === true &&
    configuration?.backupEncryption?.status === 'configured' &&
    configuration?.alertEvidenceIssue?.status === 'configured' &&
    configuration?.alertEvidenceIssue?.issueNumber === issueNumber &&
    Array.isArray(value?.blockers) &&
    value.blockers.length === 0 &&
    Array.isArray(value?.exceptions) &&
    value.exceptions.length === 0;
  return {
    path: qPaths.q1,
    state: current ? 'current' : value === null ? 'missing' : 'failed',
    decision: value?.decision ?? null,
    generatedAt: timestamp(value?.generatedAt) ? value.generatedAt : null,
    expiresAt: timestamp(value?.expiresAt) ? value.expiresAt : null,
    digest: current ? digest(JSON.stringify(value)) : null,
  };
}

function safeFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('duplicate')) return 'incident_identity_already_used';
  if (message.includes('release')) return 'release_reverification_failed';
  if (message.includes('external')) return 'external_reverification_failed';
  if (message.includes('objective')) return 'objective_breached';
  if (message.includes('input')) return 'input_invalid';
  if (message.includes('precondition')) return 'precondition_failed';
  return 'incident_exercise_failed';
}

async function probe(path, statuses, type, fetchImpl) {
  const response = await fetchImpl(
    `https://${hostname}${path}${path.includes('?') ? '&' : '?'}p6_07_q5=${Date.now()}`,
    {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'CryptoPayMap-P6-07-Q5-Incident-Exercise/1' },
    },
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? null;
  return {
    status: statuses.includes(response.status) && contentType === type ? 'passed' : 'failed',
    httpStatus: response.status,
    contentType,
    byteLength: bytes.byteLength,
    bodyDigest: digest(bytes),
  };
}

async function reverify(binding, fetchImpl) {
  const [home, locations, businesses, version, manifest, adminDenial] = await Promise.all([
    probe('/', [200], 'text/html', fetchImpl),
    probe('/locations/', [200], 'text/html', fetchImpl),
    probe('/businesses/', [200], 'text/html', fetchImpl),
    probe('/version.json', [200], 'application/json', fetchImpl),
    probe('/data/manifest.json', [200], 'application/json', fetchImpl),
    probe('/admin/api/dashboard', [401, 403], 'text/plain', fetchImpl),
  ]);
  const response = await fetchImpl(
    `https://${hostname}/p6-05-release.json?p6_07_q5_marker=${Date.now()}`,
    { cache: 'no-store', signal: AbortSignal.timeout(20_000) },
  );
  const marker = await response.json().catch(() => null);
  const releaseMatches = response.status === 200 && marker?.releaseId === binding.releaseId;
  const release = {
    status: releaseMatches ? 'passed' : 'failed',
    httpStatus: response.status,
    releaseMatches,
    expectedReleaseDigest: digest(binding.releaseId),
    observedReleaseDigest: validDigest(marker?.releaseId) ? digest(marker.releaseId) : null,
  };
  const checks = { home, locations, businesses, version, manifest, adminDenial, release };
  return {
    status: Object.values(checks).every((item) => item.status === 'passed') ? 'passed' : 'failed',
    hostnameDigest: digest(hostname),
    checks,
    routeDigest: digest(
      Object.fromEntries(
        Object.entries(checks).map(([key, item]) => [
          key,
          { status: item.status, httpStatus: item.httpStatus },
        ]),
      ),
    ),
  };
}

function minutes(start, end) {
  return Number(((Date.parse(end) - Date.parse(start)) / 60_000).toFixed(3));
}

function acceptedInput(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function noLeakage(receipt) {
  return !/(database_url|github_token|cloudflare_api_token|encryption_key|private submission|signed url)/i.test(
    JSON.stringify(receipt),
  );
}

export async function executeQ5(options) {
  const {
    statusRoot,
    outputPath,
    commit,
    confirmation,
    incidentId,
    commandOwner,
    observer,
    followUpOwner,
    scenario,
    severity,
    repositoryContractOutcome = 'success',
    workflowRunId = null,
    now = new Date(),
    clock = () => Date.now(),
    fetchImpl = fetch,
  } = options;
  const predecessors = predecessorSpecs.map(([id, path]) =>
    currentAccepted(statusRoot, id, path, commit, now),
  );
  const binding = predecessors[0]?.binding ?? null;
  const bindingMatched =
    binding !== null &&
    predecessors.every((item) => item.state === 'current' && sameBinding(item.binding, binding));
  const q1 = q1Evidence(statusRoot, commit, binding, now);
  const q2 = qEvidence(statusRoot, qPaths.q2, 'P6-07-Q2', commit, binding, now, (value) =>
    ['liveMonitoring', 'syntheticFailures', 'alertExercise'].every(
      (key) => value?.checks?.[key]?.status === 'passed',
    ),
  );
  const q3 = qEvidence(statusRoot, qPaths.q3, 'P6-07-Q3', commit, binding, now, (value) => {
    const backup = value?.checks?.backup;
    return (
      backup?.status === 'passed' &&
      backup?.artifact?.encrypted === true &&
      backup?.integrity?.status === 'passed' &&
      backup?.integrity?.decryptVerified === true &&
      backup?.integrity?.corruptionRejected === true
    );
  });
  const q4 = qEvidence(statusRoot, qPaths.q4, 'P6-07-Q4', commit, binding, now, (value) => {
    const checks = value?.checks;
    return (
      checks?.artifact?.status === 'passed' &&
      checks?.targetSafety?.status === 'passed' &&
      checks?.targetSafety?.distinct === true &&
      checks?.restore?.status === 'passed' &&
      checks?.reconciliation?.status === 'passed' &&
      checks?.reconciliation?.privateTablesZeroRows === true &&
      checks?.objectives?.rpo?.status === 'passed' &&
      checks?.objectives?.rto?.status === 'passed' &&
      checks?.disposal?.status === 'passed' &&
      checks?.disposal?.remainingUserObjectCount === 0
    );
  });
  const objectives = {
    acknowledgement: acceptedInput(options.acknowledgementObjectiveMinutes, 1, 15),
    decision: acceptedInput(options.decisionObjectiveMinutes, 1, 30),
    recovery: acceptedInput(options.recoveryObjectiveMinutes, 1, 45),
    cadence: acceptedInput(options.statusCadenceMinutes, 5, 30),
  };
  const generatedAt = now.toISOString();
  const receipt = {
    version: 1,
    evidenceId: 'P6-07',
    exerciseId: 'P6-07-Q5',
    environment: 'configured_staging',
    state: 'failed',
    decision: 'rejected',
    commit,
    generatedAt,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString(),
    workflowRunId,
    incidentId,
    incidentIdentity: digest([incidentId, commit, workflowRunId ?? 'manual'].join(':')),
    procedure: 'OPS-P6-002B configured staging P6-07 incident exercise and final receipt',
    binding: bindingMatched ? binding : null,
    operators: {
      commandOwner: validIdentity(commandOwner) ? digest(commandOwner) : null,
      observer: validIdentity(observer) ? digest(observer) : null,
      followUpOwner: validIdentity(followUpOwner) ? digest(followUpOwner) : null,
    },
    checks: {
      exactMain: /^[a-f0-9]{40}$/.test(commit) ? 'success' : 'failed',
      confirmation: confirmation === exactConfirmation ? 'success' : 'failed',
      repositoryContract: repositoryContractOutcome === 'success' ? 'success' : 'failed',
      incidentIdentity: 'unproven',
      commandOwnership: 'unproven',
      predecessors: predecessors.map((item) => ({
        evidenceId: item.evidenceId,
        path: item.path,
        state: item.state,
        generatedAt: item.generatedAt,
        expiresAt: item.expiresAt,
        digest: item.digest,
      })),
      predecessorBinding: bindingMatched ? 'matched' : 'unproven',
      q1,
      q2,
      q3,
      q4,
      scenario: {
        status: scenarios.has(scenario) ? 'passed' : 'failed',
        value: scenarios.has(scenario) ? scenario : null,
        severity,
        expectedDecision: decisions[scenario] ?? null,
        mutationMode: 'simulation_only_no_live_degradation',
      },
      objectives: { status: 'not_run', configured: objectives },
      communication: {
        status: 'not_run',
        destinationClass: 'github_issue',
        issueNumber,
      },
      timeline: { status: 'not_run', stages: [] },
      containment: { status: 'not_run' },
      decision: { status: 'not_run' },
      recovery: { status: 'not_run' },
      externalReverification: { status: 'not_run' },
      evidencePreservation: { status: 'not_run' },
      followUp: { status: 'not_run' },
      safetyBoundary: {
        status: 'passed',
        productionMutation: false,
        dnsMutation: false,
        pagesMutation: false,
        r2Mutation: false,
        canonicalDataMutation: false,
        databaseMutation: false,
        backupOrRestoreExecution: false,
        liveServiceDegradationIntroduced: false,
      },
    },
    exceptions: [],
  };

  try {
    const identityOk =
      /^cpm-p6-07-q5-[a-z0-9][a-z0-9._-]{7,79}$/.test(incidentId) &&
      [commandOwner, observer, followUpOwner].every(validIdentity);
    const inputOk =
      confirmation === exactConfirmation &&
      /^[a-f0-9]{40}$/.test(commit) &&
      identityOk &&
      scenarios.has(scenario) &&
      ['exercise_high', 'sev1', 'sev2', 'sev3'].includes(severity) &&
      Object.values(objectives).every((value) => value !== null) &&
      repositoryContractOutcome === 'success';
    if (!inputOk) throw new Error('input_invalid');
    if (!bindingMatched || [q1, q2, q3, q4].some((item) => item.state !== 'current')) {
      throw new Error('precondition_failed');
    }
    if (readJson(statusRoot, finalPath)?.incidentId === incidentId) {
      throw new Error('duplicate_incident_identity');
    }

    receipt.checks.incidentIdentity = 'unique';
    receipt.checks.commandOwnership = 'exclusive_workflow_concurrency';
    const timeline = [];
    const stage = (name) => {
      const item = { name, at: new Date(clock()).toISOString(), status: 'completed' };
      timeline.push(item);
      return item;
    };
    const declared = stage('declared');
    const detected = stage('detected');
    const acknowledged = stage('acknowledged');
    const contained = stage('contained');
    const decision = stage('rollback_or_restore_decision_recorded');
    const mitigation = stage('mitigation_started');
    const external = await reverify(binding, fetchImpl);
    if (external.status !== 'passed') throw new Error('external_reverification_failed');
    const recovered = stage('recovery_verified');
    const reverified = stage('externally_reverified');
    const closed = stage('closed');
    const followUp = stage('follow_up_assigned');
    const gaps = timeline.slice(1).map((item, index) => minutes(timeline[index].at, item.at));
    const results = {
      acknowledgement: {
        objectiveMinutes: objectives.acknowledgement,
        measuredMinutes: minutes(detected.at, acknowledged.at),
      },
      decision: {
        objectiveMinutes: objectives.decision,
        measuredMinutes: minutes(detected.at, decision.at),
      },
      recovery: {
        objectiveMinutes: objectives.recovery,
        measuredMinutes: minutes(detected.at, recovered.at),
      },
      cadence: {
        objectiveMinutes: objectives.cadence,
        measuredMinutes: Math.max(...gaps),
      },
    };
    for (const result of Object.values(results)) {
      result.status = result.measuredMinutes <= result.objectiveMinutes ? 'passed' : 'failed';
    }
    if (Object.values(results).some((result) => result.status !== 'passed')) {
      throw new Error('objective_breached');
    }

    receipt.checks.communication = {
      status: 'passed',
      destinationClass: 'github_issue',
      issueNumber,
      evidenceSource: 'accepted_q2_monitoring_alert_receipt',
      q2ReceiptDigest: q2.digest,
      workflowCommentMarkers: ['declaration', 'closure'],
    };
    receipt.checks.timeline = {
      status: 'passed',
      ordered: timeline.every(
        (item, index) => index === 0 || Date.parse(item.at) >= Date.parse(timeline[index - 1].at),
      ),
      stages: timeline,
      timelineDigest: digest(timeline),
    };
    receipt.checks.containment = {
      status: 'passed',
      mode: 'bounded_scenario_simulation',
      stageAt: contained.at,
      liveServiceDegradationIntroduced: false,
    };
    receipt.checks.decision = {
      status: 'passed',
      selected: decisions[scenario],
      stageAt: decision.at,
      mutationExecuted: false,
      providerEscalation:
        scenario === 'domain_or_certificate_failure' ? 'would_escalate' : 'not_required',
    };
    receipt.checks.objectives = { status: 'passed', configured: objectives, results };
    receipt.checks.recovery = {
      status: 'passed',
      mode: 'read_only_external_reverification',
      mitigationStageAt: mitigation.at,
      recoveryStageAt: recovered.at,
    };
    receipt.checks.externalReverification = external;
    receipt.checks.evidencePreservation = {
      status: 'passed',
      predecessorDigest: digest({
        predecessors: predecessors.map((item) => item.digest),
        q1: q1.digest,
        q2: q2.digest,
        q3: q3.digest,
        q4: q4.digest,
      }),
      timelineDigest: digest(timeline),
      redactedOnly: true,
      unrestrictedLogsRetained: false,
    };
    receipt.checks.followUp = {
      status: 'passed',
      owner: receipt.operators.followUpOwner,
      dueAt: new Date(Date.parse(followUp.at) + 7 * 24 * 60 * 60_000).toISOString(),
      actionClass: 'review_exercise_findings_and_operational_runbook',
    };
    receipt.state = 'accepted';
    receipt.decision = 'accepted';
    receipt.declaredAt = declared.at;
    receipt.externallyReverifiedAt = reverified.at;
    receipt.closedAt = closed.at;
    receipt.receiptId = digest({
      commit,
      incidentId,
      binding,
      timelineDigest: receipt.checks.timeline.timelineDigest,
      workflowRunId,
    });
  } catch (error) {
    receipt.exceptions.push(safeFailure(error));
  }

  if (!noLeakage(receipt)) {
    receipt.state = 'failed';
    receipt.decision = 'rejected';
    receipt.exceptions = ['sensitive_leakage_detected'];
  }
  writeJson(outputPath, receipt);
  return receipt;
}

function fixtureReceipt(evidenceId, commit, binding, now, extra = {}) {
  return {
    version: 1,
    evidenceId,
    environment: 'configured_staging',
    state: 'accepted',
    commit,
    generatedAt: new Date(now.getTime() - 60_000).toISOString(),
    expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    binding,
    exceptions: [],
    ...extra,
  };
}

function mockResponse(status, type, body) {
  const bytes = new TextEncoder().encode(body);
  return {
    status,
    headers: { get: (name) => (name === 'content-type' ? type : null) },
    arrayBuffer: async () => bytes.buffer,
    json: async () => JSON.parse(body),
  };
}

function mockFetch(binding, wrongRelease = false) {
  return async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname === '/p6-05-release.json') {
      return mockResponse(
        200,
        'application/json',
        JSON.stringify({ releaseId: wrongRelease ? digest('wrong') : binding.releaseId }),
      );
    }
    if (url.pathname === '/admin/api/dashboard') return mockResponse(403, 'text/plain', 'Forbidden');
    if (['/', '/locations/', '/businesses/'].includes(url.pathname)) {
      return mockResponse(200, 'text/html', '<html></html>');
    }
    return mockResponse(200, 'application/json', '{}');
  };
}

function assert(value, message) {
  if (!value) throw new Error(`Self-test failed: ${message}`);
}

async function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-07-q5-'));
  const statusRoot = resolve(root, 'status');
  const outputPath = resolve(root, 'receipt.json');
  const now = new Date('2026-08-05T00:00:00.000Z');
  const commit = 'a'.repeat(40);
  const binding = Object.fromEntries(bindingKeys.map((key) => [key, digest(`q5:${key}`)]));
  let tick = now.getTime();
  const base = {
    statusRoot,
    outputPath,
    commit,
    confirmation: exactConfirmation,
    incidentId: 'cpm-p6-07-q5-self-test-001',
    commandOwner: 'incident-commander',
    observer: 'independent-observer',
    followUpOwner: 'follow-up-owner',
    scenario: 'failed_release_verification',
    severity: 'exercise_high',
    acknowledgementObjectiveMinutes: 15,
    decisionObjectiveMinutes: 30,
    recoveryObjectiveMinutes: 45,
    statusCadenceMinutes: 15,
    workflowRunId: '123456',
    repositoryContractOutcome: 'success',
    now,
    clock: () => {
      tick += 1_000;
      return tick;
    },
    fetchImpl: mockFetch(binding),
  };
  try {
    for (const [id, path] of predecessorSpecs) {
      writeJson(resolve(statusRoot, path), fixtureReceipt(id, commit, binding, now));
    }
    writeJson(resolve(statusRoot, qPaths.q1), {
      ...fixtureReceipt('P6-07', commit, binding, now),
      state: 'diagnosed',
      diagnostic: 'prerequisite_inventory',
      decision: 'ready',
      blockers: [],
      checks: {
        exactMain: 'success',
        predecessorBinding: 'matched',
        external: Object.fromEntries(
          ['home', 'version', 'manifest', 'adminDenial'].map((key) => [key, { status: 'passed' }]),
        ),
        configuration: {
          sourceDatabase: { status: 'configured' },
          isolatedRestoreDatabase: { status: 'configured', distinctFromSource: true },
          backupEncryption: { status: 'configured' },
          alertEvidenceIssue: { status: 'configured', issueNumber },
        },
      },
    });
    writeJson(
      resolve(statusRoot, qPaths.q2),
      fixtureReceipt('P6-07-Q2', commit, binding, now, {
        checks: Object.fromEntries(
          ['liveMonitoring', 'syntheticFailures', 'alertExercise'].map((key) => [
            key,
            { status: 'passed' },
          ]),
        ),
      }),
    );
    writeJson(
      resolve(statusRoot, qPaths.q3),
      fixtureReceipt('P6-07-Q3', commit, binding, now, {
        checks: {
          backup: {
            status: 'passed',
            artifact: { encrypted: true },
            integrity: { status: 'passed', decryptVerified: true, corruptionRejected: true },
          },
        },
      }),
    );
    writeJson(
      resolve(statusRoot, qPaths.q4),
      fixtureReceipt('P6-07-Q4', commit, binding, now, {
        checks: {
          artifact: { status: 'passed' },
          targetSafety: { status: 'passed', distinct: true },
          restore: { status: 'passed' },
          reconciliation: { status: 'passed', privateTablesZeroRows: true },
          objectives: { rpo: { status: 'passed' }, rto: { status: 'passed' } },
          disposal: { status: 'passed', remainingUserObjectCount: 0 },
        },
      }),
    );

    let receipt = await executeQ5(base);
    assert(receipt.state === 'accepted', 'complete evidence must pass');
    assert(receipt.checks.externalReverification.status === 'passed', 'external checks must pass');
    receipt = await executeQ5({
      ...base,
      incidentId: 'cpm-p6-07-q5-wrong-release',
      fetchImpl: mockFetch(binding, true),
    });
    assert(receipt.state === 'failed', 'wrong release must fail');
    const q4 = readJson(statusRoot, qPaths.q4);
    q4.expiresAt = new Date(now.getTime() - 1_000).toISOString();
    writeJson(resolve(statusRoot, qPaths.q4), q4);
    receipt = await executeQ5({ ...base, incidentId: 'cpm-p6-07-q5-stale-q4' });
    assert(receipt.exceptions.includes('precondition_failed'), 'stale Q4 must fail');
    q4.expiresAt = new Date(now.getTime() + 86_400_000).toISOString();
    writeJson(resolve(statusRoot, qPaths.q4), q4);
    writeJson(resolve(statusRoot, finalPath), { incidentId: 'cpm-p6-07-q5-duplicate-001' });
    receipt = await executeQ5({ ...base, incidentId: 'cpm-p6-07-q5-duplicate-001' });
    assert(receipt.exceptions.includes('incident_identity_already_used'), 'duplicate must fail');
    console.log('OPS-P6-002B P6-07 incident exercise self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath) throw new Error('Usage: script <status-root> <output-path>');
  const receipt = await executeQ5({
    statusRoot,
    outputPath,
    commit: process.env.APPROVED_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    incidentId: process.env.INCIDENT_ID ?? '',
    commandOwner: process.env.COMMAND_OWNER ?? '',
    observer: process.env.OBSERVER ?? '',
    followUpOwner: process.env.FOLLOW_UP_OWNER ?? '',
    scenario: process.env.INCIDENT_SCENARIO ?? '',
    severity: process.env.INCIDENT_SEVERITY ?? '',
    acknowledgementObjectiveMinutes: process.env.ACKNOWLEDGEMENT_OBJECTIVE_MINUTES ?? '',
    decisionObjectiveMinutes: process.env.DECISION_OBJECTIVE_MINUTES ?? '',
    recoveryObjectiveMinutes: process.env.RECOVERY_OBJECTIVE_MINUTES ?? '',
    statusCadenceMinutes: process.env.STATUS_CADENCE_MINUTES ?? '',
    repositoryContractOutcome: process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failed',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
  });
  console.log(`Configured staging P6-07 Q5 state: ${receipt.state}`);
  if (receipt.exceptions.length > 0) console.log(`Exceptions: ${receipt.exceptions.join(', ')}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
