import { describe, expect, it } from 'vitest';
import { evidenceReviewDecisionAuditItem } from '../src/admin/audit-history/normalizers';

function row<T>(value: Partial<T>): T {
  return value as T;
}

describe('audit history normalizers', () => {
  it('maps Evidence review metadata', () => {
    const item = evidenceReviewDecisionAuditItem(
      row<Parameters<typeof evidenceReviewDecisionAuditItem>[0]>({
        id: '30000000-0000-4000-8000-000000000001',
        requestId: '30000000-0000-4000-8000-000000000002',
        evidenceId: '30000000-0000-4000-8000-000000000003',
        claimId: '30000000-0000-4000-8000-000000000004',
        claimAction: 'confirm',
        actorId: 'reviewer:evidence',
        actorType: 'human',
        reasonCode: 'evidence_supported_claim',
        publicSummary: 'Claim confirmed from accepted Evidence.',
        fromClaimStatus: 'candidate',
        toClaimStatus: 'confirmed',
        decidedAt: new Date('2026-07-04T10:00:00.000Z'),
      }),
    );

    expect(item).toMatchObject({
      domain: 'evidence',
      sourceKind: 'evidence_review_decision',
      action: 'confirm',
      transition: { fromState: 'candidate', toState: 'confirmed' },
    });
  });
});
