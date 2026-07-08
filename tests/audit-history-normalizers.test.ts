import { describe, expect, it } from 'vitest';
import {
  evidenceReviewDecisionAuditItem,
  locationProfileCorrectionAuditItem,
} from '../src/admin/audit-history/normalizers';

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

  it('maps durable Location correction metadata without exposing internal payloads', () => {
    const item = locationProfileCorrectionAuditItem(
      row<Parameters<typeof locationProfileCorrectionAuditItem>[0]>({
        id: '40000000-0000-4000-8000-000000000001',
        requestId: '40000000-0000-4000-8000-000000000002',
        locationId: '40000000-0000-4000-8000-000000000003',
        actorId: 'cloudflare-access:reviewer',
        actorType: 'human',
        reasonCode: 'reviewed_profile_correction',
        publicSummary: 'Updated practical profile from reviewed source material.',
        internalNote: 'Protected reviewer note that must not enter the normalized item.',
        changedFieldPaths: ['phone', 'openingHours'],
        beforeValues: { phone: '+81 3 1111 1111' },
        afterValues: { phone: '+81 3 2222 2222' },
        decidedAt: new Date('2026-07-08T10:00:00.000Z'),
      }),
    );

    expect(item).toEqual({
      id: 'location_profile_correction:40000000-0000-4000-8000-000000000001',
      occurredAt: '2026-07-08T10:00:00.000Z',
      domain: 'canonical',
      sourceKind: 'location_profile_correction',
      action: 'correct_location_profile',
      actorId: 'cloudflare-access:reviewer',
      actorType: 'human',
      requestId: '40000000-0000-4000-8000-000000000002',
      target: { type: 'location', id: '40000000-0000-4000-8000-000000000003' },
      secondaryTargets: [],
      reasonCode: 'reviewed_profile_correction',
      summary: 'Updated practical profile from reviewed source material.',
      transition: null,
      sourceRecordId: '40000000-0000-4000-8000-000000000001',
    });
    expect(item).not.toHaveProperty('internalNote');
    expect(item).not.toHaveProperty('beforeValues');
    expect(item).not.toHaveProperty('afterValues');
  });
});
