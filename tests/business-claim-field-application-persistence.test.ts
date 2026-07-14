import { describe, expect, it } from 'vitest';
import {
  applyBusinessClaimFieldApplication,
  type BusinessClaimFieldApplicationCommitCommand,
  type BusinessClaimFieldApplicationPersistenceBackend,
  type BusinessClaimFieldApplicationPersistenceEventRecord,
} from '../src/admin/submissions/business-claim-field-application-persistence';
import type { BusinessClaimFieldApplicationContext } from '../src/admin/submissions/business-claim-field-application-authorization';
import type { BusinessClaimFieldApplicationState } from '../src/admin/submissions/business-claim-field-application';
import { serializeBusinessClaimRelationshipDecisionEventPayload } from '../src/submissions/business-claim-relationship-decision-contract';
import { SubmissionPersistenceError } from '../src/submissions/persistence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000002';
const relationshipDecisionId = '30000000-0000-4000-8000-000000000001';
const preparationId = '40000000-0000-4000-8000-000000000001';
const executionId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const submissionUpdatedAt = '2026-07-14T08:00:00.000Z';
const entityUpdatedAt = '2026-07-14T07:00:00.000Z';
const locationUpdatedAt = '2026-07-14T07:10:00.000Z';
const appliedAt = new Date('2026-07-14T09:00:00.000Z');

const context: BusinessClaimFieldApplicationContext = {
  actorId: 'cloudflare-access:field-applicant',
  actorType: 'human',
  capabilities: ['submission:claim-fields:apply'],
};

function relationshipEvent(
  targetType: 'entity' | 'location',
  targetId: string,
): BusinessClaimFieldApplicationPersistenceEventRecord {
  return {
    eventId: relationshipDecisionId,
    submissionId,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    action: 'business_claim_relationship_approved',
    reasonCode: 'verified_authority_confirmed',
    actorId: 'cloudflare-access:relationship-decider',
    internalNote: serializeBusinessClaimRelationshipDecisionEventPayload({
      schemaVersion: 'business-claim-relationship-decision-event-v1',
      decisionId: relationshipDecisionId,
      expectedSubmissionUpdatedAt: '2026-07-14T07:30:00.000Z',
      decision: 'approve_relationship',
      reasonCode: 'verified_authority_confirmed',
      targetType,
      targetId,
      claimantRole: 'owner',
      approvedScope: 'representative_relationship',
      verificationMethod: 'dns_txt',
      preparationId,
      executionId,
      executionOutcome: 'passed',
      executionResultCode: 'challenge_confirmed',
      verificationObservedAt: '2026-07-14T07:20:00.000Z',
      preparationExpiresAt: '2026-07-17T07:00:00.000Z',
      relationship: {
        relationshipId: relationshipDecisionId,
        status: 'active',
        targetType,
        targetId,
        claimantRole: 'owner',
        approvedScope: 'representative_relationship',
        verificationMethod: 'dns_txt',
        preparationId,
        executionId,
        verifiedAt: '2026-07-14T07:20:00.000Z',
        createdAt: submissionUpdatedAt,
      },
    }),
    createdAt: submissionUpdatedAt,
  };
}

function payments() {
  return [
    {
      assetSlug: 'xrp',
      networkSlug: 'xrpl',
      routeType: 'direct_wallet' as const,
      paymentMethod: 'onchain' as const,
      processor: null,
      contractAddress: null,
      howToPay: 'Pay the displayed XRPL address.',
      restrictions: null,
      isPrimary: true,
    },
    {
      assetSlug: 'btc',
      networkSlug: 'bitcoin',
      routeType: 'direct_wallet' as const,
      paymentMethod: 'onchain' as const,
      processor: null,
      contractAddress: null,
      howToPay: 'Ask staff for the current address.',
      restrictions: null,
      isPrimary: false,
    },
  ];
}

function entityState(): BusinessClaimFieldApplicationState {
  return {
    submissionId,
    submissionType: 'claim',
    workflowStatus: 'resolved',
    resolution: 'approved',
    updatedAt: submissionUpdatedAt,
    targetType: 'entity',
    targetId: entityId,
    normalizedProjection: {
      targetType: 'entity',
      targetId: entityId,
      claimantRole: 'owner',
      requestedScopes: [
        'representative_relationship',
        'entity_profile',
        'payment_information',
      ],
      verification: {
        method: 'dns_txt',
        officialDomain: 'merchant.example',
        protectedContactPresent: false,
        officialWebsiteUrl: null,
        officialSocialUrl: null,
        assistedVerifierReferencePresent: false,
        privateProofPresent: false,
      },
      proposedChanges: {
        entity: {
          changedFields: ['name', 'legalName'],
          name: 'Updated Merchant',
          legalName: 'Updated Merchant LLC',
          websiteUrl: null,
          countryCode: null,
        },
        location: null,
        paymentProposals: payments(),
      },
      authorityStatement: 'I am authorized to represent this business.',
      evidenceLinks: [],
    },
    relationshipEvent: relationshipEvent('entity', entityId),
    entityTarget: {
      id: entityId,
      updatedAt: entityUpdatedAt,
      value: {
        entityType: 'merchant',
        name: 'Original Merchant',
        slug: 'original-merchant',
        legalName: null,
        websiteUrl: 'https://merchant.example',
        countryCode: 'JP',
        entityStatus: 'active',
        visibility: 'public',
      },
    },
    locationTarget: null,
  };
}

function locationState(): BusinessClaimFieldApplicationState {
  return {
    submissionId,
    submissionType: 'claim',
    workflowStatus: 'resolved',
    resolution: 'approved',
    updatedAt: submissionUpdatedAt,
    targetType: 'location',
    targetId: locationId,
    normalizedProjection: {
      targetType: 'location',
      targetId: locationId,
      claimantRole: 'owner',
      requestedScopes: ['representative_relationship', 'location_profile'],
      verification: {
        method: 'dns_txt',
        officialDomain: 'merchant.example',
        protectedContactPresent: false,
        officialWebsiteUrl: null,
        officialSocialUrl: null,
        assistedVerifierReferencePresent: false,
        privateProofPresent: false,
      },
      proposedChanges: {
        entity: null,
        location: {
          changedFields: ['addressLine', 'latitude', 'longitude'],
          name: null,
          addressLine: '2 New Street',
          locality: null,
          region: null,
          postalCode: null,
          countryCode: null,
          latitude: 35.2,
          longitude: 139.2,
          websiteUrl: null,
          phone: null,
          description: null,
          openingHours: null,
          amenities: null,
          socialLinks: null,
        },
        paymentProposals: null,
      },
      authorityStatement: 'I am authorized to represent this location.',
      evidenceLinks: [],
    },
    relationshipEvent: relationshipEvent('location', locationId),
    entityTarget: null,
    locationTarget: {
      id: locationId,
      updatedAt: locationUpdatedAt,
      value: {
        name: 'Main Shop',
        slug: 'main-shop',
        addressLine: '1 Old Street',
        locality: 'Tokyo',
        region: 'Tokyo',
        postalCode: '100-0001',
        countryCode: 'JP',
        latitude: 35.1,
        longitude: 139.1,
        locationStatus: 'active',
        visibility: 'public',
        websiteUrl: null,
        phone: null,
        description: null,
        openingHours: null,
        amenities: [],
        socialLinks: [],
        osmType: null,
        osmId: null,
      },
    },
  };
}

function requestEntity(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'business-claim-field-application-v1',
    requestId,
    expectedSubmissionUpdatedAt: submissionUpdatedAt,
    expectedRelationshipDecisionId: relationshipDecisionId,
    expectedEntityUpdatedAt: entityUpdatedAt,
    expectedLocationUpdatedAt: null,
    entityDecision: {
      acceptedFields: ['name'],
      rejectedFields: ['legalName'],
    },
    locationDecision: null,
    paymentDecision: {
      acceptedIndexes: [0],
      rejectedIndexes: [1],
    },
    ...overrides,
  };
}

function requestLocation() {
  return {
    schemaVersion: 'business-claim-field-application-v1',
    requestId,
    expectedSubmissionUpdatedAt: submissionUpdatedAt,
    expectedRelationshipDecisionId: relationshipDecisionId,
    expectedEntityUpdatedAt: null,
    expectedLocationUpdatedAt: locationUpdatedAt,
    entityDecision: null,
    locationDecision: {
      acceptedFields: ['addressLine', 'latitude', 'longitude'],
      rejectedFields: [],
    },
    paymentDecision: null,
  };
}

function backend(initialState: BusinessClaimFieldApplicationState) {
  const events = new Map<string, BusinessClaimFieldApplicationPersistenceEventRecord>();
  const commits: BusinessClaimFieldApplicationCommitCommand[] = [];
  let commitFailure: Error | null = null;
  const service: BusinessClaimFieldApplicationPersistenceBackend = {
    async loadState() {
      return initialState;
    },
    async readApplicationEvent(id) {
      return events.get(id) ?? null;
    },
    async commitApplication(command) {
      if (commitFailure !== null) throw commitFailure;
      commits.push(command);
      events.set(command.requestId, {
        eventId: command.requestId,
        submissionId: command.submissionId,
        fromStatus: null,
        toStatus: 'resolved',
        action: 'business_claim_fields_applied',
        reasonCode: command.projection.hasAcceptedChanges
          ? 'field_decisions_committed'
          : 'field_decisions_reviewed_no_changes',
        actorId: command.actorId,
        internalNote: command.internalNote,
        createdAt: command.appliedAt.toISOString(),
      });
    },
  };
  return {
    service,
    commits,
    events,
    failWith(error: Error | null) {
      commitFailure = error;
    },
  };
}

describe('P5-04H2 Business Claim field application persistence', () => {
  it('commits and replays one atomic Entity and payment-draft application', async () => {
    const fixture = backend(entityState());
    const receipt = await applyBusinessClaimFieldApplication(
      context,
      fixture.service,
      submissionId,
      requestEntity(),
      appliedAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      submissionId,
      requestId,
      targetType: 'entity',
      targetId: entityId,
      appliedEntityFields: ['name'],
      rejectedEntityFields: ['legalName'],
      acceptedPaymentDraftCount: 1,
      rejectedPaymentDraftCount: 1,
      canonicalMutationCommitted: true,
      appliedAt: appliedAt.toISOString(),
    });
    expect(fixture.commits).toHaveLength(1);
    expect(fixture.commits[0]?.projection.entityApplication?.after.name).toBe(
      'Updated Merchant',
    );
    expect(fixture.commits[0]?.projection.paymentApplication?.acceptedProposals).toHaveLength(1);

    const replay = await applyBusinessClaimFieldApplication(
      context,
      fixture.service,
      submissionId,
      requestEntity(),
      appliedAt,
    );
    expect(replay.state).toBe('replayed');
    expect(fixture.commits).toHaveLength(1);
  });

  it('commits a Location projection with exact accepted fields', async () => {
    const fixture = backend(locationState());
    const receipt = await applyBusinessClaimFieldApplication(
      context,
      fixture.service,
      submissionId,
      requestLocation(),
      appliedAt,
    );
    expect(receipt).toMatchObject({
      targetType: 'location',
      appliedLocationFields: ['addressLine', 'latitude', 'longitude'],
      canonicalMutationCommitted: true,
    });
    expect(fixture.commits[0]?.projection.locationApplication?.after).toMatchObject({
      addressLine: '2 New Street',
      latitude: 35.2,
      longitude: 139.2,
    });
  });

  it('records a complete rejection as a durable no-change receipt', async () => {
    const fixture = backend(entityState());
    const receipt = await applyBusinessClaimFieldApplication(
      context,
      fixture.service,
      submissionId,
      requestEntity({
        entityDecision: {
          acceptedFields: [],
          rejectedFields: ['name', 'legalName'],
        },
        paymentDecision: {
          acceptedIndexes: [],
          rejectedIndexes: [0, 1],
        },
      }),
      appliedAt,
    );
    expect(receipt).toMatchObject({
      appliedEntityFields: [],
      acceptedPaymentDraftCount: 0,
      canonicalMutationCommitted: false,
    });
    expect(fixture.events.get(requestId)?.reasonCode).toBe(
      'field_decisions_reviewed_no_changes',
    );
  });

  it('rejects changed-content replay and unauthorized persistence', async () => {
    const fixture = backend(entityState());
    await applyBusinessClaimFieldApplication(
      context,
      fixture.service,
      submissionId,
      requestEntity(),
      appliedAt,
    );
    await expect(
      applyBusinessClaimFieldApplication(
        context,
        fixture.service,
        submissionId,
        requestEntity({
          entityDecision: {
            acceptedFields: ['legalName'],
            rejectedFields: ['name'],
          },
        }),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });

    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as BusinessClaimFieldApplicationContext;
    await expect(
      applyBusinessClaimFieldApplication(
        unauthorized,
        backend(entityState()).service,
        submissionId,
        requestEntity(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('maps atomic persistence conflicts to bounded conflict errors', async () => {
    const fixture = backend(entityState());
    fixture.failWith(
      new SubmissionPersistenceError('conflict', 'simulated exact-state conflict'),
    );
    await expect(
      applyBusinessClaimFieldApplication(
        context,
        fixture.service,
        submissionId,
        requestEntity(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(fixture.commits).toHaveLength(0);
  });

  it('does not expose private Claim or permission material in receipts or events', async () => {
    const fixture = backend(entityState());
    const receipt = await applyBusinessClaimFieldApplication(
      context,
      fixture.service,
      submissionId,
      requestEntity(),
      appliedAt,
    );
    const serializedReceipt = JSON.stringify(receipt);
    expect(serializedReceipt).not.toContain('authorityStatement');
    expect(serializedReceipt).not.toContain('editingPermission');
    expect(serializedReceipt).not.toContain('contactEmail');
    const event = fixture.events.get(requestId);
    expect(event?.internalNote).not.toContain('authorityStatement');
    expect(event?.internalNote).not.toContain('owner@merchant.example');
    expect(event?.internalNote).not.toContain('editingPermission');
  });
});
