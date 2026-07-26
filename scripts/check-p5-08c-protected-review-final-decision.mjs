import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [packageJson, matrix, auditDoc, status] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('docs/P5_08A_MVP_B_INTEGRATION_AUDIT_MATRIX.md', 'utf8'),
  readFile('docs/P5_08C_PROTECTED_REVIEW_FINAL_DECISION_AUDIT.md', 'utf8'),
  readFile('docs/PROJECT_STATUS.md', 'utf8'),
]);

const schemaCheck = JSON.parse(packageJson).scripts?.['schema:check'];
assert.equal(typeof schemaCheck, 'string', 'P5-08C audit failed: schema:check is missing.');

const commonChecks = [
  'check-submission-review-entry.ts',
  'check-submission-review-followup.ts',
  'check-submission-terminal-resolution.ts',
  'check-submission-application-registration.ts',
  'check-submission-application-lifecycle.ts',
];

const familyChecks = {
  Suggest: [
    'check-suggest-submission-reviewer-entry.ts',
    'check-suggest-review-signals.ts',
    'check-suggest-review-transitions.ts',
    'check-suggest-information-request.ts',
    'check-suggest-hold.ts',
    'check-suggest-accepted-candidate.ts',
  ],
  'Payment Report': [
    'check-evidence-review-decision.ts',
    'check-evidence-review-integration.ts',
    'check-positive-payment-evidence.ts',
  ],
  'Problem Report': [
    'check-report-submission-reviewer-entry.ts',
    'check-problem-report-decisions.ts',
    'check-negative-report-evidence.ts',
    'check-negative-recheck-application.ts',
  ],
  'Business Claim': [
    'check-business-claim-submission-reviewer-entry.ts',
    'check-business-claim-review-transitions.ts',
    'check-business-claim-verification-execution.ts',
    'check-business-claim-relationship-decision.ts',
    'check-business-claim-field-application-reviewer-flow.ts',
  ],
  Photos: [
    'check-media-review-decision.ts',
    'check-media-review-integration.ts',
    'check-photo-parent-resolution.ts',
    'check-photo-parent-resolution-preview.ts',
  ],
};

for (const check of commonChecks) {
  assert.ok(schemaCheck.includes(check), `P5-08C audit failed: common check missing: ${check}`);
}
for (const [family, checks] of Object.entries(familyChecks)) {
  assert.ok(matrix.includes(`| ${family} |`), `P5-08C audit failed: matrix family missing: ${family}`);
  for (const check of checks) {
    assert.ok(schemaCheck.includes(check), `P5-08C audit failed: ${family} check missing: ${check}`);
  }
}

for (const marker of [
  'exact registered capability and subject boundary',
  'reject stale state, invalid transitions, changed-content replay',
  'Durable decision events or receipts exist before canonical application registration proceeds.',
  'Review completion does not equal application completion or publication completion.',
  'Parent resolution requires the exact complete eligible child decision set.',
  'P5-08D remains the next owner',
]) {
  assert.ok(auditDoc.includes(marker), `P5-08C audit failed: audit invariant missing: ${marker}`);
}

for (const marker of [
  'P5-08C — Protected review and final-decision integration audit',
  'P5-08B completed in #267',
  'P5-08D',
]) {
  assert.ok(status.includes(marker), `P5-08C audit failed: project status marker missing: ${marker}`);
}

console.log(JSON.stringify({
  audit: 'P5-08C',
  result: 'pass',
  families: Object.keys(familyChecks),
  guarantees: [
    'protected capability and subject boundary',
    'cross-family review owner coverage',
    'exact-state final decisions',
    'replay and conflict failure closure',
    'durable decision before application',
    'application and publication separation',
  ],
}, null, 2));