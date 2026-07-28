import fs from 'node:fs';

const requiredFiles = [
  'docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md',
  'docs/P6_05_CONFIGURED_PUBLIC_EXPORT_RELEASE_EVIDENCE.md',
  'docs/PROJECT_STATUS.md',
  'docs/MIGRATION_AND_CUTOVER.md',
  'docs/SECURITY_AND_PRIVACY.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const normalize = (file) =>
  fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();

const evidence = normalize('docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md');
const p605 = normalize('docs/P6_05_CONFIGURED_PUBLIC_EXPORT_RELEASE_EVIDENCE.md');
const migration = normalize('docs/MIGRATION_AND_CUTOVER.md');
const security = normalize('docs/SECURITY_AND_PRIVACY.md');
const status = normalize('docs/PROJECT_STATUS.md');

const assertMarkers = (label, content, markers) => {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length) throw new Error(`${label} markers missing:\n- ${missing.join('\n- ')}`);
};

assertMarkers('P6-06 evidence', evidence, [
  'configured staging evidence: `unproven`',
  'configured production evidence: `unproven`',
  'authoritative name-server observations',
  'independent recursive resolver observations',
  'a control-plane status of `active` is not sufficient',
  'no plaintext downgrade',
  'no loop and bounded hop count',
  'protected admin host/path',
  'mixed old/new release responses',
  'changing dns back without externally observing service recovery is not rollback proof',
  'no registrar password, dns token, tls private key',
  'repository audit passing means only that this evidence contract is present and internally consistent',
  'p6-07 owns configured operational monitoring',
]);

assertMarkers('P6-05 preservation', p605, [
  'immutable release',
  'activation',
  'rollback',
  'externally observable publication',
]);
assertMarkers('Migration and cutover preservation', migration, ['cutover', 'rollback']);
assertMarkers('Security preservation', security, ['https', 'protected']);
assertMarkers('PROJECT_STATUS', status, [
  'phase 6 — launch and cutover evidence',
  'p6-05 — configured public export and release evidence completed in #285 for issue #284',
  'p6-06 — configured domain cutover and rollback evidence completed in #287 for issue #286',
  'p6-07 — configured operational monitoring, alerting, backup, restore, and incident-response evidence completed in #289 for issue #288',
  'p6-08',
  'final launch authorization',
]);

console.log('P6-06 configured domain cutover and rollback evidence contract passed.');