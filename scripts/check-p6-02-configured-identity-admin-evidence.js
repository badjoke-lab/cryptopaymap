import fs from 'node:fs';

const requiredFiles = [
  'docs/P6_01_LAUNCH_EVIDENCE_REGISTER_DATA_QA_BASELINE.md',
  'docs/P6_02_CONFIGURED_IDENTITY_ADMIN_EVIDENCE.md',
  'docs/PROJECT_STATUS.md',
  'docs/SECURITY_AND_PRIVACY.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const readNormalized = (file) =>
  fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();

const evidence = readNormalized(
  'docs/P6_02_CONFIGURED_IDENTITY_ADMIN_EVIDENCE.md',
);
const status = readNormalized('docs/PROJECT_STATUS.md');
const security = readNormalized('docs/SECURITY_AND_PRIVACY.md');

const assertMarkers = (label, content, markers) => {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`${label} markers missing:\n- ${missing.join('\n- ')}`);
  }
};

assertMarkers('P6-02 evidence', evidence, [
  'configured staging evidence: `unproven`',
  'configured production evidence: `unproven`',
  'page-only access policy is insufficient',
  '`candidate:review`',
  '`publication:run`',
  'wrong audience',
  'forged email header without assertion',
  'no raw assertion, session cookie, service token, email address, or secret header',
  'repository audit passing means only that this evidence contract is present and internally consistent',
  'p6-03 owns live neon canonical transaction and application receipt-chain evidence',
]);

assertMarkers('Security architecture', security, [
  'cloudflare access',
  'default deny',
  'server-side validation',
  'issuer and audience validation',
  'unverified email header',
  'protected api routes',
  'protected pages',
]);

assertMarkers('PROJECT_STATUS', status, [
  'phase 6 — launch and cutover evidence',
  'p6-02 — configured identity access and protected admin evidence completed in #279 for issue #278',
  'p6-01 — launch evidence register and data qa baseline completed in #277 for issue #276',
  'b2c076aeb66c79a61732e18f10a50485332e058a',
  'p6-03',
  'live neon canonical transaction',
]);

console.log('P6-02 configured identity and protected Admin evidence contract passed.');