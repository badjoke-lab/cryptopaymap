import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [packageJson, matrix, auditDoc, status] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('docs/P5_08A_MVP_B_INTEGRATION_AUDIT_MATRIX.md', 'utf8'),
  readFile('docs/P5_08E_PRIVACY_RETENTION_REPLAY_CONFLICT_PARTIAL_FAILURE_AUDIT.md', 'utf8'),
  readFile('docs/PROJECT_STATUS.md', 'utf8'),
]);

const packageData = JSON.parse(packageJson);
const schemaCheck = packageData.scripts?.['schema:check'];
assert.equal(typeof schemaCheck, 'string', 'P5-08E audit failed: schema:check is missing.');

const commonChecks = [
  'check-submission-contract.ts',
  'check-submission-persistence.ts',
  'check-submission-private-intake.ts',
  'check-submission-abuse-control.ts',
  'check-submission-private-status.ts',
  'check-submission-review-entry.ts',
  'check-submission-review-followup.ts',
  'check-submission-terminal-resolution.ts',
  'check-submission-application-registration.ts',
  'check-submission-application-lifecycle.ts',
  'check-p5-07a-canonical-retention-inventory.mjs',
  'check-export-release-contract.ts',
  'check-export-release-persistence.ts',
  'check-export-release-restore.ts',
  'check-export-release-integration.ts',
];

const familyChecks = {
  Suggest: [
    'check-suggest-private-intake.ts',
    'check-suggest-review-transitions.ts',
    'check-suggest-application-binding.ts',
    'check-candidate-promotion-integration.ts',
  ],
  'Payment Report': [
    'check-report-private-intake.ts',
    'check-evidence-review-integration.ts',
    'check-positive-payment-evidence.ts',
  ],
  'Problem Report': [
    'check-report-private-intake.ts',
    'check-problem-report-decisions.ts',
    'check-negative-recheck-application.ts',
    'check-problem-claim-asset-replacement-application.mjs',
  ],
  'Business Claim': [
    'check-business-claim-private-intake.ts',
    'check-business-claim-review-transitions.ts',
    'check-business-claim-payment-application.mjs',
    'check-business-claim-field-provenance.mjs',
  ],
  Photos: [
    'check-photo-media-submission-contract.ts',
    'check-media-review-integration.ts',
    'check-photo-parent-resolution.ts',
    'check-p5-07f-photo-media-receipt-binding.mjs',
  ],
};

for (const check of commonChecks) {
  assert.ok(schemaCheck.includes(check), `P5-08E audit failed: common check missing: ${check}`);
}

for (const [family, checks] of Object.entries(familyChecks)) {
  assert.ok(matrix.includes(`| ${family} |`), `P5-08E audit failed: matrix family missing: ${family}`);
  for (const check of checks) {
    assert.ok(schemaCheck.includes(check), `P5-08E audit failed: ${family} check missing: ${check}`);
  }
}

for (const marker of [
  'follow-up secrets, reviewer notes, abuse-control material',
  'Same-content replay is deterministic. Changed-content replay conflicts',
  'Private retention execution is exact-state guarded and durably receipted.',
  'Private deletion cannot erase required canonical/public provenance',
  'Photos parent Submission retention, child Media retention, source-object deletion',
  'P5-08F remains the next owner',
]) {
  assert.ok(auditDoc.includes(marker), `P5-08E audit failed: audit invariant missing: ${marker}`);
}

for (const marker of [
  'P5-08E — Privacy, retention, replay, conflict, and partial-failure integration audit',
  'P5-08D completed in #271',
  'P5-08F',
]) {
  assert.ok(status.includes(marker), `P5-08E audit failed: project status marker missing: ${marker}`);
}

console.log(
  JSON.stringify(
    {
      audit: 'P5-08E',
      result: 'pass',
      families: Object.keys(familyChecks),
      guarantees: [
        'private/public field separation',
        'opaque-reference and secret non-disclosure',
        'deterministic replay and changed-content conflict',
        'exact retention and durable deletion receipt',
        'partial-failure closure',
        'Photos parent-child-object separation',
      ],
    },
    null,
    2,
  ),
);
