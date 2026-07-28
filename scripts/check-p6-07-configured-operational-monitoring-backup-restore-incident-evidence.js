import fs from 'node:fs';

const requiredFiles = [
  'docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md',
  'docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md',
  'docs/PROJECT_STATUS.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const normalize = (file) =>
  fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();

const evidence = normalize(
  'docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md',
);
const p606 = normalize('docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md');
const status = normalize('docs/PROJECT_STATUS.md');

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
  'f9bf5256879c8cf2d59e5c32210b7b03d34672c2',
  'p6-07',
  'operational monitoring, alerting, backup, restore, and incident-response evidence',
  'p6-08',
]);

console.log('P6-07 configured operational evidence contract passed.');
