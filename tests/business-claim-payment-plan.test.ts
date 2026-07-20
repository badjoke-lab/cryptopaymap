import { describe, expect, it } from 'vitest';
import {
  prepareBusinessClaimPaymentPlan,
  type BusinessClaimPaymentPlanBackend,
  type BusinessClaimPaymentPlanCommitCommand,
  type BusinessClaimPaymentPlanEventRecord,
} from '../src/admin/submissions/business-claim-payment-plan';
import {
  readBusinessClaimPaymentPreview,
  type BusinessClaimPaymentPreviewState,
} from '../src/admin/submissions/business-claim-payment-preview';
import { parseBusinessClaimPaymentPlanEventPayload } from '../src/submissions/business-claim-payment-plan-contract';
import { serializeBusinessClaimFieldApplicationEventPayload } from '../src/submissions/business-claim-field-application-persistence-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceEventId = '30000000-0000-4000-8000-000000000001';
const fieldEventId = '40000000-0000-4000-8000-000000000001';
const entityId = '50000000-0000-4000-8000-000000000001';
const firstClaimId = '60000000-0000-4000-8000-000000000001';
const secondClaimId = '60000000-0000-4000-8000-000000000002';
const existingRowId = '61000000-0000-4000-8000-000000000001';
const assetId = '70000000-0000-4000-8000-000000000001';
const networkId = '80000000-0000-4000-8000-000000000001';
const methodId = '90000000-0000-4000-8000-000000000001';
const planId = 'a0000000-0000-4000-8000-000000000001';
const plannedAt = new Date('2026-07-20T12:00:00.000Z');
const context = {
  actorId: 'reviewer:payment-plan',
  actorType: 'human' as const,
  capabilities: ['submission:business-claim-payment-plan:prepare'] as [
    'submission:business-claim-payment-plan:prepare',
  ],
};

function proposal(isPrimary = true) {
  return {
    assetSlug: 'bitcoin',
    networkSlug: 'bitcoin',
    routeType: 'direct_wallet' as const,
    paymentMethod: 'onchain' as const,
    processor: null,
    contractAddress: null,
    howToPay: 'Pay at checkout.',
    restrictions: null,
    isPrimary,
  };
}

function fieldNote(proposals = [proposal()]) {
  return serializeBusinessClaimFieldApplicationEventPayload({
    schemaVersion: 'business-claim-field-application-event-v1',
    request: {
      schemaVersion: 'business-claim-field-application-v1',
      requestId: fieldEventId,
      expectedSubmissionUpdatedAt: '2026-07-20T10:00:00.000Z',
      expectedRelationshipDecisionId: sourceEventId,
      expectedEntityUpdatedAt: null,
      expectedLocationUpdatedAt: null,
      entityDecision: null,
      locationDecision: null,
      paymentDecision: {
        acceptedIndexes: proposals.map((_, index) => index),
        rejectedIndexes: [],
      },
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
        acceptedIndexes: proposals.map((_, index) => index),
        rejectedIndexes: [],
        acceptedProposals: proposals,
      },
      hasAcceptedChanges: true,
      generatedAt: '2026-07-20T10:05:00.000Z',
    },
    appliedAt: '2026-07-20T10:05:00.000Z',
  });
}

function claim(claimId: string, rows: BusinessClaimPaymentPreviewState['claims'][number]['rows'] = []) {
  return {
    claimId,
    entityId,
    locationId: null,
    claimStatus: 'confirmed',
    routeType: 'direct_wallet',
    processorId: null,
    updatedAt: '2026-07-20T09:00:00.000Z',
    deletedAt: null,
    rows,
  };
}

function state(
  claims: BusinessClaimPaymentPreviewState['claims'] = [claim(firstClaimId)],
  proposals = [proposal()],
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
      registeredAt: '2026-07-20T10:06:00.000Z',
      updatedAt: '2026-07-20T10:06:00.000Z',
      events: [
        {
          eventId: 'b0000000-0000-4000-8000-000000000001',
          action: 'registered',
          fromApplicationStatus: null,
          toApplicationStatus: 'pending',
          fromPublicationStatus: null,
          toPublicationStatus: 'blocked',
          createdAt: '2026-07-20T10:06:00.000Z',
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
      internalNote: fieldNote(proposals),
    },
    target: { targetType: 'entity', targetId: entityId, entityId, locationId: null },
    claims,
  };
}

function backend(initial: BusinessClaimPaymentPreviewState): BusinessClaimPaymentPlanBackend & {
  commits: BusinessClaimPaymentPlanCommitCommand[];
} {
  let planEvent: BusinessClaimPaymentPlanEventRecord | null = null;
  const commits: BusinessClaimPaymentPlanCommitCommand[] = [];
  return {
    commits,
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
    async readPlanEvent(id) {
      return planEvent?.eventId === id ? structuredClone(planEvent) : null;
    },
    async readCurrentPlanEvent() {
      return planEvent === null ? null : structuredClone(planEvent);
    },
    async readTargetPlanningContext() {
      return {
        targetType: 'entity',
        targetId: entityId,
        entityId,
        entityType: 'merchant',
        entityUpdatedAt: '2026-07-20T08:00:00.000Z',
        locationId: null,
        locationUpdatedAt: null,
      };
    },
    async commitPlan(command) {
      commits.push(structuredClone(command));
      const payload = parseBusinessClaimPaymentPlanEventPayload(command.internalNote);
      if (payload === null) throw new Error('invalid plan payload');
      planEvent = {
        eventId: payload.planId,
        submissionId: payload.submissionId,
        fromStatus: null,
        toStatus: 'resolved',
        action: 'business_claim_payment_plan_prepared',
        reasonCode: 'payment_information',
        actorId: command.actorId,
        actorType: 'reviewer',
        internalNote: command.internalNote,
        createdAt: command.plannedAt.toISOString(),
      };
    },
  };
}

async function requestFor(
  testBackend: BusinessClaimPaymentPlanBackend,
  selections: { submittedIndex: number; selectedClaimId: string }[] = [],
) {
  const preview = await readBusinessClaimPaymentPreview(
    {
      actorId: 'system:test-preview',
      actorType: 'system',
      capabilities: ['submission:business-claim-payment-preview:read'],
    },
    testBackend,
    applicationId,
    plannedAt,
  );
  return {
    schemaVersion: 'business-claim-payment-plan-v1',
    requestId: planId,
    expectedApplicationUpdatedAt: preview.application.expectedApplicationUpdatedAt,
    expectedSourceDecisionEventId: sourceEventId,
    expectedFieldApplicationEventId: fieldEventId,
    expectedDraftSetHash: preview.draftSetHash,
    selections,
  };
}

describe('P5-07E3 Business Claim payment plan', () => {
  it('stores one exact existing-Claim insertion plan and replays it', async () => {
    const testBackend = backend(state());
    const request = await requestFor(testBackend);
    const committed = await prepareBusinessClaimPaymentPlan(
      context,
      testBackend,
      applicationId,
      request,
      plannedAt,
    );
    expect(committed).toMatchObject({
      state: 'committed',
      planId,
      itemCount: 1,
      plannedClaimCount: 0,
      insertCount: 1,
      alreadyPresentCount: 0,
    });
    expect(testBackend.commits).toHaveLength(1);
    const payload = parseBusinessClaimPaymentPlanEventPayload(
      testBackend.commits[0]?.internalNote ?? null,
    );
    expect(payload?.items[0]).toMatchObject({
      submittedIndex: 0,
      operation: 'insert_claim_asset',
      targetKind: 'existing_claim',
      targetClaimId: firstClaimId,
      isPrimary: true,
    });
    expect(payload?.items[0]?.plannedClaimAssetRowId).toMatch(
      /^[a-f0-9-]{36}$/,
    );
    expect(payload?.existingClaims[0]).toMatchObject({ claimId: firstClaimId, rowCount: 0 });

    const replayed = await prepareBusinessClaimPaymentPlan(
      context,
      testBackend,
      applicationId,
      request,
      plannedAt,
    );
    expect(replayed.state).toBe('replayed');
    expect(testBackend.commits).toHaveLength(1);
  });

  it('requires an exact reviewer selection and records an already-present row', async () => {
    const duplicateRow = {
      rowId: existingRowId,
      claimId: secondClaimId,
      assetId,
      networkId,
      paymentMethodId: methodId,
      contractAddress: null,
      isPrimary: true,
    };
    const initial = state([claim(firstClaimId), claim(secondClaimId, [duplicateRow])]);
    const testBackend = backend(initial);
    const missing = await requestFor(testBackend);
    await expect(
      prepareBusinessClaimPaymentPlan(context, testBackend, applicationId, missing, plannedAt),
    ).rejects.toMatchObject({ code: 'selection_required' });

    const selected = await requestFor(testBackend, [
      { submittedIndex: 0, selectedClaimId: secondClaimId },
    ]);
    const receipt = await prepareBusinessClaimPaymentPlan(
      context,
      testBackend,
      applicationId,
      selected,
      plannedAt,
    );
    expect(receipt).toMatchObject({ alreadyPresentCount: 1, insertCount: 0 });
    const payload = parseBusinessClaimPaymentPlanEventPayload(
      testBackend.commits[0]?.internalNote ?? null,
    );
    expect(payload?.items[0]).toMatchObject({
      operation: 'already_present',
      targetClaimId: secondClaimId,
      existingClaimAssetRowId: existingRowId,
      plannedClaimAssetRowId: null,
      isPrimary: true,
    });
  });

  it('groups compatible no-Claim drafts into one deterministic hidden candidate Claim', async () => {
    const proposals = [proposal(true), { ...proposal(false), contractAddress: 'bc1-example' }];
    const testBackend = backend(state([], proposals));
    const request = await requestFor(testBackend);
    const receipt = await prepareBusinessClaimPaymentPlan(
      context,
      testBackend,
      applicationId,
      request,
      plannedAt,
    );
    expect(receipt).toMatchObject({ plannedClaimCount: 1, insertCount: 2 });
    const payload = parseBusinessClaimPaymentPlanEventPayload(
      testBackend.commits[0]?.internalNote ?? null,
    );
    expect(payload?.plannedClaims).toHaveLength(1);
    expect(new Set(payload?.items.map((item) => item.targetClaimId)).size).toBe(1);
    expect(payload?.plannedClaims[0]).toMatchObject({
      claimScope: 'brand_global',
      claimStatus: 'candidate',
      visibility: 'hidden',
      customerPaysCrypto: true,
      merchantExplicitlyAcceptsCrypto: true,
    });
  });
});
