import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import tls from 'node:tls';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_07_Q2';
const approvedHostname = 'staging.cryptopaymap.com';
const alertIssueNumber = 349;
const receiptPath = 'config/staging-authorization/p6-07-monitoring-alert-receipt.json';
const prerequisitePath = 'config/staging-authorization/p6-07-prerequisite-diagnostic.json';
const expiryDays = 30;
const alertRuleRevision = 'p6-07-q2-v1';
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const allowedPrerequisiteBlockers = new Set([
  'backup_encryption:missing',
  'isolated_restore_database:missing',
]);
const predecessorPaths = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
  ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
  ['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json'],
  ['P6-06', 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json'],
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

function readJson(root, relativePath) {
  try {
    const value = JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
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

function readPrerequisite(statusRoot, commit, binding, now) {
  const receipt = readJson(statusRoot, prerequisitePath);
  const generatedAt = validTimestamp(receipt?.generatedAt) ? receipt.generatedAt : null;
  const expiresAt = validTimestamp(receipt?.expiresAt) ? receipt.expiresAt : null;
  const blockers = Array.isArray(receipt?.blockers)
    ? receipt.blockers.filter((value) => typeof value === 'string').sort()
    : [];
  const blockersAllowed = blockers.every((value) => allowedPrerequisiteBlockers.has(value));
  const receiptBinding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingMatched =
    binding !== null &&
    receiptBinding !== null &&
    bindingKeys.every((key) => receiptBinding[key] === binding[key]);
  const externalPassed = ['home', 'version', 'manifest', 'adminDenial'].every(
    (key) => receipt?.checks?.external?.[key]?.status === 'passed',
  );
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
    receipt?.checks?.exactMain === 'success' &&
    receipt?.checks?.predecessorBinding === 'matched' &&
    externalPassed &&
    receipt?.checks?.configuration?.alertEvidenceIssue?.status === 'configured' &&
    receipt?.checks?.configuration?.alertEvidenceIssue?.issueNumber === alertIssueNumber &&
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

function noPrivateLeakage(text) {
  return !/(database_url|cloudflare_api_token|github_token|private submission|storage key|signed url|session cookie|encryption key)/i.test(
    text,
  );
}

async function probePath(path, expectedStatuses, expectedType, fetchImpl = fetch) {
  const startedAt = Date.now();
  const response = await fetchImpl(
    `https://${approvedHostname}${path}${path.includes('?') ? '&' : '?'}p6_07_q2=${Date.now()}-${Math.random()}`,
    {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'CryptoPayMap-P6-07-Q2-Monitor/1' },
    },
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? null;
  const text = new TextDecoder().decode(bytes).slice(0, 32_768);
  const statusPassed = expectedStatuses.includes(response.status);
  const typePassed = expectedType === null || contentType === expectedType;
  return {
    status: statusPassed && typePassed && noPrivateLeakage(text) ? 'passed' : 'failed',
    httpStatus: response.status,
    contentType,
    latencyMs: Date.now() - startedAt,
    bodyDigest: boundedHash(bytes),
    byteLength: bytes.byteLength,
  };
}

async function queryDoh(endpoint, hostname, fetchImpl = fetch) {
  const response = await fetchImpl(`${endpoint}?name=${encodeURIComponent(hostname)}&type=A`, {
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

async function observeDns(fetchImpl = fetch, resolve4 = dns.resolve4) {
  const [system, cloudflare, google] = await Promise.all([
    resolve4(approvedHostname, { ttl: true }),
    queryDoh('https://cloudflare-dns.com/dns-query', approvedHostname, fetchImpl),
    queryDoh('https://dns.google/resolve', approvedHostname, fetchImpl),
  ]);
  const passed =
    system.length > 0 &&
    cloudflare.status === 0 &&
    cloudflare.answerCount > 0 &&
    google.status === 0 &&
    google.answerCount > 0;
  return {
    status: passed ? 'passed' : 'failed',
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

async function observeTls(connectImpl = tls.connect, now = new Date()) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = connectImpl(
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
          const validTo = validTimestamp(certificate?.valid_to) ? certificate.valid_to : null;
          const protocol = socket.getProtocol();
          const passed =
            socket.authorized === true &&
            san.toLowerCase().includes(approvedHostname) &&
            validTo !== null &&
            Date.parse(validTo) > now.getTime() + 7 * 24 * 60 * 60 * 1_000 &&
            ['TLSv1.2', 'TLSv1.3'].includes(protocol);
          socket.end();
          resolvePromise({
            status: passed ? 'passed' : 'failed',
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

function evaluateReleaseResponse(httpStatus, marker, expectedReleaseId) {
  const releaseMatches = isObject(marker) && marker.releaseId === expectedReleaseId;
  return {
    status: httpStatus === 200 && releaseMatches ? 'healthy' : 'alert',
    httpStatus,
    releaseMatches,
    expectedReleaseDigest: validDigest(expectedReleaseId) ? boundedHash(expectedReleaseId) : null,
    observedReleaseDigest: validDigest(marker?.releaseId) ? boundedHash(marker.releaseId) : null,
  };
}

function evaluateSignal(observedAt, now, maxAgeMs) {
  if (!validTimestamp(observedAt)) {
    return { status: 'alert', reason: 'missing_or_invalid_timestamp', ageMs: null };
  }
  const ageMs = now.getTime() - Date.parse(observedAt);
  return {
    status: ageMs >= 0 && ageMs <= maxAgeMs ? 'healthy' : 'alert',
    reason: ageMs < 0 ? 'clock_skew' : ageMs > maxAgeMs ? 'stale_signal' : 'current',
    ageMs,
  };
}

function evaluateHeartbeat(observedAt, now, maxAgeMs) {
  const signal = evaluateSignal(observedAt, now, maxAgeMs);
  return {
    ...signal,
    deadManDetected: signal.status === 'alert',
  };
}

function evaluateCollector(enabled, authorizedDisabled) {
  return {
    status: enabled || authorizedDisabled ? 'healthy' : 'alert',
    blindStateDetected: !enabled && !authorizedDisabled,
    disabledAuthorized: !enabled && authorizedDisabled,
  };
}

async function observeLive(
  expectedReleaseId,
  { fetchImpl = fetch, resolve4 = dns.resolve4, connectImpl = tls.connect, now = new Date() } = {},
) {
  const heartbeatAt = new Date().toISOString();
  const [home, version, manifest, media, adminDenial, release, dnsResult, tlsResult] =
    await Promise.all([
      probePath('/', [200], 'text/html', fetchImpl),
      probePath('/version.json', [200], 'application/json', fetchImpl),
      probePath('/data/manifest.json', [200], 'application/json', fetchImpl),
      probePath('/staging-review/media/place-cover.webp', [200], 'image/webp', fetchImpl),
      probePath('/admin/api/dashboard', [401, 403], 'text/plain', fetchImpl),
      probePath('/p6-05-release.json', [200], 'application/json', fetchImpl),
      observeDns(fetchImpl, resolve4),
      observeTls(connectImpl, now),
    ]);

  const markerResponse = await fetchImpl(
    `https://${approvedHostname}/p6-05-release.json?p6_07_q2_marker=${Date.now()}`,
    { cache: 'no-store', signal: AbortSignal.timeout(20_000) },
  );
  const marker = await markerResponse.json();
  const activeRelease = evaluateReleaseResponse(markerResponse.status, marker, expectedReleaseId);

  const redirect = await fetchImpl(`http://${approvedHostname}/?p6_07_q2_redirect=${Date.now()}`, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const location = redirect.headers.get('location');
  const redirectPassed =
    [301, 302, 307, 308].includes(redirect.status) &&
    typeof location === 'string' &&
    location.startsWith(`https://${approvedHostname}/`);
  const heartbeat = evaluateHeartbeat(heartbeatAt, new Date(), 60_000);

  const liveResults = {
    home,
    version,
    manifest,
    media,
    adminDenial,
    release,
    dns: dnsResult,
    tls: tlsResult,
  };
  const allLivePassed = Object.values(liveResults).every((value) => value.status === 'passed');
  return {
    status:
      allLivePassed &&
      activeRelease.status === 'healthy' &&
      redirectPassed &&
      heartbeat.status === 'healthy'
        ? 'passed'
        : 'failed',
    heartbeat: {
      status: heartbeat.status,
      emittedAt: heartbeatAt,
      ageMs: heartbeat.ageMs,
      timestampSanity: heartbeat.reason,
    },
    public: liveResults,
    activeRelease,
    redirect: {
      status: redirectPassed ? 'passed' : 'failed',
      httpStatus: redirect.status,
      locationDigest: typeof location === 'string' ? boundedHash(location) : null,
    },
  };
}

async function githubRequest(path, token, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  const body = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`github_channel_http_${response.status}`);
  return body;
}

function safeCommentReference(comment) {
  return {
    referenceDigest: boundedHash(`${comment?.id ?? 'missing'}:${comment?.html_url ?? 'missing'}`),
    createdAt: validTimestamp(comment?.created_at) ? comment.created_at : null,
    actorDigest: boundedHash(comment?.user?.login ?? 'missing'),
  };
}

function marker(kind, alertId) {
  return `<!-- cpm-p6-07-${kind}:${alertId} -->`;
}

function safeAlertBody(kind, alertId, details) {
  const title =
    kind === 'alert'
      ? 'P6-07 configured-staging test alert'
      : kind === 'ack'
        ? 'P6-07 test alert acknowledged'
        : kind === 'escalation'
          ? 'P6-07 test alert escalated'
          : 'P6-07 test alert recovered';
  return [
    marker(kind, alertId),
    `### ${title}`,
    '',
    `- Alert identity: \`${alertId}\``,
    `- Rule revision: \`${alertRuleRevision}\``,
    `- Signal class: \`${details.signalClass}\``,
    `- Severity: \`${details.severity}\``,
    `- Source binding: \`${details.bindingDigest}\``,
    `- Owner: \`${details.ownerDigest}\``,
    `- Evidence time: \`${details.evidenceAt}\``,
    '',
    'This is a bounded operational evidence test. No live service degradation was introduced.',
  ].join('\n');
}

function createGitHubChannel({ repository, issueNumber, token, fetchImpl = fetch }) {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error('invalid_github_repository');

  async function comments() {
    const body = await githubRequest(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
      token,
      { method: 'GET' },
      fetchImpl,
    );
    return Array.isArray(body) ? body : [];
  }

  async function postOrReuse(kind, alertId, details) {
    const expectedMarker = marker(kind, alertId);
    const existing = (await comments()).find(
      (comment) => typeof comment?.body === 'string' && comment.body.includes(expectedMarker),
    );
    if (existing) return { status: 'delivered', reused: true, ...safeCommentReference(existing) };
    if (!token) throw new Error(`missing_preseeded_channel_evidence_${kind}`);
    const created = await githubRequest(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      token,
      { method: 'POST', body: JSON.stringify({ body: safeAlertBody(kind, alertId, details) }) },
      fetchImpl,
    );
    return { status: 'delivered', reused: false, ...safeCommentReference(created) };
  }

  return {
    destinationClass: 'github_issue',
    issueNumber,
    readOnlyEvidence: token.length === 0,
    deliver: (alertId, details) => postOrReuse('alert', alertId, details),
    acknowledge: (alertId, details) => postOrReuse('ack', alertId, details),
    escalate: (alertId, details) => postOrReuse('escalation', alertId, details),
    recover: (alertId, details) => postOrReuse('recovery', alertId, details),
  };
}

async function executeAlertExercise({ channel, binding, ownerDigest, workflowRunId, sleep }) {
  const bindingDigest = boundedHash(binding);
  const base = {
    bindingDigest,
    ownerDigest,
    severity: 'test_high',
  };
  const wrongReleaseId = boundedHash(
    ['wrong_release_http_200', bindingDigest, alertRuleRevision].join(':'),
  );
  const wrongDetails = {
    ...base,
    signalClass: 'wrong_release_http_200',
    evidenceAt: new Date().toISOString(),
  };
  const firstDelivery = await channel.deliver(wrongReleaseId, wrongDetails);
  const duplicateDelivery = await channel.deliver(wrongReleaseId, wrongDetails);
  const acknowledgement = await channel.acknowledge(wrongReleaseId, {
    ...wrongDetails,
    evidenceAt: new Date().toISOString(),
  });
  const recovery = await channel.recover(wrongReleaseId, {
    ...wrongDetails,
    evidenceAt: new Date().toISOString(),
  });

  const blindStateId = boundedHash(
    ['monitor_blind_state', bindingDigest, alertRuleRevision].join(':'),
  );
  const blindDetails = {
    ...base,
    signalClass: 'monitor_blind_state',
    evidenceAt: new Date().toISOString(),
  };
  const blindDelivery = await channel.deliver(blindStateId, blindDetails);
  const escalationDeadline = new Date(
    (channel.readOnlyEvidence && validTimestamp(blindDelivery.createdAt)
      ? Date.parse(blindDelivery.createdAt)
      : Date.now()) + 2_000,
  ).toISOString();
  if (!channel.readOnlyEvidence) await sleep(2_500);
  const escalation = await channel.escalate(blindStateId, {
    ...blindDetails,
    evidenceAt: new Date().toISOString(),
  });
  const escalationObservedAt =
    channel.readOnlyEvidence && validTimestamp(escalation.createdAt)
      ? Date.parse(escalation.createdAt)
      : Date.now();
  const deadlineMissed = escalationObservedAt > Date.parse(escalationDeadline);
  if (!deadlineMissed) throw new Error('escalation_deadline_not_missed');
  const escalatedAcknowledgement = await channel.acknowledge(blindStateId, {
    ...blindDetails,
    evidenceAt: new Date().toISOString(),
  });
  const blindRecovery = await channel.recover(blindStateId, {
    ...blindDetails,
    evidenceAt: new Date().toISOString(),
  });

  const allDelivered = [
    firstDelivery,
    duplicateDelivery,
    acknowledgement,
    recovery,
    blindDelivery,
    escalation,
    escalatedAcknowledgement,
    blindRecovery,
  ].every((item) => item.status === 'delivered');
  return {
    status:
      allDelivered &&
      (firstDelivery.reused === false || channel.readOnlyEvidence === true) &&
      duplicateDelivery.reused === true &&
      deadlineMissed
        ? 'passed'
        : 'failed',
    destinationClass: channel.destinationClass,
    issueNumber: channel.issueNumber,
    ruleRevision: alertRuleRevision,
    wrongRelease: {
      alertId: wrongReleaseId,
      delivery: firstDelivery,
      duplicate: duplicateDelivery,
      acknowledgement,
      recovery,
      deduplicated: duplicateDelivery.reused === true,
    },
    blindState: {
      alertId: blindStateId,
      delivery: blindDelivery,
      escalationDeadline,
      deadlineMissed,
      escalation,
      acknowledgement: escalatedAcknowledgement,
      recovery: blindRecovery,
    },
  };
}

async function runMonitoring({
  statusRoot,
  outputPath,
  commit,
  confirmation,
  monitoringOwner,
  workflowRunId = null,
  repositoryContract = false,
  repository = 'badjoke-lab/cryptopaymap',
  githubToken = '',
  now = new Date(),
  observeLiveImpl = observeLive,
  channel = null,
  sleep = (milliseconds) =>
    new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
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
  const prerequisite = readPrerequisite(statusRoot, commit, binding, now);
  const p605 = predecessors.find((item) => item.evidenceId === 'P6-05')?.receipt ?? null;
  const expectedReleaseId = p605?.checks?.releases?.candidate?.releaseId ?? null;
  const ownerDigest = validOwner(monitoringOwner) ? boundedHash(monitoringOwner.trim()) : null;
  const checks = {
    exactMain: validCommit(commit) ? 'success' : 'failed',
    confirmation: confirmation === exactConfirmation ? 'success' : 'failed',
    owner: ownerDigest === null ? 'failed' : 'success',
    repositoryContract: repositoryContract ? 'success' : 'failed',
    predecessors: predecessors.map(({ binding: _binding, receipt: _receipt, ...item }) => item),
    predecessorBinding: binding === null ? 'failed' : 'matched',
    prerequisite,
    liveMonitoring: { status: 'not_run' },
    syntheticFailures: { status: 'not_run' },
    alertExercise: { status: 'not_run' },
  };
  const exceptions = [];
  const preconditions =
    checks.exactMain === 'success' &&
    checks.confirmation === 'success' &&
    checks.owner === 'success' &&
    checks.repositoryContract === 'success' &&
    predecessors.every((item) => item.state === 'current') &&
    binding !== null &&
    prerequisite.state === 'current' &&
    validDigest(expectedReleaseId);

  if (!preconditions) {
    exceptions.push('preconditions:failed');
  } else {
    try {
      const live = await observeLiveImpl(expectedReleaseId);
      checks.liveMonitoring = live;
      if (live.status !== 'passed') throw new Error('live_monitoring_failed');

      const wrongRelease = evaluateReleaseResponse(
        200,
        { releaseId: `sha256:${'0'.repeat(64)}` },
        expectedReleaseId,
      );
      const staleSignal = evaluateSignal(
        new Date(now.getTime() - 10 * 60 * 1_000).toISOString(),
        now,
        2 * 60 * 1_000,
      );
      const deadMan = evaluateHeartbeat(null, now, 2 * 60 * 1_000);
      const blindState = evaluateCollector(false, false);
      const authorizedDisabled = evaluateCollector(false, true);
      checks.syntheticFailures = {
        status:
          wrongRelease.status === 'alert' &&
          wrongRelease.releaseMatches === false &&
          staleSignal.status === 'alert' &&
          staleSignal.reason === 'stale_signal' &&
          deadMan.status === 'alert' &&
          deadMan.deadManDetected === true &&
          blindState.status === 'alert' &&
          blindState.blindStateDetected === true &&
          authorizedDisabled.status === 'healthy' &&
          authorizedDisabled.disabledAuthorized === true
            ? 'passed'
            : 'failed',
        wrongReleaseHttp200: wrongRelease,
        staleSignal,
        deadMan,
        blindState,
        authorizedDisabled,
      };
      if (checks.syntheticFailures.status !== 'passed')
        throw new Error('synthetic_failure_matrix_failed');

      const evidenceChannel =
        channel ??
        createGitHubChannel({
          repository,
          issueNumber: alertIssueNumber,
          token: githubToken,
        });
      checks.alertExercise = await executeAlertExercise({
        channel: evidenceChannel,
        binding,
        ownerDigest,
        workflowRunId,
        sleep,
      });
      if (checks.alertExercise.status !== 'passed') throw new Error('alert_exercise_failed');
    } catch (error) {
      exceptions.push(`execution:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const generatedAt = now.toISOString();
  const accepted =
    exceptions.length === 0 &&
    checks.liveMonitoring.status === 'passed' &&
    checks.syntheticFailures.status === 'passed' &&
    checks.alertExercise.status === 'passed';
  const receipt = {
    version: 1,
    evidenceId: 'P6-07-Q2',
    launchDomain: 'operational_monitoring_alert',
    environment: 'configured_staging',
    state: accepted ? 'accepted' : 'failed',
    commit: validCommit(commit) ? commit : null,
    generatedAt,
    expiresAt: new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1_000).toISOString(),
    workflowRunId,
    owner: ownerDigest,
    procedure: 'OPS-P6-001U configured staging P6-07 monitoring and alert evidence',
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

function createMockChannel() {
  const records = new Map();
  let sequence = 0;
  const write = async (kind, alertId) => {
    const key = `${kind}:${alertId}`;
    const existing = records.get(key);
    if (existing) return { ...existing, reused: true };
    sequence += 1;
    const created = {
      status: 'delivered',
      reused: false,
      referenceDigest: boundedHash(`raw-comment-id-${sequence}`),
      createdAt: new Date(1_786_000_000_000 + sequence * 1_000).toISOString(),
      actorDigest: boundedHash('github-actions[bot]'),
    };
    records.set(key, created);
    return created;
  };
  return {
    destinationClass: 'github_issue',
    issueNumber: alertIssueNumber,
    deliver: (alertId) => write('alert', alertId),
    acknowledge: (alertId) => write('ack', alertId),
    escalate: (alertId) => write('escalation', alertId),
    recover: (alertId) => write('recovery', alertId),
    count: () => records.size,
  };
}

async function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-07-q2-'));
  const commit = 'a'.repeat(40);
  const now = new Date('2026-08-03T05:00:00.000Z');
  const expiresAt = '2026-08-04T05:00:00.000Z';
  const binding = {
    releaseId: `sha256:${'1'.repeat(64)}`,
    dataSnapshotId: `sha256:${'2'.repeat(64)}`,
    configurationId: `sha256:${'3'.repeat(64)}`,
    environmentId: `sha256:${'4'.repeat(64)}`,
  };
  const expectedReleaseId = `sha256:${'5'.repeat(64)}`;
  try {
    for (const [id, path] of predecessorPaths) {
      writeFixture(root, path, {
        version: 1,
        evidenceId: id,
        environment: 'configured_staging',
        state: 'accepted',
        commit,
        generatedAt: '2026-08-03T04:00:00.000Z',
        expiresAt,
        binding,
        checks: id === 'P6-05' ? { releases: { candidate: { releaseId: expectedReleaseId } } } : {},
        exceptions: [],
      });
    }
    writeFixture(root, prerequisitePath, {
      version: 1,
      evidenceId: 'P6-07',
      diagnostic: 'prerequisite_inventory',
      environment: 'configured_staging',
      state: 'diagnosed',
      decision: 'configuration_blocked',
      commit,
      generatedAt: '2026-08-03T04:30:00.000Z',
      expiresAt,
      checks: {
        exactMain: 'success',
        predecessorBinding: 'matched',
        external: {
          home: { status: 'passed' },
          version: { status: 'passed' },
          manifest: { status: 'passed' },
          adminDenial: { status: 'passed' },
        },
        configuration: {
          alertEvidenceIssue: { status: 'configured', issueNumber: alertIssueNumber },
        },
      },
      binding,
      blockers: ['backup_encryption:missing', 'isolated_restore_database:missing'],
      exceptions: [],
    });

    const channel = createMockChannel();
    const outputPath = resolve(root, 'accepted.json');
    const accepted = await runMonitoring({
      statusRoot: root,
      outputPath,
      commit,
      confirmation: exactConfirmation,
      monitoringOwner: 'configured-staging-monitor-owner',
      workflowRunId: 'self-test',
      repositoryContract: true,
      now,
      observeLiveImpl: async () => ({
        status: 'passed',
        heartbeat: { status: 'healthy' },
        public: { home: { status: 'passed' } },
        activeRelease: { status: 'healthy', releaseMatches: true },
        redirect: { status: 'passed' },
      }),
      channel,
      sleep: (milliseconds) =>
        new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    });
    assert(accepted.state === 'accepted', 'safe Q2 execution must be accepted');
    assert(accepted.checks.syntheticFailures.status === 'passed', 'failure matrix must pass');
    assert(
      accepted.checks.alertExercise.wrongRelease.deduplicated === true,
      'duplicate must converge',
    );
    assert(
      accepted.checks.alertExercise.blindState.deadlineMissed === true,
      'escalation deadline must be missed',
    );
    assert(channel.count() === 7, 'duplicate alert must not create an eighth channel record');
    const serialized = JSON.stringify(accepted);
    assert(
      !serialized.includes('configured-staging-monitor-owner'),
      'raw owner must not be retained',
    );
    assert(!serialized.includes('secret-token'), 'token material must not be retained');
    assert(!serialized.includes('raw-comment-id-'), 'raw comment identifiers must not be retained');

    const prerequisite = readJson(root, prerequisitePath);
    prerequisite.blockers.push('unexpected:blocker');
    writeFixture(root, prerequisitePath, prerequisite);
    const blockedChannel = createMockChannel();
    const failed = await runMonitoring({
      statusRoot: root,
      outputPath: resolve(root, 'failed.json'),
      commit,
      confirmation: exactConfirmation,
      monitoringOwner: 'configured-staging-monitor-owner',
      repositoryContract: true,
      now,
      observeLiveImpl: async () => ({ status: 'passed' }),
      channel: blockedChannel,
      sleep: (milliseconds) =>
        new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    });
    assert(failed.state === 'failed', 'unexpected prerequisite blocker must fail closed');
    assert(
      failed.exceptions.includes('preconditions:failed'),
      'precondition failure must be explicit',
    );
    assert(blockedChannel.count() === 0, 'failed preconditions must not write alert comments');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log('OPS-P6-001U configured staging P6-07 monitoring and alert self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }
  const statusRoot = process.argv[2];
  const outputPath = process.argv[3] ?? receiptPath;
  if (!statusRoot || !existsSync(statusRoot)) {
    throw new Error('Usage: node script.mjs <status-root> <output-path>');
  }
  const receipt = await runMonitoring({
    statusRoot,
    outputPath,
    commit: process.env.APPROVED_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    monitoringOwner: process.env.MONITORING_OWNER ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    repositoryContract: process.env.REPOSITORY_CONTRACT_OUTCOME === 'success',
    repository: process.env.GITHUB_REPOSITORY ?? 'badjoke-lab/cryptopaymap',
    githubToken: process.env.GITHUB_TOKEN ?? '',
  });
  console.log(`OPS-P6-001U receipt state: ${receipt.state}`);
  if (receipt.state !== 'accepted') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export {
  evaluateCollector,
  evaluateHeartbeat,
  evaluateReleaseResponse,
  evaluateSignal,
  executeAlertExercise,
  readPrerequisite,
  runMonitoring,
};
