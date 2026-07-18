import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseProblemClaimInstructionCorrectionEvent,
  problemClaimInstructionCorrectionApplicationReceiptSchema,
  problemClaimInstructionCorrectionApplicationRequestSchema,
  problemClaimInstructionCorrectionEventPayloadSchema,
  problemClaimInstructionCorrectionSourcePayloadSchema,
} from '../src/admin/submissions/problem-claim-instruction-correction-application';

const request = problemClaimInstructionCorrectionApplicationRequestSchema.parse({
  schemaVersion: 'problem-claim-instruction-correction-application-v1',
  requestId: '10000000-0000-4000-8000-000000000001',
  expectedApplicationUpdatedAt: '2026-07-18T11:00:00.000Z',
  expectedClaimUpdatedAt: '2026-07-18T10:00:00.000Z',
});
assert.equal(request.expectedClaimUpdatedAt, '2026-07-18T10:00:00.000Z');
assert.equal(
  problemClaimInstructionCorrectionApplicationRequestSchema.safeParse({
    ...request,
    claimId: '20000000-0000-4000-8000-000000000001',
  }).success,
  false,
);
assert.equal(
  problemClaimInstructionCorrectionApplicationRequestSchema.safeParse({
    ...request,
    howToPay: 'Client-selected canonical value',
  }).success,
  false,
);

const source = problemClaimInstructionCorrectionSourcePayloadSchema.parse({
  schemaVersion: 'problem-claim-instruction-correction-source-v1',
  submissionReference: 'CPM-S-2026-000654',
  sourceDecisionEventId: '30000000-0000-4000-8000-000000000001',
  targetClaimId: '40000000-0000-4000-8000-000000000001',
  reportType: 'wrong_instructions',
  observedAt: '2026-07-12',
  howToPay: 'Ask staff to display the Lightning invoice.',
});
assert.equal('reviewerNote' in source, false);
assert.equal('privateEvidenceUrl' in source, false);

const event = problemClaimInstructionCorrectionEventPayloadSchema.parse({
  schemaVersion: 'problem-claim-instruction-correction-event-v1',
  requestFingerprint: 'a'.repeat(64),
  applicationId: '10000000-0000-4000-8000-000000000001',
  sourceDecisionEventId: '30000000-0000-4000-8000-000000000001',
  claimId: '40000000-0000-4000-8000-000000000001',
  sourceRecordId: '50000000-0000-4000-8000-000000000001',
  verificationEventId: '60000000-0000-4000-8000-000000000001',
  expectedClaimUpdatedAt: '2026-07-18T10:00:00.000Z',
  beforeHowToPay: 'Old instructions.',
  afterHowToPay: 'New instructions.',
});
assert.deepEqual(parseProblemClaimInstructionCorrectionEvent(JSON.stringify(event)), event);
assert.equal(parseProblemClaimInstructionCorrectionEvent('{broken'), null);

problemClaimInstructionCorrectionApplicationReceiptSchema.parse({
  state: 'committed',
  applicationId: event.applicationId,
  submissionId: '20000000-0000-4000-8000-000000000001',
  claimId: event.claimId,
  correctionEventId: request.requestId,
  sourceRecordId: event.sourceRecordId,
  verificationEventId: event.verificationEventId,
  applicationStatus: 'committed',
  publicationStatus: 'pending',
  transitionEventId: request.requestId,
  appliedAt: '2026-07-18T12:00:00.000Z',
});

const service = readFileSync(
  'src/admin/submissions/problem-claim-instruction-correction-application.ts',
  'utf8',
);
assert.match(service, /decision\.reportType !== 'wrong_instructions'/);
assert.match(service, /decision\.proposedCorrection\?\.kind !== 'instructions'/);
assert.match(service, /submission\.targetType !== 'claim'/);
assert.match(service, /receipt: \{ kind: 'submission_event'/);
assert.doesNotMatch(service, /claimAssets/);
assert.doesNotMatch(service, /locationId:/);

const backend = readFileSync(
  'src/admin/submissions/drizzle-problem-claim-instruction-correction-application-backend.ts',
  'utf8',
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

const api = readFileSync(
  'functions/admin/api/problem-applications/[applicationId]/apply-claim-instructions.ts',
  'utf8',
);
assert.match(api, /Cache-Control': 'private, no-store'/);
assert.match(api, /CPM_USER_SUBMISSION_SOURCE_ID/);
assert.match(api, /CPM_ADMIN_PROBLEM_CLAIM_INSTRUCTION_CORRECTION_SUBJECTS/);

console.log('P5-07D4 Claim instruction correction application check passed.');
