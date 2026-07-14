import { describe, expect, it, vi } from 'vitest';
import { createBusinessClaimFieldApplicationHandlers } from '../functions/admin/api/business-claims/[submissionId]/field-application';
import type { BusinessClaimFieldApplicationRequest } from '../src/admin/submissions/business-claim-field-application';
import type { BusinessClaimFieldApplicationContext } from '../src/admin/submissions/business-claim-field-application-authorization';
import { BusinessClaimFieldApplicationPersistenceError } from '../src/admin/submissions/business-claim-field-application-persistence';
import type { BusinessClaimFieldApplicationWorkspaceResponse } from '../src/admin/submissions/business-claim-field-application-workspace';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const relationshipDecisionId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const submissionUpdatedAt = '2026-07-14T08:00:00.000Z';
const entityUpdatedAt = '2026-07-14T07:00:00.000Z';
const now = new Date('2026-07-14T09:00:00.000Z');

const identity = {
  actorId: 'cloudflare-access:subject-1',
  actorType: 'human' as const,
  subject: 'subject-1',
  email: 'reviewer@example.test',
};

function workspace(): BusinessClaimFieldApplicationWorkspaceResponse {
  return {
    generatedAt: now.toISOString(),
    submission: {
      id: submissionId,
      workflowStatus: 'resolved',
      resolution: 'approved',
      updatedAt: submissionUpdatedAt,
    },
    relationship: {
      decisionId: relationshipDecisionId,
      claimantRole: 'owner',
      verificationMethod: 'dns_txt',
      verifiedAt: '2026-07-14T07:20:00.000Z',
    },
    target: {
      targetType: 'entity',
      targetId: entityId,
      updatedAt: entityUpdatedAt,
    },
    requestedScopes: ['representative_relationship', 'entity_profile', 'payment_information'],
    entityFields: [
      {
        field: 'name',
        currentValue: 'Original Merchant',
        proposedValue: 'Updated Merchant',
      },
    ],
    locationFields: [],
    paymentProposals: [
      {
        index: 0,
        proposal: {
          assetSlug: 'xrp',
          networkSlug: 'xrpl',
          routeType: 'direct_wallet',
          paymentMethod: 'onchain',
          processor: null,
          contractAddress: null,
          howToPay: 'Pay the displayed XRPL address.',
          restrictions: null,
          isPrimary: true,
        },
      },
    ],
    requestSeed: {
      expectedSubmissionUpdatedAt: submissionUpdatedAt,
      expectedRelationshipDecisionId: relationshipDecisionId,
      expectedEntityUpdatedAt: entityUpdatedAt,
      expectedLocationUpdatedAt: null,
    },
    eligible: true,
    eligibilityIssues: [],
  };
}

function validBody() {
  return {
    expectedSubmissionUpdatedAt: submissionUpdatedAt,
    expectedRelationshipDecisionId: relationshipDecisionId,
    expectedEntityUpdatedAt: entityUpdatedAt,
    expectedLocationUpdatedAt: null,
    entityDecision: {
      acceptedFields: ['name'],
      rejectedFields: [],
    },
    locationDecision: null,
    paymentDecision: {
      acceptedIndexes: [0],
      rejectedIndexes: [],
    },
  };
}

function pagesContext(request: Request, allowedSubjects = ['subject-1']) {
  return {
    request,
    env: {
      CPM_ADMIN_CLAIM_FIELD_APPLICATION_SUBJECTS: JSON.stringify(allowedSubjects),
    },
    params: { submissionId },
    data: { adminIdentity: identity },
    waitUntil: vi.fn(),
  };
}

function url(relationshipId = relationshipDecisionId) {
  return `https://example.test/admin/api/business-claims/${submissionId}/field-application?relationshipDecisionId=${relationshipId}`;
}

describe('P5-04H3 protected Business Claim field application API', () => {
  it('returns the safe exact-version workspace to an allowlisted reviewer', async () => {
    const loadWorkspace = vi.fn(async () => workspace());
    const handlers = createBusinessClaimFieldApplicationHandlers({
      loadWorkspace,
      now: () => now,
    });
    const response = await handlers.get(pagesContext(new Request(url())));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      eligible: true,
      submission: { id: submissionId, updatedAt: submissionUpdatedAt },
      relationship: { decisionId: relationshipDecisionId },
      target: { targetId: entityId, updatedAt: entityUpdatedAt },
    });
    expect(loadWorkspace).toHaveBeenCalledOnce();
  });

  it('binds the UUID Idempotency-Key and exact relationship to the durable request', async () => {
    const writeApplication = vi.fn(
      async (
        mutationContext: BusinessClaimFieldApplicationContext,
        _submissionId: string,
        request: BusinessClaimFieldApplicationRequest,
      ) => ({
        state: 'committed' as const,
        submissionId,
        requestId: request.requestId,
        requestFingerprint: `sha256:${'a'.repeat(64)}`,
        relationshipDecisionId,
        targetType: 'entity' as const,
        targetId: entityId,
        appliedEntityFields: ['name'],
        rejectedEntityFields: [],
        appliedLocationFields: [],
        rejectedLocationFields: [],
        acceptedPaymentDraftCount: 1,
        rejectedPaymentDraftCount: 0,
        canonicalMutationCommitted: true,
        appliedAt: now.toISOString(),
        mutationContext,
      }),
    );
    const handlers = createBusinessClaimFieldApplicationHandlers({
      writeApplication,
      now: () => now,
    });
    const response = await handlers.post(
      pagesContext(
        new Request(url(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestId,
          },
          body: JSON.stringify(validBody()),
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(writeApplication).toHaveBeenCalledOnce();
    expect(writeApplication.mock.calls[0]?.[0]).toMatchObject({
      actorId: identity.actorId,
      capabilities: ['submission:claim-fields:apply'],
    });
    expect(writeApplication.mock.calls[0]?.[2]).toEqual({
      schemaVersion: 'business-claim-field-application-v1',
      requestId,
      ...validBody(),
    });
    const body = await response.text();
    expect(body).not.toContain('authorityStatement');
    expect(body).not.toContain('editingPermission');
  });

  it('rejects denied subjects, invalid idempotency keys, and relationship mismatches', async () => {
    const handlers = createBusinessClaimFieldApplicationHandlers({ now: () => now });
    const denied = await handlers.get(pagesContext(new Request(url()), ['different-subject']));
    expect(denied.status).toBe(403);

    const invalidKey = await handlers.post(
      pagesContext(
        new Request(url(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'invalid',
          },
          body: JSON.stringify(validBody()),
        }),
      ),
    );
    expect(invalidKey.status).toBe(400);

    const mismatch = await handlers.post(
      pagesContext(
        new Request(url('30000000-0000-4000-8000-000000000099'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestId,
          },
          body: JSON.stringify(validBody()),
        }),
      ),
    );
    expect(mismatch.status).toBe(409);
  });

  it('maps durable one-time and stale-state conflicts to a bounded 409 response', async () => {
    const handlers = createBusinessClaimFieldApplicationHandlers({
      writeApplication: async () => {
        throw new BusinessClaimFieldApplicationPersistenceError('conflict', 'already applied');
      },
      now: () => now,
    });
    const response = await handlers.post(
      pagesContext(
        new Request(url(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestId,
          },
          body: JSON.stringify(validBody()),
        }),
      ),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'claim_field_application_conflict',
    });
  });
});
