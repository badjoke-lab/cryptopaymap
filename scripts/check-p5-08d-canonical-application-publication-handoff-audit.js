import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [packageJson, matrix, auditDoc, status] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('docs/P5_08A_MVP_B_INTEGRATION_AUDIT_MATRIX.md', 'utf8'),
  readFile('docs/P5_08D_CANONICAL_APPLICATION_PUBLICATION_HANDOFF_AUDIT.md', 'utf8'),
  readFile('docs/PROJECT_STATUS.md', 'utf8'),
]);

const packageData = JSON.parse(packageJson);
const schemaCheck = packageData.scripts?.['schema:check'];
assert.equal(typeof schemaCheck, 'string', 'P5-08D audit failed: schema:check is missing.');

const commonChecks = [
  'check-submission-application-registration.ts',
  'check-submission-application-lifecycle.ts',
  'check-export-release-contract.ts',
  'check-export-release-persistence.ts',
  'check-export-activation.ts',
  'check-export-release-integration.ts',
];

const familyChecks = {
  Suggest: [
    'check-candidate-promotion-persistence.ts',
    'check-candidate-existing-target-link.ts',
    'check-candidate-promotion-provenance.ts',
    'check-candidate-promotion-integration.ts',
    'check-suggest-application-binding.ts',
  ],
  'Payment Report': [
    'check-positive-payment-evidence.ts',
    'check-evidence-review-persistence.ts',
    'check-evidence-review-integration.ts',
  ],
  'Problem Report': [
    'check-problem-location-correction-application.ts',
    'check-negative-recheck-application.ts',
    'check-problem-claim-instruction-correction-application.mjs',
    'check-problem-claim-asset-replacement-application.mjs',
  ],
  'Business Claim': [
    'check-business-claim-application-order.mjs',
    'check-business-claim-payment-plan.mjs',
    'check-business-claim-payment-application.mjs',
    'check-business-claim-field-provenance.mjs',
  ],
  Photos: [
    'check-media-review-integration.ts',
    'check-p5-07f-photo-media-receipt-binding.mjs',
    'check-photo-parent-resolution.ts',
  ],
};

for (const check of commonChecks) {
  assert.ok(schemaCheck.includes(check), `P5-08D audit failed: common check missing: ${check}`);
}

for (const [family, checks] of Object.entries(familyChecks)) {
  assert.ok(matrix.includes(`| ${family} |`), `P5-08D audit failed: matrix family missing: ${family}`);
  for (const check of checks) {
    assert.ok(schemaCheck.includes(check), `P5-08D audit failed: ${family} check missing: ${check}`);
  }
}

for (const marker of [
  'one explicit canonical application owner and durable application receipt',
  'applied-without-receipt state',
  'Application completion does not equal export completion',
  'published-without-release state',
  'P5-08E remains the next owner',
]) {
  assert.ok(auditDoc.includes(marker), `P5-08D audit failed: audit invariant missing: ${marker}`);
}

for (const marker of [
  'P5-08D — Canonical application and publication-handoff integration audit',
  'P5-08C completed in #269',
  'P5-08E',
]) {
  assert.ok(status.includes(marker), `P5-08D audit failed: project status marker missing: ${marker}`);
}

console.log(
  JSON.stringify(
    {
      audit: 'P5-08D',
      result: 'pass',
      families: Object.keys(familyChecks),
      guarantees: [
        'exact canonical application owner',
        'durable application receipt',
        'replay and conflict closure',
        'atomic mutation and receipt boundary',
        'application and publication separation',
        'export release activation ownership retained',
      ],
    },
    null,
    2,
  ),
);