import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const service = read('src/admin/submissions/problem-claim-instruction-correction-application.ts');
for (const required of [
  "z.literal('problem-claim-instruction-correction-application-v1')",
  "z.literal('problem-claim-instruction-correction-source-v1')",
  "z.literal('problem-claim-instruction-correction-event-v1')",
  "decision.reportType !== 'wrong_instructions'",
  "decision.proposedCorrection?.kind !== 'instructions'",
  "submission.targetType !== 'claim'",
  "receipt: { kind: 'submission_event'",
]) {
  assert.ok(service.includes(required), `Missing D4 service boundary: ${required}`);
}
assert.doesNotMatch(service, /claimAssets/);
assert.doesNotMatch(service, /locationId:/);

const backend = read(
  'src/admin/submissions/drizzle-problem-claim-instruction-correction-application-backend.ts',
);
for (const required of [
  "sourceType} = 'user_submission'",
  "subjectType, 'acceptance_claim'",
  "fieldPath, 'howToPay'",
  "provenanceRole: 'correction'",
  "eventType: 'corrected'",
  "action: 'problem_claim_instructions_applied'",
  'database.batch',
]) {
  assert.ok(backend.includes(required), `Missing D4 atomic boundary: ${required}`);
}
assert.doesNotMatch(backend, /update\(claimAssets\)/);
assert.doesNotMatch(backend, /update\(locations\)/);
assert.doesNotMatch(backend, /\.set\(\{[^}]*claimStatus/s);
assert.doesNotMatch(backend, /\.set\(\{[^}]*nextReviewAt/s);

const authorization = read(
  'src/admin/submissions/problem-claim-instruction-correction-application-authorization.ts',
);
assert.match(authorization, /CPM_ADMIN_PROBLEM_CLAIM_INSTRUCTION_CORRECTION_SUBJECTS/);
assert.match(authorization, /submission:problem-claim-instructions:apply/);

const api = read(
  'functions/admin/api/problem-applications/[applicationId]/apply-claim-instructions.ts',
);
assert.match(api, /Cache-Control': 'private, no-store'/);
assert.match(api, /CPM_USER_SUBMISSION_SOURCE_ID/);
assert.doesNotMatch(api, /howToPay:/);
assert.doesNotMatch(api, /claimId:/);

const tests = read('tests/problem-claim-instruction-correction-application.test.ts');
assert.match(tests, /recognizes the exact canonical and common receipt on retry/);
assert.match(tests, /rejects a different correction class/);
assert.match(tests, /fails closed when the reviewed Claim version is stale/);

console.log('P5-07D4 Claim instruction correction application check passed.');
