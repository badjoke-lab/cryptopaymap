import { describe, expect, it, vi } from 'vitest';
import type { BusinessClaimFieldApplicationContext } from '../src/admin/submissions/business-claim-field-application-authorization';
import {
  applyBusinessClaimFieldApplication,
  type BusinessClaimFieldApplicationPersistenceBackend,
  type BusinessClaimFieldApplicationPersistenceEventRecord,
} from '../src/admin/submissions/business-claim-field-application-persistence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const relationshipDecisionId = '20000000-0000-4000-8000-000000000001';
const newRequestId = '30000000-0000-4000-8000-000000000001';
const priorRequestId = '30000000-0000-4000-8000-000000000002';

const context: BusinessClaimFieldApplicationContext = {
  actorId: 'cloudflare-access:field-applicant',
  actorType: 'human',
  capabilities: ['submission:claim-fields:apply'],
};

function priorApplication(): BusinessClaimFieldApplicationPersistenceEventRecord {
  return {
    eventId: priorRequestId,
    submissionId,
    fromStatus: null,
    toStatus: 'resolved',
    action: 'business_claim_fields_applied',
    reasonCode: 'field_decisions_reviewed_no_changes',
    actorId: context.actorId,
    internalNote: '{}',
    createdAt: '2026-07-14T08:30:00.000Z',
  };
}

describe('P5-04H3 one-time Claim field application guard', () => {
  it('rejects a second request UUID before projection or commit', async () => {
    const loadState = vi.fn(async () => {
      throw new Error('loadState must not run after a prior application is found');
    });
    const commitApplication = vi.fn();
    const backend: BusinessClaimFieldApplicationPersistenceBackend = {
      loadState,
      async readApplicationEvent() {
        return null;
      },
      async readSubmissionApplicationEvent() {
        return priorApplication();
      },
      commitApplication,
    };

    await expect(
      applyBusinessClaimFieldApplication(
        context,
        backend,
        submissionId,
        {
          schemaVersion: 'business-claim-field-application-v1',
          requestId: newRequestId,
          expectedSubmissionUpdatedAt: '2026-07-14T08:00:00.000Z',
          expectedRelationshipDecisionId: relationshipDecisionId,
          expectedEntityUpdatedAt: null,
          expectedLocationUpdatedAt: null,
          entityDecision: null,
          locationDecision: null,
          paymentDecision: null,
        },
        new Date('2026-07-14T09:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(loadState).not.toHaveBeenCalled();
    expect(commitApplication).not.toHaveBeenCalled();
  });
});
