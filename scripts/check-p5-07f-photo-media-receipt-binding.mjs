import { readFileSync } from 'node:fs';

const registration = readFileSync('src/admin/submissions/application-registration.ts', 'utf8');
const backend = readFileSync(
  'src/admin/submissions/drizzle-application-registration-backend.ts',
  'utf8',
);
const tests = readFileSync('tests/submission-application-registration.test.ts', 'utf8');
const status = readFileSync('docs/PROJECT_STATUS.md', 'utf8');
const documentation = readFileSync('docs/P5_07F_PHOTO_MEDIA_RECEIPT_BINDING.md', 'utf8');

for (const marker of [
  "request.sourceDecisionKind === 'photos_parent_resolution'",
  "applicationReceipt: { kind: 'media_review_decision', ids: decisionIds }",
  "publicationStatus: 'pending'",
  'photoParentMediaDecisionIds',
]) {
  if (!registration.includes(marker)) throw new Error(`Registration marker missing: ${marker}`);
}
for (const marker of [
  'parsePhotoParentResolutionEventPayload',
  'mediaReviewDecisions',
  "decision.expectedReviewStatus !== 'pending'",
  'Photos parent resolution does not match its durable Media receipt.',
]) {
  if (!backend.includes(marker)) throw new Error(`Backend marker missing: ${marker}`);
}
for (const marker of [
  "receiptKind: 'media_review_decision'",
  'photoParentMediaDecisionIds: [mediaDecisionIdB, mediaDecisionIdA]',
  'without one exact complete Media receipt set',
]) {
  if (!tests.includes(marker)) throw new Error(`Test marker missing: ${marker}`);
}
for (const marker of ['P5-07F — Photos Media receipt binding', 'P5-07G']) {
  if (!status.includes(marker)) throw new Error(`Status marker missing: ${marker}`);
}
for (const marker of [
  'media_review_decision',
  'Publication remains pending',
  'No Media, Submission, export, or release mutation',
]) {
  if (!documentation.includes(marker)) throw new Error(`Documentation marker missing: ${marker}`);
}
console.log('P5-07F Photos Media receipt binding checks passed.');
