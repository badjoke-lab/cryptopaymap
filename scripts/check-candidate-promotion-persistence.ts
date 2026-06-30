import { createDrizzleCandidatePromotionBackend } from '../src/admin/promotion/drizzle-candidate-promotion-backend';
import { candidatePromotionDecisions } from '../src/db/schema';

const requiredColumns = [
  'requestId',
  'candidateId',
  'entityId',
  'locationId',
  'claimId',
  'claimAssetIds',
  'sourceRecordIds',
  'canonicalPath',
  'actorId',
  'actorType',
  'expectedCandidateUpdatedAt',
  'promotedAt',
  'requestFingerprint',
] as const;

for (const column of requiredColumns) {
  if (!(column in candidatePromotionDecisions)) {
    throw new Error(`Candidate promotion audit column is missing: ${column}`);
  }
}

if (candidatePromotionDecisions.requestId.name !== 'request_id') {
  throw new Error('Candidate promotion request identity is not mapped to request_id.');
}
if (candidatePromotionDecisions.requestFingerprint.name !== 'request_fingerprint') {
  throw new Error('Candidate promotion replay fingerprint is not persisted.');
}
if (typeof createDrizzleCandidatePromotionBackend !== 'function') {
  throw new Error('Candidate promotion Drizzle backend is unavailable.');
}

console.log('Candidate promotion persistence checks passed.');
