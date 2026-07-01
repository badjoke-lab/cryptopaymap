import { createDrizzleEvidenceReviewBackend } from '../src/admin/evidence-review/drizzle-backend';
import { evidenceReviewDecisions, verificationEventTypeValues } from '../src/db/schema';

if (evidenceReviewDecisions.requestId.name !== 'request_id') {
  throw new Error('Evidence review decisions do not expose durable request IDs.');
}
if (evidenceReviewDecisions.requestFingerprint.name !== 'request_fingerprint') {
  throw new Error('Evidence review decisions do not expose replay fingerprints.');
}
if (!verificationEventTypeValues.includes('rejected')) {
  throw new Error('Rejected Claim transitions are missing from verification events.');
}
if (typeof createDrizzleEvidenceReviewBackend !== 'function') {
  throw new Error('The production Evidence review backend is unavailable.');
}

console.log('Evidence review persistence checks passed.');
