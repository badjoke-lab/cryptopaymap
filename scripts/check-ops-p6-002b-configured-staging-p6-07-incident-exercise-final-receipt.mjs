import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const workflowPath =
  '.github/workflows/ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.yml';
const docPath = 'docs/OPS_P6_002B_CONFIGURED_STAGING_P6_07_INCIDENT_EXERCISE_FINAL_RECEIPT.md';
const runnerPath =
  'scripts/run-ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.mjs';
const files = [workflowPath, docPath, runnerPath];

for (const path of files) {
  if (!existsSync(path)) throw new Error(`Missing OPS-P6-002B file: ${path}`);
}

function normalized(path) {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').toLowerCase();
}

function assertMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) throw new Error(`${label} markers missing:\n- ${missing.join('\n- ')}`);
}

const workflow = normalized(workflowPath);
const doc = normalized(docPath);
const runner = normalized(runnerPath);

assertMarkers('OPS-P6-002B workflow', workflow, [
  'execute_configured_staging_p6_07_q5',
  'p6-07-operations-recovery-receipt.json',
  'evaluate-ops-p6-001c-staging-authorization.mjs',
  'evaluation_mode: inventory',
  'incident exercise declared',
  'incident exercise closed',
  'issues: write',
  'cancel-in-progress: false',
]);

assertMarkers('OPS-P6-002B documentation', doc, [
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

assertMarkers('OPS-P6-002B runner', runner, [
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

const output = execFileSync(process.execPath, [runnerPath, '--self-test'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (!output.includes('OPS-P6-002B P6-07 incident exercise self-test passed.')) {
  throw new Error('OPS-P6-002B self-test success marker missing.');
}

console.log('OPS-P6-002B configured staging P6-07 incident exercise contract passed.');
