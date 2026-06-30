import { describe, expect, it } from 'vitest';
import { createDrizzleCandidatePromotionBackend } from '../src/admin/promotion/drizzle-candidate-promotion-backend';
import { candidatePromotionDecisions } from '../src/db/schema';

describe('Candidate promotion persistence foundation', () => {
  it('exposes the durable replay and canonical audit columns', () => {
    expect(candidatePromotionDecisions.requestId.name).toBe('request_id');
    expect(candidatePromotionDecisions.candidateId.name).toBe('candidate_id');
    expect(candidatePromotionDecisions.claimAssetIds.name).toBe('claim_asset_ids');
    expect(candidatePromotionDecisions.sourceRecordIds.name).toBe('source_record_ids');
    expect(candidatePromotionDecisions.requestFingerprint.name).toBe('request_fingerprint');
  });

  it('exports the production Drizzle backend factory', () => {
    expect(createDrizzleCandidatePromotionBackend).toBeTypeOf('function');
  });
});
