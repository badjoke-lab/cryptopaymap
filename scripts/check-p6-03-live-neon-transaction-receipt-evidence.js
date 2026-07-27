import fs from 'node:fs';

const requiredFiles = [
  'docs/P6_03_LIVE_NEON_TRANSACTION_RECEIPT_EVIDENCE.md',
  'docs/P6_02_CONFIGURED_IDENTITY_ADMIN_EVIDENCE.md',
  'docs/P5_08D_CANONICAL_APPLICATION_PUBLICATION_HANDOFF_AUDIT.md',
  'docs/PROJECT_STATUS.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const normalize = (file) =>
  fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();

const evidence = normalize(
  'docs/P6_03_LIVE_NEON_TRANSACTION_RECEIPT_EVIDENCE.md',
);
const p508d = normalize(
  'docs/P5_08D_CANONICAL_APPLICATION_PUBLICATION_HANDOFF_AUDIT.md',
);
const status = normalize('docs/PROJECT_STATUS.md');

const assertMarkers = (label, content, markers) => {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`${label} markers missing:\n- ${missing.join('\n- ')}`);
  }
};

assertMarkers('P6-03 evidence', evidence, [
  'configured staging evidence: `unproven`',
  'configured production evidence: `unproven`',
  'canonical mutation, application receipt, and required audit events must commit atomically',
  'injected-failure rollback',
  'no partial application receipt exists',
  'replay of the same completed application',
  'concurrent duplicate execution',
  'changed source content',
  'stale canonical pre-state',
  'a committed canonical transaction is not proof of publication',
  'no connection string, password, token',
  'repository audit passing means only that this evidence contract is present and internally consistent',
  'p6-04 owns configured r2 media upload',
]);

assertMarkers('P5-08D preservation', p508d, [
  'canonical application',
  'publication',
  'application receipt',
  'partial failure',
]);

assertMarkers('PROJECT_STATUS', status, [
  'phase 6 — launch and cutover evidence',
  'p6-03 — live neon canonical transaction and application receipt evidence',
  'p6-02 — configured identity access and protected admin evidence completed in #279 for issue #278',
  'b2c076aeb66c79a61732e18f10a50485332e058a',
  'p6-04 configured r2 media lifecycle evidence',
]);

console.log('P6-03 live Neon transaction and receipt evidence contract passed.');