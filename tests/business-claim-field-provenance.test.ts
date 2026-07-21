import { describe, expect, it } from 'vitest';
import {
  completeBusinessClaimFieldProvenance,
  type BusinessClaimFieldProvenanceBackend,
  type BusinessClaimFieldProvenanceContext,
  type BusinessClaimFieldProvenanceCommitCommand,
  type BusinessClaimFieldProvenanceState,
} from '../src/admin/submissions/business-claim-field-provenance';
import { serializeBusinessClaimFieldApplicationEventPayload } from '../src/submissions/business-claim-field-application-persistence-contract';
import {
  businessClaimFieldProvenanceEventPayloadSchema,
  serializeBusinessClaimFieldProvenanceEventPayload,
} from '../src/submissions/business-claim-field-provenance-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const fieldEventId = '10000000-0000-4000-8000-000000000002';
const relationshipId = '10000000-0000-4000-8000-000000000003';
const requestId = '10000000-0000-4000-8000-000000000004';
const secondRequestId = '10000000-0000-4000-8000-000000000005';
const entityId = '10000000-0000-4000-8000-000000000006';
const locationId = '10000000-0000-4000-8000-000000000007';
const sourceId = '10000000-0000-4000-8000-000000000008';
const priorSourceId = '10000000-0000-4000-8000-000000000009';
const fieldAppliedAt = '2026-07-14T10:00:00.000Z';
const targetUpdatedAt = '2026-07-20T08:00:00.000Z';
const completedAt = new Date('2026-07-21T01:00:00.000Z');

const context: BusinessClaimFieldProvenanceContext = {
  actorId: 'reviewer-e5',
  actorType: 'human',
  capabilities: ['submission:business-claim-field-provenance:complete'],
};

function entityValue(websiteUrl: string | null = 'https://merchant.example/new') {
  return {
    entityType: 'merchant' as const,
    name: 'Merchant',
    slug: 'merchant',
    legalName: 'Merchant Ltd',
    websiteUrl,
    countryCode: 'JP',
    entityStatus: 'active' as const,
    visibility: 'public' as const,
  };
}

function locationValue(description: string | null, amenities: string[]) {
  return {
    name: 'Merchant Tokyo',
    slug: 'merchant-tokyo',
    addressLine: '1-1 Tokyo',
    locality: 'Tokyo',
    region: 'Tokyo',
    postalCode: '100-0001',
    countryCode: 'JP',
    latitude: 35.68,
    longitude: 139.76,
    locationStatus: 'active' as const,
    visibility: 'public' as const,
    websiteUrl: 'https://merchant.example',
    phone: null,
    description,
    openingHours: null,
    amenities,
    socialLinks: [],
    osmType: null,
    osmId: null,
  };
}

function entityFieldEvent() {
  const before = entityValue('https://merchant.example/old');
  const after = entityValue();
  return {
    eventId: fieldEventId,
    submissionId,
    fromStatus: null,
    toStatus: 'resolved',
    action: 'business_claim_fields_applied',
    reasonCode: 'field_decisions_committed',
    actorId: 'reviewer-h2',
    actorType: 'reviewer',
    internalNote: serializeBusinessClaimFieldApplicationEventPayload({
      schemaVersion: 'business-claim-field-application-event-v1',
      request: {
        schemaVersion: 'business-claim-field-application-v1',
        requestId: fieldEventId,
        expectedSubmissionUpdatedAt: '2026-07-14T09:00:00.000Z',
        expectedRelationshipDecisionId: relationshipId,
        expectedEntityUpdatedAt: '2026-07-14T08:00:00.000Z',
        expectedLocationUpdatedAt: null,
        entityDecision: { acceptedFields: ['websiteUrl'], rejectedFields: [] },
        locationDecision: null,
        paymentDecision: null,
      },
      projection: {
        schemaVersion: 'business-claim-field-application-projection-v1',
        requestId: fieldEventId,
        requestFingerprint: `sha256:${'a'.repeat(64)}`,
        submissionId,
        relationshipDecisionId: relationshipId,
        targetType: 'entity',
        targetId: entityId,
        entityApplication: {
          expectedUpdatedAt: '2026-07-14T08:00:00.000Z',
          acceptedFields: ['websiteUrl'],
          rejectedFields: [],
          before,
          after,
        },
        locationApplication: null,
        paymentApplication: null,
        hasAcceptedChanges: true,
        generatedAt: fieldAppliedAt,
      },
      appliedAt: fieldAppliedAt,
    }),
    createdAt: fieldAppliedAt,
  };
}

function locationFieldEvent() {
  const before = locationValue('Old description', ['wifi']);
  const after = locationValue(null, []);
  return {
    eventId: fieldEventId,
    submissionId,
    fromStatus: null,
    toStatus: 'resolved',
    action: 'business_claim_fields_applied',
    reasonCode: 'field_decisions_committed',
    actorId: 'reviewer-h2',
    actorType: 'reviewer',
    internalNote: serializeBusinessClaimFieldApplicationEventPayload({
      schemaVersion: 'business-claim-field-application-event-v1',
      request: {
        schemaVersion: 'business-claim-field-application-v1',
        requestId: fieldEventId,
        expectedSubmissionUpdatedAt: '2026-07-14T09:00:00.000Z',
        expectedRelationshipDecisionId: relationshipId,
        expectedEntityUpdatedAt: null,
        expectedLocationUpdatedAt: '2026-07-14T08:00:00.000Z',
        entityDecision: null,
        locationDecision: {
          acceptedFields: ['description', 'amenities'],
          rejectedFields: [],
        },
        paymentDecision: null,
      },
      projection: {
        schemaVersion: 'business-claim-field-application-projection-v1',
        requestId: fieldEventId,
        requestFingerprint: `sha256:${'b'.repeat(64)}`,
        submissionId,
        relationshipDecisionId: relationshipId,
        targetType: 'location',
        targetId: locationId,
        entityApplication: null,
        locationApplication: {
          expectedUpdatedAt: '2026-07-14T08:00:00.000Z',
          acceptedFields: ['description', 'amenities'],
          rejectedFields: [],
          before,
          after,
        },
        paymentApplication: null,
        hasAcceptedChanges: true,
        generatedAt: fieldAppliedAt,
      },
      appliedAt: fieldAppliedAt,
    }),
    createdAt: fieldAppliedAt,
  };
}

function baseState(
  targetType: 'entity' | 'location' = 'entity',
): BusinessClaimFieldProvenanceState {
  const targetId = targetType === 'entity' ? entityId : locationId;
  return {
    submission: {
      submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'claim',
      targetType,
      targetId,
      workflowStatus: 'resolved',
      resolution: 'approved',
    },
    fieldApplicationEvent: targetType === 'entity' ? entityFieldEvent() : locationFieldEvent(),
    requestEvent: null,
    completionEvent: null,
    target: {
      targetType,
      targetId,
      updatedAt: targetUpdatedAt,
      deletedAt: null,
      value: targetType === 'entity' ? entityValue() : locationValue(null, []),
    },
    sourceRecord: null,
    provenanceLinks: [],
  };
}

class Store implements BusinessClaimFieldProvenanceBackend {
  canonicalCommits = 0;

  constructor(readonly state: BusinessClaimFieldProvenanceState) {}

  async readState() {
    return this.state;
  }

  async commitFieldProvenance(command: BusinessClaimFieldProvenanceCommitCommand) {
    this.canonicalCommits += 1;
    for (const link of command.expectedOpenProvenance) {
      const stored = this.state.provenanceLinks.find((item) => item.linkId === link.linkId);
      if (stored !== undefined) stored.effectiveTo = command.fieldAppliedAt.toISOString();
    }
    this.state.sourceRecord = {
      sourceRecordId: command.sourceRecord.id,
      sourceId: command.sourceRecord.sourceId,
      externalId: command.sourceRecord.externalId,
      contentHash: command.sourceRecord.contentHash,
    };
    command.fieldPaths.forEach((fieldPath, index) => {
      this.state.provenanceLinks.push({
        linkId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        subjectType: command.targetType,
        subjectId: command.targetId,
        fieldPath,
        sourceRecordId: command.sourceRecord.id,
        provenanceRole: 'correction',
        effectiveFrom: command.fieldAppliedAt.toISOString(),
        effectiveTo: null,
      });
    });
    const payload = businessClaimFieldProvenanceEventPayloadSchema.parse({
      schemaVersion: 'business-claim-field-provenance-event-v1',
      requestFingerprint: command.requestFingerprint,
      submissionId: command.submissionId,
      fieldApplicationEventId: command.fieldApplicationEventId,
      relationshipDecisionId: command.relationshipDecisionId,
      sourceRecordId: command.sourceRecord.id,
      target: { targetType: command.targetType, targetId: command.targetId },
      fieldPaths: command.fieldPaths,
      expectedTargetUpdatedAt: command.expectedTargetUpdatedAt.toISOString(),
      fieldAppliedAt: command.fieldAppliedAt.toISOString(),
      completedAt: command.completedAt.toISOString(),
    });
    const event = {
      eventId: command.requestId,
      submissionId: command.submissionId,
      fromStatus: null,
      toStatus: 'resolved',
      action: 'business_claim_field_provenance_completed',
      reasonCode: 'field_provenance_completed',
      actorId: command.actorId,
      actorType: 'reviewer',
      internalNote: serializeBusinessClaimFieldProvenanceEventPayload(payload),
      createdAt: command.completedAt.toISOString(),
    };
    this.state.requestEvent = event;
    this.state.completionEvent = event;
    return {
      state: 'committed' as const,
      completionEventId: command.requestId,
      sourceRecordId: command.sourceRecord.id,
      completedAt: command.completedAt.toISOString(),
    };
  }
}

function request(id = requestId) {
  return {
    schemaVersion: 'business-claim-field-provenance-v1',
    requestId: id,
    expectedFieldApplicationEventId: fieldEventId,
    expectedTargetUpdatedAt: targetUpdatedAt,
  };
}

describe('P5-07E5 Business Claim field provenance completion', () => {
  it('creates an exact private Source Record and field-level correction provenance', async () => {
    const state = baseState();
    state.provenanceLinks.push({
      linkId: '30000000-0000-4000-8000-000000000001',
      subjectType: 'entity',
      subjectId: entityId,
      fieldPath: 'websiteUrl',
      sourceRecordId: priorSourceId,
      provenanceRole: 'origin',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null,
    });
    const store = new Store(state);
    const receipt = await completeBusinessClaimFieldProvenance(
      context,
      store,
      submissionId,
      sourceId,
      request(),
      completedAt,
    );
    expect(receipt).toMatchObject({
      state: 'committed',
      requestId,
      fieldApplicationEventId: fieldEventId,
      targetType: 'entity',
      targetId: entityId,
      fieldPaths: ['websiteUrl'],
    });
    expect(store.state.sourceRecord).toMatchObject({ sourceId });
    expect(store.state.provenanceLinks).toContainEqual(
      expect.objectContaining({
        fieldPath: 'websiteUrl',
        provenanceRole: 'correction',
        effectiveFrom: fieldAppliedAt,
        effectiveTo: null,
      }),
    );
    expect(store.state.provenanceLinks[0]?.effectiveTo).toBe(fieldAppliedAt);
  });

  it('records provenance for accepted clear-to-null and clear-to-empty Location fields', async () => {
    const store = new Store(baseState('location'));
    const receipt = await completeBusinessClaimFieldProvenance(
      context,
      store,
      submissionId,
      sourceId,
      request(),
      completedAt,
    );
    expect(receipt.fieldPaths).toEqual(['amenities', 'description']);
    expect(
      store.state.provenanceLinks.filter((link) => link.provenanceRole === 'correction'),
    ).toHaveLength(2);
  });

  it('rejects completion after an accepted canonical field changes', async () => {
    const state = baseState();
    state.target = {
      ...(state.target as NonNullable<typeof state.target>),
      value: entityValue(null),
    };
    const store = new Store(state);
    await expect(
      completeBusinessClaimFieldProvenance(
        context,
        store,
        submissionId,
        sourceId,
        request(),
        completedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(store.canonicalCommits).toBe(0);
  });

  it('replays the exact request and rejects a second completion UUID', async () => {
    const store = new Store(baseState());
    await completeBusinessClaimFieldProvenance(
      context,
      store,
      submissionId,
      sourceId,
      request(),
      completedAt,
    );
    const replayed = await completeBusinessClaimFieldProvenance(
      context,
      store,
      submissionId,
      sourceId,
      request(),
      completedAt,
    );
    expect(replayed.state).toBe('replayed');
    expect(store.canonicalCommits).toBe(1);
    store.state.requestEvent = null;
    await expect(
      completeBusinessClaimFieldProvenance(
        context,
        store,
        submissionId,
        sourceId,
        request(secondRequestId),
        completedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('fails closed when another active correction provenance owner exists', async () => {
    const state = baseState();
    state.provenanceLinks.push({
      linkId: '30000000-0000-4000-8000-000000000002',
      subjectType: 'entity',
      subjectId: entityId,
      fieldPath: 'websiteUrl',
      sourceRecordId: priorSourceId,
      provenanceRole: 'correction',
      effectiveFrom: fieldAppliedAt,
      effectiveTo: null,
    });
    const store = new Store(state);
    await expect(
      completeBusinessClaimFieldProvenance(
        context,
        store,
        submissionId,
        sourceId,
        request(),
        completedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(store.canonicalCommits).toBe(0);
  });
});
