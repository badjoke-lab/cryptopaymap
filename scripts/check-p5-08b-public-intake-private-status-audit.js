import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [packageJson, matrix, auditDoc, status] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('docs/P5_08A_MVP_B_INTEGRATION_AUDIT_MATRIX.md', 'utf8'),
  readFile('docs/P5_08B_PUBLIC_INTAKE_PRIVATE_STATUS_AUDIT.md', 'utf8'),
  readFile('docs/PROJECT_STATUS.md', 'utf8'),
]);

const packageData = JSON.parse(packageJson);
const schemaCheck = packageData.scripts?.['schema:check'];
assert.equal(typeof schemaCheck, 'string', 'P5-08B audit failed: schema:check is missing.');

const requiredCommonChecks = [
  'check-submission-contract.ts',
  'check-submission-persistence.ts',
  'check-submission-private-intake.ts',
  'check-submission-abuse-control.ts',
  'check-submission-private-status.ts',
];

const requiredFamilyChecks = {
  Suggest: [
    'check-suggest-submission-contract.ts',
    'check-suggest-private-intake.ts',
    'check-suggest-form-artifact.mjs',
  ],
  'Payment Report': [
    'check-report-submission-contract.ts',
    'check-report-private-intake.ts',
    'check-report-public-intake.ts',
    'check-report-form-artifact.mjs',
  ],
  'Problem Report': [
    'check-report-submission-contract.ts',
    'check-report-private-intake.ts',
    'check-report-public-intake.ts',
    'check-report-form-artifact.mjs',
  ],
  'Business Claim': [
    'check-business-claim-contract.ts',
    'check-business-claim-private-intake.ts',
  ],
  Photos: [
    'check-photo-media-submission-contract.ts',
    'check-photo-public-form.ts',
    'check-photo-form-artifact.mjs',
  ],
};

const stagingCheck = packageData.scripts?.['staging:check'];
assert.equal(typeof stagingCheck, 'string', 'P5-08B audit failed: staging:check is missing.');

for (const check of requiredCommonChecks) {
  assert.ok(schemaCheck.includes(check), `P5-08B audit failed: common check missing: ${check}`);
}

for (const [family, checks] of Object.entries(requiredFamilyChecks)) {
  assert.ok(matrix.includes(`| ${family} |`), `P5-08B audit failed: matrix family missing: ${family}`);
  for (const check of checks) {
    const owner = check.endsWith('.mjs') ? stagingCheck : schemaCheck;
    assert.ok(owner.includes(check), `P5-08B audit failed: ${family} check missing: ${check}`);
  }
}

for (const marker of [
  'opaque public reference',
  'valid follow-up secret',
  'Missing references and incorrect secrets use the same bounded public failure',
  'Public intake never directly mutates Candidate',
  'Photos exposes only bounded Media decision state',
  'P5-08C remains the next owner',
]) {
  assert.ok(auditDoc.includes(marker), `P5-08B audit failed: audit invariant missing: ${marker}`);
}

for (const marker of [
  'P5-08A',
  'P5-08B',
  'P5-08C',
  'repository-executable evidence',
  'Configured-environment evidence',
]) {
  assert.ok(matrix.includes(marker), `P5-08B audit failed: P5-08A handoff missing: ${marker}`);
}

for (const marker of [
  'P5-08B — Public intake and private-status integration audit',
  'P5-08A completed in #265',
  'P5-08C',
]) {
  assert.ok(status.includes(marker), `P5-08B audit failed: project status marker missing: ${marker}`);
}

console.log(
  JSON.stringify(
    {
      audit: 'P5-08B',
      result: 'pass',
      families: Object.keys(requiredFamilyChecks),
      guarantees: [
        'common private Submission ownership',
        'five-family public intake coverage',
        'abuse-control owner coverage',
        'opaque-reference and secret status boundary',
        'bounded private-status projection',
        'repository versus configured evidence separation',
      ],
    },
    null,
    2,
  ),
);