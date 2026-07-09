import { describe, expect, it } from 'vitest';
import { createDrizzleEvidenceReviewBackend } from '../src/admin/evidence-review/drizzle-backend';
import { evidenceReviewDecisions, verificationEventTypeValues } from '../src/db/schema';

describe('Evidence review persistence foundation', () => {
  it('exposes durable request, state, replay, and reviewed-set columns', () => {
    expect(evidenceReviewDecisions.requestId.name).toBe('request_id');
    expect(evidenceReviewDecisions.evidenceId.name).toBe('evidence_id');
    expect(evidenceReviewDecisions.claimAction.name).toBe('claim_action');
    expect(evidenceReviewDecisions.expectedAcceptedEvidenceIds.name).toBe(
      'expected_accepted_evidence_ids',
    );
    expect(evidenceReviewDecisions.expectedClaimAssetIds.name).toBe('expected_claim_asset_ids');
    expect(evidenceReviewDecisions.requestFingerprint.name).toBe('request_fingerprint');
  });

  it('exports the production Drizzle backend and rejected event type', () => {
    expect(createDrizzleEvidenceReviewBackend).toBeTypeOf('function');
    expect(verificationEventTypeValues).toContain('rejected');
  });
});
