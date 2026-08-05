import fs from 'node:fs';

const requiredFiles = [
  'docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md',
  'docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md',
  'docs/PROJECT_STATUS.md',
  'docs/OPS_P6_002B_CONFIGURED_STAGING_P6_07_INCIDENT_EXERCISE_FINAL_RECEIPT.md',
  '.github/workflows/ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.yml',
  'scripts/run-ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.mjs',
  'scripts/check-ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.mjs',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const normalize = (file) => fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();

const evidence = normalize(
  'docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md',
);
const p606 = normalize('docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md');
const status = normalize('docs/PROJECT_STATUS.md');
const q5Doc = normalize(
  'docs/OPS_P6_002B_CONFIGURED_STAGING_P6_07_INCIDENT_EXERCISE_FINAL_RECEIPT.md',
);
const q5Workflow = normalize(
  '.github/workflows/ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.yml',
);
const q5Runner = normalize(
  'scripts/run-ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.mjs',
);
const q5Checker = normalize(
  'scripts/check-ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.mjs',
);

const assertMarkers = (label, content, markers) => {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length) throw new Error(`${label} markers missing:\n- ${missing.join('\n- ')}`);
};

assertMarkers('P6-07 evidence', evidence, [
  'configured staging evidence: `unproven`',
  'configured production evidence: `unproven`',
  'intended active-release identity, not http status alone',
  'monitoring cannot silently fail',
  'dead-man or missed-check detection',
  'at least one configured channel must receive and acknowledge the test alert',
  'a successful scheduled job without a verified backup artifact is not backup proof',
  'a dump that has never been restored is not recovery proof',
  'the restore target cannot overwrite production',
  'measured rpo and rto',
  'wrong active release with http 200',
  'one command owner',
  'closure only after service and data integrity are externally reverified',
  'no api token, notification webhook, database credential, encryption key',
  'repository audit passing means only that this evidence contract is present and internally consistent',
  'p6-08 owns final launch authorization',
]);

assertMarkers('P6-06 preservation', p606, [
  'configured domain cutover and rollback evidence',
  'changing dns back without externally observing service recovery is not rollback proof',
  'p6-07 owns configured operational monitoring',
]);

assertMarkers('PROJECT_STATUS', status, [
  'phase 6 — launch and cutover evidence',
  'p6-06 — configured domain cutover and rollback evidence completed in #287 for issue #286',
  'p6-07 — configured operational monitoring, alerting, backup, restore, and incident-response evidence completed in #289 for issue #288',
  '0b0b328b8cb002977f1aa34e7385fc8eef56d324',
  'p6-08',
  'final launch authorization',
]);

assertMarkers('OPS-P6-002B documentation', q5Doc, [
  'q5 incident exercise and final p6-07 receipt',
  'no intentional live-service degradation',
  'one immutable incident identity',
  'one command owner',
  'acknowledgement within 15 minutes',
  'mitigation decision within 30 minutes',
  'recovery within 45 minutes',
  'externally reverified before closure',
  'inventory mode cannot authorize launch',
  'p6-08 remains the separate final launch gate',
]);

assertMarkers('OPS-P6-002B workflow', q5Workflow, [
  'execute_configured_staging_p6_07_q5',
  'p6-07-operations-recovery-receipt.json',
  'evaluate-ops-p6-001c-staging-authorization.mjs',
  'evaluation_mode: inventory',
  'configured-staging incident exercise declared',
  'configured-staging incident exercise closed',
  'issues: write',
  'cancel-in-progress: false',
]);

assertMarkers('OPS-P6-002B runner', q5Runner, [
  "const exactconfirmation = 'execute_configured_staging_p6_07_q5'",
  "evidenceid: 'p6-07'",
  "exerciseid: 'p6-07-q5'",
  'incident_identity_already_used',
  'exclusive_workflow_concurrency',
  'simulation_only_no_live_degradation',
  'accepted_q2_monitoring_alert_receipt',
  'p6-05-release.json',
  'privatetableszerorows',
  'remaininguserobjectcount',
  'productionmutation: false',
]);

assertMarkers('OPS-P6-002B checker', q5Checker, [
  'run-ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.mjs',
  'ops-p6-002b p6-07 incident exercise self-test passed',
]);

console.log('P6-07 configured operational evidence contract passed.');
