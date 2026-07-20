import { describe, expect, it } from 'vitest';
import type {
  SubmissionApplicationLifecycleRecord,
  SubmissionApplicationTransitionCommand,
  SubmissionApplicationTransitionReplayRecord,
} from '../src/admin/submissions/application-lifecycle';
import {
  applyBusinessClaimPaymentApplication,
  type BusinessClaimPaymentApplicationBackend,
  type BusinessClaimPaymentApplicationCommitCommand,
  type BusinessClaimPaymentApplicationEventRecord,
  type BusinessClaimPaymentApplicationState,
} from '../src/admin/submissions/business-claim-payment-application';
import { businessClaimPaymentApplicationEventPayloadSchema } from '../src/submissions/business-claim-payment-application-contract';
import {
  serializeBusinessClaimPaymentPlanEventPayload,
  type BusinessClaimPaymentPlanEventPayload,
} from '../src/submissions/business-claim-payment-plan-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const fieldEventId = '40000000-0000-4000-8000-000000000001';
const entityId = '50000000-0000-4000-8000-000000000001';
const existingClaimId = '60000000-0000-4000-8000-000000000001';
const existingRowId = '61000000-0000-4000-8000-000000000001';
const plannedClaimId = '62000000-0000-4000-8000-000000000001';
const plannedRowId = '63000000-0000-4000-8000-000000000001';
const secondPlannedRowId = '63000000-0000-4000-8000-000000000002';
const assetId = '70000000-0000-4000-8000-000000000001';
const secondAssetId = '70000000-0000-4000-8000-000000000002';
const networkId = '80000000-0000-4000-8000-000000000001';
const methodId = '90000000-0000-4000-8000-000000000001';
const sourceId = 'a0000000-0000-4000-8000-000000000001';
const planId = 'b0000000-0000-4000-8000-000000000001';
const requestId = 'c0000000-0000-4000-8000-000000000001';
const registeredAt = '2026-07-20T10:00:00.000Z';
const plannedAt = '2026-07-20T11:00:00.000Z';
const appliedAt = new Date('2026-07-20T12:00:00.000Z');

const context = {
  actorId: 'reviewer:business-claim-payment-apply',
  actorType: 'human' as const,
  capabilities: ['submission:business-claim-payments:apply'] as [
    'submission:business-claim-payments:apply',
  ],
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonicalize(value))),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function application(): SubmissionApplicationLifecycleRecord {
  return {
    applicationId,
    submissionId,
    submissionType: 'claim',
    sourceDecisionKind: 'business_claim_relationship',
    sourceDecisionEventId,
    applicationKind: 'business_claim_update',
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    applicationReceipt: null,
    publicationReceipt: null,
    registeredAt,
    updatedAt: registeredAt,
    events: [],
  };
}

function proposal(assetSlug = 'bitcoin', isPrimary = true, contractAddress: string | null = null) {
  return {
    assetSlug,
    networkSlug: 'bitcoin',
    routeType: 'direct_wallet' as const,
    paymentMethod: 'onchain' as const,
    processor: null,
    contractAddress,
    howToPay: 'Pay at checkout.',
    restrictions: null,
    isPrimary,
  };
}

function existingClaim(updatedAt = '2026-07-20T09:00:00.000Z') {
  return {
    claimId: existingClaimId,
    entityId,
    locationId: null,
    claimScope: 'brand_global',
    routeType: 'direct_wallet',
    processorId: null,
    customerPaysCrypto: true,
    merchantExplicitlyAcceptsCrypto: true,
    claimStatus: 'confirmed',
    visibility: 'public',
    howToPay: 'Existing instructions.',
    restrictions: null,
    createdAt: '2026-07-19T09:00:00.000Z',
    updatedAt,
    deletedAt: null,
  };
}

function row(
  rowId = existingRowId,
  claimId = existingClaimId,
  selectedAssetId = assetId,
  isPrimary = true,
  createdAt = '2026-07-19T09:00:00.000Z',
) {
  return {
    rowId,
    claimId,
    assetId: selectedAssetId,
    networkId,
    paymentMethodId: methodId,
    contractAddress: null,
    isPrimary,
    notes: null,
    createdAt,
    updatedAt: createdAt,
  };
}

async function existingPlan(operation: 'insert_claim_asset' | 'already_present') {
  const rows = operation === 'already_present' ? [row()] : [];
  const guardRows = rows.map((item) => ({
    rowId: item.rowId,
    assetId: item.assetId,
    networkId: item.networkId,
    paymentMethodId: item.paymentMethodId,
    contractAddress: item.contractAddress,
    isPrimary: item.isPrimary,
  }));
  return {
    schemaVersion: 'business-claim-payment-plan-event-v1' as const,
    planId,
    requestFingerprint: 'a'.repeat(64),
    applicationId,
    expectedApplicationUpdatedAt: registeredAt,
    submissionId,
    sourceDecisionEventId,
    fieldApplicationEventId: fieldEventId,
    target: {
      targetType: 'entity' as const,
      targetId: entityId,
      entityId,
      entityType: 'merchant' as const,
      expectedEntityUpdatedAt: '2026-07-20T08:00:00.000Z',
      locationId: null,
      expectedLocationUpdatedAt: null,
    },
    draftSetHash: 'b'.repeat(64),
    selections: [],
    plannedClaims: [],
    existingClaims: [
      {
        claimId: existingClaimId,
        expectedClaimUpdatedAt: '2026-07-20T09:00:00.000Z',
        claimAssetSetHash: await sha256(guardRows),
        rowCount: guardRows.length,
      },
    ],
    items: [
      {
        submittedIndex: 0,
        proposal: proposal(),
        operation,
        targetKind: 'existing_claim' as const,
        targetClaimId: existingClaimId,
        expectedTargetClaimUpdatedAt: '2026-07-20T09:00:00.000Z',
        asset: { id: assetId, slug: 'bitcoin', symbol: 'BTC', status: 'active' as const },
        network: { id: networkId, slug: 'bitcoin', status: 'active' as const },
        paymentMethod: { id: methodId, slug: 'onchain' as const, status: 'active' as const },
        processor: null,
        existingClaimAssetRowId: operation === 'already_present' ? existingRowId : null,
        plannedClaimAssetRowId: operation === 'insert_claim_asset' ? plannedRowId : null,
        isPrimary: true,
      },
    ],
    plannedAt,
  } satisfies BusinessClaimPaymentPlanEventPayload;
}

function candidatePlan(twoPrimary = false): BusinessClaimPaymentPlanEventPayload {
  return {
    schemaVersion: 'business-claim-payment-plan-event-v1',
    planId,
    requestFingerprint: 'a'.repeat(64),
    applicationId,
    expectedApplicationUpdatedAt: registeredAt,
    submissionId,
    sourceDecisionEventId,
    fieldApplicationEventId: fieldEventId,
    target: {
      targetType: 'entity',
      targetId: entityId,
      entityId,
      entityType: 'merchant',
      expectedEntityUpdatedAt: '2026-07-20T08:00:00.000Z',
      locationId: null,
      expectedLocationUpdatedAt: null,
    },
    draftSetHash: 'b'.repeat(64),
    selections: [],
    plannedClaims: [
      {
        claimId: plannedClaimId,
        entityId,
        locationId: null,
        claimScope: 'brand_global',
        routeType: 'direct_wallet',
        processorId: null,
        customerPaysCrypto: true,
        merchantExplicitlyAcceptsCrypto: true,
        claimStatus: 'candidate',
        visibility: 'hidden',
        howToPay: 'Pay at checkout.',
        restrictions: null,
      },
    ],
    existingClaims: [],
    items: [
      {
        submittedIndex: 0,
        proposal: proposal('bitcoin', true),
        operation: 'insert_claim_asset',
        targetKind: 'new_candidate_claim',
        targetClaimId: plannedClaimId,
        expectedTargetClaimUpdatedAt: null,
        asset: { id: assetId, slug: 'bitcoin', symbol: 'BTC', status: 'active' },
        network: { id: networkId, slug: 'bitcoin', status: 'active' },
        paymentMethod: { id: methodId, slug: 'onchain', status: 'active' },
        processor: null,
        existingClaimAssetRowId: null,
        plannedClaimAssetRowId: plannedRowId,
        isPrimary: true,
      },
      {
        submittedIndex: 1,
        proposal: proposal('litecoin', twoPrimary, 'ltc-example'),
        operation: 'insert_claim_asset',
        targetKind: 'new_candidate_claim',
        targetClaimId: plannedClaimId,
        expectedTargetClaimUpdatedAt: null,
        asset: { id: secondAssetId, slug: 'litecoin', symbol: 'LTC', status: 'active' },
        network: { id: networkId, slug: 'bitcoin', status: 'active' },
        paymentMethod: { id: methodId, slug: 'onchain', status: 'active' },
        processor: null,
        existingClaimAssetRowId: null,
        plannedClaimAssetRowId: secondPlannedRowId,
        isPrimary: twoPrimary,
      },
    ],
    plannedAt,
  };
}

function baseState(
  payload: BusinessClaimPaymentPlanEventPayload,
  claims: BusinessClaimPaymentApplicationState['claims'],
  rows: BusinessClaimPaymentApplicationState['rows'],
): BusinessClaimPaymentApplicationState {
  const event = (id: string, action: string, createdAt: string): BusinessClaimPaymentApplicationEventRecord => ({
    eventId: id,
    submissionId,
    fromStatus: null,
    toStatus: 'resolved',
    action,
    reasonCode: action === 'business_claim_payment_plan_prepared' ? 'payment_information' : null,
    actorId: 'reviewer:fixture',
    actorType: 'reviewer',
    internalNote:
      action === 'business_claim_payment_plan_prepared'
        ? serializeBusinessClaimPaymentPlanEventPayload(payload)
        : null,
    createdAt,
  });
  return {
    application: application(),
    submission: {
      submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'claim',
      targetType: 'entity',
      targetId: entityId,
      workflowStatus: 'resolved',
      resolution: 'approved',
    },
    sourceDecisionEvent: event(sourceDecisionEventId, 'business_claim_relationship_approved', registeredAt),
    fieldApplicationEvent: event(fieldEventId, 'business_claim_fields_applied', registeredAt),
    planEvent: event(planId, 'business_claim_payment_plan_prepared', plannedAt),
    applicationEvent: null,
    target: {
      targetType: 'entity',
      targetId: entityId,
      entityId,
      entityType: 'merchant',
      entityUpdatedAt: '2026-07-20T08:00:00.000Z',
      locationId: null,
      locationUpdatedAt: null,
    },
    claims,
    rows,
    sourceRecord: null,
    verificationEvents: [],
    provenanceLinks: [],
  };
}

class Store implements BusinessClaimPaymentApplicationBackend {
  state: BusinessClaimPaymentApplicationState;
  private readonly transitions = new Map<string, SubmissionApplicationTransitionReplayRecord>();
  canonicalCommits = 0;
  failLifecycleOnce = false;

  constructor(initial: BusinessClaimPaymentApplicationState) {
    this.state = structuredClone(initial);
  }

  async readApplicationState(id: string) {
    return id === applicationId ? structuredClone(this.state) : null;
  }

  async readApplication(id: string) {
    return id === applicationId ? structuredClone(this.state.application) : null;
  }

  async readTransition(id: string) {
    return structuredClone(this.transitions.get(id) ?? null);
  }

  async commitTransition(command: SubmissionApplicationTransitionCommand) {
    if (this.failLifecycleOnce) {
      this.failLifecycleOnce = false;
      throw new Error('simulated lifecycle outage');
    }
    this.state.application.applicationStatus = command.toApplicationStatus;
    this.state.application.publicationStatus = command.toPublicationStatus;
    this.state.application.applicationReceipt = command.nextApplicationReceipt;
    this.state.application.publicationReceipt = command.nextPublicationReceipt;
    this.state.application.updatedAt = command.changedAt.toISOString();
    this.transitions.set(command.transitionEventId, {
      transitionEventId: command.transitionEventId,
      applicationId: command.applicationId,
      action: command.action,
      fromApplicationStatus: command.fromApplicationStatus,
      toApplicationStatus: command.toApplicationStatus,
      fromPublicationStatus: command.fromPublicationStatus,
      toPublicationStatus: command.toPublicationStatus,
      actorId: command.actorId,
      requestFingerprint: command.requestFingerprint,
      changedAt: command.changedAt.toISOString(),
    });
  }

  async commitPaymentApplication(command: BusinessClaimPaymentApplicationCommitCommand) {
    this.canonicalCommits += 1;
    const applied = command.appliedAt.toISOString();
    for (const planned of command.plannedClaims) {
      this.state.claims.push({
        claimId: planned.claimId,
        entityId: planned.entityId,
        locationId: planned.locationId,
        claimScope: planned.claimScope,
        routeType: planned.routeType,
        processorId: planned.processorId,
        customerPaysCrypto: planned.customerPaysCrypto,
        merchantExplicitlyAcceptsCrypto: planned.merchantExplicitlyAcceptsCrypto,
        claimStatus: planned.claimStatus,
        visibility: planned.visibility,
        howToPay: planned.howToPay,
        restrictions: planned.restrictions,
        createdAt: applied,
        updatedAt: applied,
        deletedAt: null,
      });
    }
    for (const expected of command.expectedExistingClaims) {
      const claim = this.state.claims.find((item) => item.claimId === expected.claimId);
      if (claim !== undefined) claim.updatedAt = applied;
    }
    for (const item of command.items.filter((candidate) => candidate.operation === 'insert_claim_asset')) {
      this.state.rows.push({
        rowId: item.plannedClaimAssetRowId as string,
        claimId: item.targetClaimId,
        assetId: item.asset.id,
        networkId: item.network.id,
        paymentMethodId: item.paymentMethod.id,
        contractAddress: item.proposal.contractAddress,
        isPrimary: item.isPrimary,
        notes: null,
        createdAt: applied,
        updatedAt: applied,
      });
    }
    this.state.sourceRecord = {
      id: command.sourceRecord.id,
      sourceId: command.sourceRecord.sourceId,
      externalId: command.sourceRecord.externalId,
      contentHash: command.sourceRecord.contentHash,
    };
    this.state.verificationEvents = command.verificationEvents.map((item) => ({
      eventId: item.eventId,
      claimId: item.claimId,
      eventType: 'corrected',
      reasonCode: 'business_claim_payment_information_applied',
      effectiveAt: applied,
      internalNote: item.internalNote,
    }));
    const created = new Set(command.plannedClaims.map((claim) => claim.claimId));
    this.state.provenanceLinks = [
      ...command.verificationEvents.map((item) => ({
        subjectType: 'acceptance_claim',
        subjectId: item.claimId,
        fieldPath: null,
        sourceRecordId: command.sourceRecord.id,
        provenanceRole: created.has(item.claimId) ? 'origin' : 'verification',
      })),
      ...command.items.map((item) => ({
        subjectType: 'claim_asset',
        subjectId:
          item.operation === 'insert_claim_asset'
            ? (item.plannedClaimAssetRowId as string)
            : (item.existingClaimAssetRowId as string),
        fieldPath: null,
        sourceRecordId: command.sourceRecord.id,
        provenanceRole: item.operation === 'insert_claim_asset' ? 'origin' : 'verification',
      })),
      ...command.verificationEvents.map((item) => ({
        subjectType: 'verification_event',
        subjectId: item.eventId,
        fieldPath: null,
        sourceRecordId: command.sourceRecord.id,
        provenanceRole: 'verification',
      })),
    ];
    const eventPayload = businessClaimPaymentApplicationEventPayloadSchema.parse({
      schemaVersion: 'business-claim-payment-application-event-v1',
      requestFingerprint: command.requestFingerprint,
      applicationId: command.applicationId,
      planId: command.planId,
      sourceDecisionEventId: command.sourceDecisionEventId,
      fieldApplicationEventId: command.fieldApplicationEventId,
      sourceRecordId: command.sourceRecord.id,
      target: {
        targetType: command.target.targetType,
        targetId: command.target.targetId,
        entityId: command.target.entityId,
        locationId: command.target.locationId,
      },
      draftSetHash: command.draftSetHash,
      createdClaimIds: command.plannedClaims.map((claim) => claim.claimId).sort(),
      insertedClaimAssetRowIds: command.items
        .filter((item) => item.operation === 'insert_claim_asset')
        .map((item) => item.plannedClaimAssetRowId as string)
        .sort(),
      alreadyPresentClaimAssetRowIds: command.items
        .filter((item) => item.operation === 'already_present')
        .map((item) => item.existingClaimAssetRowId as string)
        .sort(),
      verificationEvents: command.verificationEvents
        .map((item) => ({ claimId: item.claimId, verificationEventId: item.eventId }))
        .sort((left, right) => left.claimId.localeCompare(right.claimId)),
      expectedApplicationUpdatedAt: command.expectedApplicationUpdatedAt.toISOString(),
      expectedPlanCreatedAt: command.planCreatedAt.toISOString(),
      appliedAt: applied,
    });
    this.state.applicationEvent = {
      eventId: command.requestId,
      submissionId,
      fromStatus: null,
      toStatus: 'resolved',
      action: 'business_claim_payments_applied',
      reasonCode: 'business_claim_payment_information_applied',
      actorId: command.actorId,
      actorType: 'reviewer',
      internalNote: JSON.stringify(eventPayload),
      createdAt: applied,
    };
    return {
      state: 'committed' as const,
      applicationEventId: command.requestId,
      planId: command.planId,
      sourceRecordId: command.sourceRecord.id,
      createdClaimIds: eventPayload.createdClaimIds,
      insertedClaimAssetRowIds: eventPayload.insertedClaimAssetRowIds,
      alreadyPresentClaimAssetRowIds: eventPayload.alreadyPresentClaimAssetRowIds,
      verificationEventIds: eventPayload.verificationEvents.map((item) => item.verificationEventId),
      appliedAt: applied,
    };
  }
}

function request() {
  return {
    schemaVersion: 'business-claim-payment-application-v1',
    requestId,
    planId,
    expectedApplicationUpdatedAt: registeredAt,
    expectedSourceDecisionEventId: sourceDecisionEventId,
    expectedFieldApplicationEventId: fieldEventId,
    expectedPlanCreatedAt: plannedAt,
    expectedDraftSetHash: 'b'.repeat(64),
  };
}

describe('P5-07E4 Business Claim payment application', () => {
  it('atomically inserts a planned row on an existing Claim and commits lifecycle', async () => {
    const payload = await existingPlan('insert_claim_asset');
    const store = new Store(baseState(payload, [existingClaim()], []));
    const receipt = await applyBusinessClaimPaymentApplication(
      context,
      store,
      applicationId,
      sourceId,
      request(),
      appliedAt,
    );
    expect(receipt).toMatchObject({
      state: 'committed',
      planId,
      insertedClaimAssetRowIds: [plannedRowId],
      alreadyPresentClaimAssetRowIds: [],
      applicationStatus: 'committed',
      publicationStatus: 'pending',
    });
    expect(store.canonicalCommits).toBe(1);
    expect(store.state.rows).toContainEqual(
      expect.objectContaining({ rowId: plannedRowId, claimId: existingClaimId }),
    );
    expect(store.state.verificationEvents).toHaveLength(1);
    expect(store.state.provenanceLinks).toHaveLength(3);
  });

  it('creates one hidden candidate Claim with two exact payment rows', async () => {
    const payload = candidatePlan();
    const store = new Store(baseState(payload, [], []));
    const receipt = await applyBusinessClaimPaymentApplication(
      context,
      store,
      applicationId,
      sourceId,
      request(),
      appliedAt,
    );
    expect(receipt.createdClaimIds).toEqual([plannedClaimId]);
    expect(receipt.insertedClaimAssetRowIds).toEqual([plannedRowId, secondPlannedRowId]);
    expect(store.state.claims).toContainEqual(
      expect.objectContaining({
        claimId: plannedClaimId,
        claimStatus: 'candidate',
        visibility: 'hidden',
      }),
    );
    expect(store.state.rows.filter((item) => item.claimId === plannedClaimId)).toHaveLength(2);
  });

  it('preserves an already-present row while adding verification provenance', async () => {
    const payload = await existingPlan('already_present');
    const store = new Store(baseState(payload, [existingClaim()], [row()]));
    const receipt = await applyBusinessClaimPaymentApplication(
      context,
      store,
      applicationId,
      sourceId,
      request(),
      appliedAt,
    );
    expect(receipt).toMatchObject({
      insertedClaimAssetRowIds: [],
      alreadyPresentClaimAssetRowIds: [existingRowId],
    });
    expect(store.state.rows).toHaveLength(1);
    expect(store.state.provenanceLinks).toContainEqual(
      expect.objectContaining({
        subjectType: 'claim_asset',
        subjectId: existingRowId,
        provenanceRole: 'verification',
      }),
    );
  });

  it('recovers lifecycle after canonical commit without a second canonical write', async () => {
    const payload = await existingPlan('insert_claim_asset');
    const store = new Store(baseState(payload, [existingClaim()], []));
    store.failLifecycleOnce = true;
    await expect(
      applyBusinessClaimPaymentApplication(
        context,
        store,
        applicationId,
        sourceId,
        request(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'backend_failure' });
    expect(store.canonicalCommits).toBe(1);

    const recovered = await applyBusinessClaimPaymentApplication(
      context,
      store,
      applicationId,
      sourceId,
      request(),
      appliedAt,
    );
    expect(recovered.state).toBe('committed');
    expect(store.canonicalCommits).toBe(1);
    expect(store.state.application.applicationStatus).toBe('committed');
  });

  it('fails closed when a planned candidate Claim has multiple primary rows', async () => {
    const payload = candidatePlan(true);
    const store = new Store(baseState(payload, [], []));
    await expect(
      applyBusinessClaimPaymentApplication(
        context,
        store,
        applicationId,
        sourceId,
        request(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
    expect(store.canonicalCommits).toBe(0);
  });
});
