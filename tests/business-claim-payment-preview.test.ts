import { describe, expect, it } from 'vitest';
import {
  readBusinessClaimPaymentPreview,
  type BusinessClaimPaymentPreviewBackend,
  type BusinessClaimPaymentPreviewState,
} from '../src/admin/submissions/business-claim-payment-preview';
import { serializeBusinessClaimFieldApplicationEventPayload } from '../src/submissions/business-claim-field-application-persistence-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceEventId = '30000000-0000-4000-8000-000000000001';
const fieldEventId = '40000000-0000-4000-8000-000000000001';
const entityId = '50000000-0000-4000-8000-000000000001';
const claimId = '60000000-0000-4000-8000-000000000001';
const assetId = '70000000-0000-4000-8000-000000000001';
const networkId = '80000000-0000-4000-8000-000000000001';
const methodId = '90000000-0000-4000-8000-000000000001';
const generatedAt = new Date('2026-07-20T07:00:00.000Z');
const context = {
  actorId: 'reviewer:payment-preview',
  actorType: 'human' as const,
  capabilities: ['submission:business-claim-payment-preview:read'] as [
    'submission:business-claim-payment-preview:read',
  ],
};

function internalNote(routeType: 'direct_wallet' | 'processor_checkout' = 'direct_wallet') {
  const proposal = {
    assetSlug: 'bitcoin',
    networkSlug: 'bitcoin',
    routeType,
    paymentMethod:
      routeType === 'direct_wallet' ? ('onchain' as const) : ('processor_checkout' as const),
    processor:
      routeType === 'direct_wallet'
        ? null
        : { name: 'Example Pay', websiteUrl: 'https://pay.example/' },
    contractAddress: null,
    howToPay: 'Pay at checkout.',
    restrictions: null,
    isPrimary: true,
  };
  return serializeBusinessClaimFieldApplicationEventPayload({
    schemaVersion: 'business-claim-field-application-event-v1',
    request: {
      schemaVersion: 'business-claim-field-application-v1',
      requestId: fieldEventId,
      expectedSubmissionUpdatedAt: '2026-07-20T06:00:00.000Z',
      expectedRelationshipDecisionId: sourceEventId,
      expectedEntityUpdatedAt: null,
      expectedLocationUpdatedAt: null,
      entityDecision: null,
      locationDecision: null,
      paymentDecision: { acceptedIndexes: [0], rejectedIndexes: [] },
    },
    projection: {
      schemaVersion: 'business-claim-field-application-projection-v1',
      requestId: fieldEventId,
      requestFingerprint: `sha256:${'a'.repeat(64)}`,
      submissionId,
      relationshipDecisionId: sourceEventId,
      targetType: 'entity',
      targetId: entityId,
      entityApplication: null,
      locationApplication: null,
      paymentApplication: {
        acceptedIndexes: [0],
        rejectedIndexes: [],
        acceptedProposals: [proposal],
      },
      hasAcceptedChanges: true,
      generatedAt: '2026-07-20T06:05:00.000Z',
    },
    appliedAt: '2026-07-20T06:05:00.000Z',
  });
}

function state(
  routeType: 'direct_wallet' | 'processor_checkout' = 'direct_wallet',
): BusinessClaimPaymentPreviewState {
  return {
    application: {
      applicationId,
      submissionId,
      submissionType: 'claim',
      sourceDecisionKind: 'business_claim_relationship',
      sourceDecisionEventId: sourceEventId,
      applicationKind: 'business_claim_update',
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
      applicationReceipt: null,
      publicationReceipt: null,
      registeredAt: '2026-07-20T06:06:00.000Z',
      updatedAt: '2026-07-20T06:06:00.000Z',
      events: [
        {
          eventId: 'a0000000-0000-4000-8000-000000000001',
          action: 'registered',
          fromApplicationStatus: null,
          toApplicationStatus: 'pending',
          fromPublicationStatus: null,
          toPublicationStatus: 'blocked',
          createdAt: '2026-07-20T06:06:00.000Z',
        },
      ],
    },
    submission: {
      submissionId,
      submissionType: 'claim',
      targetType: 'entity',
      targetId: entityId,
      workflowStatus: 'resolved',
      resolution: 'approved',
    },
    sourceDecisionEvent: {
      eventId: sourceEventId,
      submissionId,
      toStatus: 'resolved',
      action: 'business_claim_relationship_approved',
    },
    fieldApplicationEvent: {
      eventId: fieldEventId,
      submissionId,
      action: 'business_claim_fields_applied',
      internalNote: internalNote(routeType),
    },
    target: { targetType: 'entity', targetId: entityId, entityId, locationId: null },
    claims:
      routeType === 'direct_wallet'
        ? [
            {
              claimId,
              entityId,
              locationId: null,
              claimStatus: 'confirmed',
              routeType: 'direct_wallet',
              processorId: null,
              updatedAt: '2026-07-20T05:00:00.000Z',
              deletedAt: null,
              rows: [],
            },
          ]
        : [],
  };
}

function backend(initial: BusinessClaimPaymentPreviewState): BusinessClaimPaymentPreviewBackend {
  return {
    async readApplicationState(id) {
      return id === applicationId ? structuredClone(initial) : null;
    },
    async readAssetBySlug(slug) {
      return slug === 'bitcoin' ? { id: assetId, slug, symbol: 'BTC', status: 'active' } : null;
    },
    async readNetworkBySlug(slug) {
      return slug === 'bitcoin' ? { id: networkId, slug, status: 'active' } : null;
    },
    async readPaymentMethodBySlug(slug) {
      return { id: methodId, slug, status: 'active' };
    },
    async readProcessorCandidates() {
      return [];
    },
  };
}

describe('P5-07E2 Business Claim payment preview', () => {
  it('attaches an exact direct-wallet draft to one compatible existing Claim', async () => {
    const preview = await readBusinessClaimPaymentPreview(
      context,
      backend(state()),
      applicationId,
      generatedAt,
    );

    expect(preview).toMatchObject({
      readiness: 'ready',
      acceptedDraftCount: 1,
      target: { targetType: 'entity', entityId, locationId: null },
      items: [
        {
          submittedIndex: 0,
          readiness: 'attach_existing_claim',
          selectedClaimId: claimId,
          issues: [],
        },
      ],
    });
    expect(preview.draftSetHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('classifies a fully resolved draft with no compatible Claim as candidate-Claim work', async () => {
    const initial = state();
    initial.claims = [];
    const preview = await readBusinessClaimPaymentPreview(
      context,
      backend(initial),
      applicationId,
      generatedAt,
    );
    expect(preview.items[0]).toMatchObject({
      readiness: 'create_candidate_claim',
      selectedClaimId: null,
    });
  });

  it('blocks processor checkout when no exact active processor identity exists', async () => {
    const preview = await readBusinessClaimPaymentPreview(
      context,
      backend(state('processor_checkout')),
      applicationId,
      generatedAt,
    );
    expect(preview.readiness).toBe('blocked');
    expect(preview.items[0]?.readiness).toBe('blocked');
    expect(preview.items[0]?.issues).toContain(
      'No exact active payment processor matches the submitted identity.',
    );
  });

  it('fails closed for a committed application or malformed field event', async () => {
    const committed = state();
    committed.application.applicationStatus = 'committed';
    committed.application.publicationStatus = 'pending';
    await expect(
      readBusinessClaimPaymentPreview(context, backend(committed), applicationId, generatedAt),
    ).rejects.toMatchObject({ code: 'ineligible' });

    const malformed = state();
    if (malformed.fieldApplicationEvent !== null) {
      malformed.fieldApplicationEvent.internalNote = '{}';
    }
    await expect(
      readBusinessClaimPaymentPreview(context, backend(malformed), applicationId, generatedAt),
    ).rejects.toMatchObject({ code: 'ineligible' });
  });
});
