import { readFileSync } from 'node:fs';

const files = {
  workflow: readFileSync(
    '.github/workflows/ops-p6-001u-configured-staging-p6-07-monitoring-alert.yml',
    'utf8',
  ),
  procedure: readFileSync('docs/OPS_P6_001U_CONFIGURED_STAGING_P6_07_MONITORING_ALERT.md', 'utf8'),
  executor: readFileSync(
    'scripts/run-ops-p6-001u-configured-staging-p6-07-monitoring-alert.mjs',
    'utf8',
  ),
  p607Contract: readFileSync(
    'scripts/check-p6-07-configured-operational-monitoring-backup-restore-incident-evidence.js',
    'utf8',
  ),
};

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_07_Q2'],
  [files.workflow, 'pre-delivered alert evidence'],
  [files.workflow, 'p6-07-monitoring-alert-receipt.json'],
  [files.workflow, 'Publish P6-07 monitoring and alert receipt'],
  [files.procedure, 'HTTP 200 with the wrong active release fails'],
  [files.procedure, 'dead-man'],
  [files.procedure, 'monitoring blind state'],
  [files.procedure, 'Issue #349'],
  [files.procedure, 'duplicate delivery'],
  [files.procedure, 'intentionally missed short test deadline'],
  [files.procedure, 'does not intentionally interrupt configured staging'],
  [files.executor, "const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_07_Q2'"],
  [files.executor, "const approvedHostname = 'staging.cryptopaymap.com'"],
  [files.executor, 'const alertIssueNumber = 349'],
  [files.executor, "const alertRuleRevision = 'p6-07-q2-v1'"],
  [files.executor, 'function evaluateReleaseResponse(httpStatus, marker, expectedReleaseId)'],
  [files.executor, 'function evaluateHeartbeat(observedAt, now, maxAgeMs)'],
  [files.executor, 'function evaluateCollector(enabled, authorizedDisabled)'],
  [files.executor, "wrongRelease.status === 'alert'"],
  [files.executor, "staleSignal.reason === 'stale_signal'"],
  [files.executor, 'deadMan.deadManDetected === true'],
  [files.executor, 'blindState.blindStateDetected === true'],
  [files.executor, 'duplicateDelivery.reused === true'],
  [files.executor, 'escalation_deadline_not_missed'],
  [files.executor, "destinationClass: 'github_issue'"],
  [files.executor, 'readOnlyEvidence: token.length === 0'],
  [files.executor, "state: accepted ? 'accepted' : 'failed'"],
  [files.executor, "evidenceId: 'P6-07-Q2'"],
  [files.executor, "!serialized.includes('raw-comment-id-')"],
  [files.executor, "!serialized.includes('secret-token')"],
  [files.p607Contract, 'P6-07 configured operational evidence contract passed.'],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001U contract marker is missing: ${marker}`);
  }
}

const forbidden = [
  'postgresql://',
  'CLOUDFLARE_API_TOKEN=',
  'GITHUB_TOKEN=',
  'DATABASE_URL=',
  'P6_07_BACKUP_ENCRYPTION_KEY=',
  'P6_07_RESTORE_DATABASE_URL=',
  'wrangler pages deploy',
  'wrangler r2 object put',
  'pg_dump',
  'pg_restore',
  "method: 'PUT'",
  'method: "PUT"',
  "method: 'PATCH'",
  'method: "PATCH"',
  "method: 'DELETE'",
  'method: "DELETE"',
];
for (const marker of forbidden) {
  if (files.executor.includes(marker)) {
    throw new Error(`OPS-P6-001U executor contains forbidden mutation or secret marker: ${marker}`);
  }
}

if (!files.executor.includes("['ready', 'configuration_blocked'].includes(receipt?.decision)")) {
  throw new Error('OPS-P6-001U must require a bounded current prerequisite decision.');
}
if (!files.executor.includes('blockers.every((value) => allowedPrerequisiteBlockers.has(value))')) {
  throw new Error('OPS-P6-001U must reject unexpected prerequisite blockers.');
}
if (
  !files.executor.includes(
    'receipt?.checks?.configuration?.alertEvidenceIssue?.issueNumber === alertIssueNumber',
  )
) {
  throw new Error('OPS-P6-001U must bind delivery to the diagnosed alert issue.');
}
if (!files.executor.includes('markerResponse.status, marker, expectedReleaseId')) {
  throw new Error('OPS-P6-001U must validate the externally active release identity.');
}
if (!files.executor.includes("probePath('/', [200], 'text/html'")) {
  throw new Error('OPS-P6-001U must monitor the configured-staging home page.');
}
if (!files.executor.includes("'/staging-review/media/place-cover.webp'")) {
  throw new Error('OPS-P6-001U must monitor public Media availability.');
}
if (!files.executor.includes("'/admin/api/dashboard'")) {
  throw new Error('OPS-P6-001U must monitor protected Admin denial.');
}
if (!files.executor.includes("postOrReuse('alert', alertId, details)")) {
  throw new Error('OPS-P6-001U must use idempotent marker-based alert delivery.');
}
if (
  !files.executor.includes('firstDelivery.reused === false || channel.readOnlyEvidence === true')
) {
  throw new Error('OPS-P6-001U must prove the first alert is newly delivered.');
}
if (!files.executor.includes('duplicateDelivery.reused === true')) {
  throw new Error('OPS-P6-001U must prove duplicate convergence.');
}
if (!files.executor.includes('deadlineMissed')) {
  throw new Error('OPS-P6-001U must prove escalation after a missed deadline.');
}
if (!files.executor.includes("exceptions.push('preconditions:failed')")) {
  throw new Error('OPS-P6-001U must fail closed before channel writes.');
}

console.log('OPS-P6-001U configured staging P6-07 monitoring and alert contract passed.');
