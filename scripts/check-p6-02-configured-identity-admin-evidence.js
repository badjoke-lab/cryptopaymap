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

const evidence = fs.readFileSync(
  'docs/P6_02_CONFIGURED_IDENTITY_ADMIN_EVIDENCE.md',
  'utf8',
);
const status = fs.readFileSync('docs/PROJECT_STATUS.md', 'utf8');
const security = fs.readFileSync('docs/SECURITY_AND_PRIVACY.md', 'utf8');

const requiredEvidenceMarkers = [
  'Configured staging evidence: `unproven`',
  'Configured production evidence: `unproven`',
  'A page-only Access policy is insufficient.',
  '`candidate:review`',
  '`publication:run`',
  'Wrong audience',
  'Forged email header without assertion',
  'No raw assertion, session cookie, service token, email address, or secret header',
  'Repository audit passing means only that this evidence contract is present and internally consistent.',
  'P6-03 owns live Neon canonical transaction and application receipt-chain evidence.',
];

for (const marker of requiredEvidenceMarkers) {
  if (!evidence.includes(marker)) {
    throw new Error(`P6-02 evidence marker missing: ${marker}`);
  }
}

const requiredSecurityMarkers = [
  'default deny',
  'server-side validation of Access assertions',
  'issuer and audience validation',
  'no reliance on an unverified email header',
  'protected API routes as well as protected pages',
];

for (const marker of requiredSecurityMarkers) {
  if (!security.includes(marker)) {
    throw new Error(`Security architecture marker missing: ${marker}`);
  }
}

const requiredStatusMarkers = [
  'Phase 6 — Launch and cutover evidence',
  'P6-02 — Configured identity access and protected Admin evidence',
  'P6-01 — Launch evidence register and data QA baseline completed in #277 for Issue #276.',
  'c8e67cf93b1445f5451291fb1f67ccbb4723e701',
  'P6-03 live Neon canonical transaction and application receipt-chain evidence',
];

for (const marker of requiredStatusMarkers) {
  if (!status.includes(marker)) {
    throw new Error(`PROJECT_STATUS marker missing: ${marker}`);
  }
}

console.log('P6-02 configured identity and protected Admin evidence contract passed.');
