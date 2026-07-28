import fs from 'node:fs';

const requiredFiles = [
  'docs/P6_08_FINAL_LAUNCH_AUTHORIZATION_GO_LIVE_CLOSE_EVIDENCE.md',
  'docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md',
  'docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md',
  'docs/P6_05_CONFIGURED_PUBLIC_EXPORT_RELEASE_EVIDENCE.md',
  'docs/PROJECT_STATUS.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const normalize = (file) => fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();
const evidence = normalize(requiredFiles[0]);
const p607 = normalize(requiredFiles[1]);
const p606 = normalize(requiredFiles[2]);
const p605 = normalize(requiredFiles[3]);
const status = normalize(requiredFiles[4]);

const assertMarkers = (label, content, markers) => {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length) throw new Error(`${label} markers missing:\n- ${missing.join('\n- ')}`);
};

assertMarkers('P6-08 evidence', evidence, [
  'configured staging launch authorization: `not authorized`',
  'configured production launch authorization: `not authorized`',
  'repository ci alone cannot authorize launch',
  'preparation, authorization, execution, verification, rollback, and closure',
  'changed head, changed data, changed configuration, or changed credentials',
  'duplicate or concurrent execution attempts fail closed',
  'provider control-plane success alone is not proof',
  'intended immutable release identity rather than http status alone',
  'mixed old/new release responses',
  'changing a control-plane pointer without externally observing restored service',
  'launch cannot close immediately after first success',
  'open-risk register',
  'must not include credentials, passwords, api tokens',
  'the next phase owns post-launch operational verification',
]);

assertMarkers('P6-07 preservation', p607, [
  'monitoring',
  'alert',
  'backup',
  'restore',
  'incident',
]);
assertMarkers('P6-06 preservation', p606, ['domain', 'dns', 'tls', 'rollback']);
assertMarkers('P6-05 preservation', p605, ['immutable release', 'activation', 'externally observable publication']);
assertMarkers('PROJECT_STATUS', status, [
  'phase 6 — launch and cutover evidence',
  'p6-07 — configured operational monitoring, alerting, backup, restore, and incident-response evidence completed in #289 for issue #288',
  '0b0b328b8cb002977f1aa34e7385fc8eef56d324',
  'p6-08',
  'final launch authorization',
  'post-launch operational verification',
]);

console.log('P6-08 final launch authorization, go-live execution, and launch-close evidence contract passed.');