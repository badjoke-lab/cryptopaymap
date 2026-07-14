import { describe, expect, it } from 'vitest';
import {
  authorizeBusinessClaimFieldApplication,
  readBusinessClaimFieldApplicationAuthorizationPolicy,
  type BusinessClaimFieldApplicationContext,
} from '../src/admin/submissions/business-claim-field-application-authorization';
import {
  businessClaimFieldApplicationProjectionSchema,
  projectBusinessClaimFieldApplication,
  type BusinessClaimFieldApplicationBackend,
  type BusinessClaimFieldApplicationEventRecord,
  type BusinessClaimFieldApplicationState,
} from '../src/admin/submissions/business-claim-field-application';
import { serializeBusinessClaimRelationshipDecisionEventPayload } from '../src/submissions/business-claim-relationship-decision-contract';

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
const generatedAt = new Date('2026-07-14T08:30:00.000Z');

const context: BusinessClaimFieldApplicationContext = {
  actorId: 'cloudflare-access:field-applicant',
  actorType: 'human',
  capabilities: ['submission:claim-fields:apply'],
};

function relationshipEvent(
  targetType: 'entity' | 'location',
  targetId: string,
): BusinessClaimFieldApplicationEventRecord {
  return {
    eventId: relationshipDecisionId,
    submissionId,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    action: 'business_claim_relationship_approved',
    reasonCode: 'verified_authority_confirmed',
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

function paymentProposals() {
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

function entityProjection() {
  return {
    targetType: 'entity' as const,
    targetId: entityId,
    claimantRole: 'owner' as const,
    requestedScopes: [
      'representative_relationship' as const,
      'entity_profile' as const,
      'payment_information' as const,
    ],
    verification: {
      method: 'dns_txt' as const,
      officialDomain: 'merchant.example',
      protectedContactPresent: false,
      officialWebsiteUrl: null,
      officialSocialUrl: null,
      assistedVerifierReferencePresent: false,
      privateProofPresent: false,
    },
    proposedChanges: {
      entity: {
        changedFields: ['name', 'legalName'] as const,
        name: 'Updated Merchant',
        legalName: 'Updated Merchant LLC',
        websiteUrl: null,
        countryCode: null,
      },
      location: null,
      paymentProposals: paymentProposals(),
    },
    authorityStatement: 'I am authorized to represent this business.',
    evidenceLinks: [],
  };
}

function locationProjection() {
  return {
    targetType: 'location' as const,
    targetId: locationId,
    claimantRole: 'owner' as const,
    requestedScopes: [
      'representative_relationship' as const,
      'location_profile' as const,
    ],
    verification: {
      method: 'dns_txt' as const,
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
        changedFields: ['addressLine', 'latitude', 'longitude', 'amenities'] as const,
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
        amenities: ['wheelchair_accessible'],
        socialLinks: null,
      },
      paymentProposals: null,
    },
    authorityStatement: 'I am authorized to represent this location.',
    evidenceLinks: [],
  };
}

function entityState(projectionValue: unknown = entityProjection()): BusinessClaimFieldApplicationState {
  return {
    submissionId,
    submissionType: 'claim',
    workflowStatus: 'resolved',
    resolution: 'approved',
    updatedAt: submissionUpdatedAt,
    targetType: 'entity',
    targetId: entityId,
    normalizedProjection: projectionValue,
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
    normalizedProjection: locationProjection(),
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
        websiteUrl: 'https://merchant.example/shop',
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

function backend(state: BusinessClaimFieldApplicationState): BusinessClaimFieldApplicationBackend {
  return {
    async loadState() {
      return state;
    },
  };
}

function entityRequest(overrides: Record<string, unknown> = {}) {
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

function locationRequest(overrides: Record<string, unknown> = {}) {
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
      rejectedFields: ['amenities'],
    },
    paymentDecision: null,
    ...overrides,
  };
}

describe('P5-04H1 Business Claim field application', () => {
  it('projects accepted Entity and payment proposals without accepting rejected fields', async () => {
    const result = await projectBusinessClaimFieldApplication(
      context,
      backend(entityState()),
      submissionId,
      entityRequest(),
      generatedAt,
    );

    expect(result).toMatchObject({
      targetType: 'entity',
      targetId: entityId,
      hasAcceptedChanges: true,
      entityApplication: {
        acceptedFields: ['name'],
        rejectedFields: ['legalName'],
        before: { name: 'Original Merchant', legalName: null },
        after: { name: 'Updated Merchant', legalName: null },
      },
      paymentApplication: {
        acceptedIndexes: [0],
        rejectedIndexes: [1],
        acceptedProposals: [{ assetSlug: 'xrp' }],
      },
    });
    expect(result.requestFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('authorityStatement');
    expect(JSON.stringify(result)).not.toContain('merchant.example');
    expect(JSON.stringify(result)).not.toContain('editingPermission');
  });

  it('projects accepted Location fields while preserving rejected canonical values', async () => {
    const result = await projectBusinessClaimFieldApplication(
      context,
      backend(locationState()),
      submissionId,
      locationRequest(),
      generatedAt,
    );

    expect(result.locationApplication).toMatchObject({
      acceptedFields: ['addressLine', 'latitude', 'longitude'],
      rejectedFields: ['amenities'],
      before: {
        addressLine: '1 Old Street',
        latitude: 35.1,
        longitude: 139.1,
        amenities: [],
      },
      after: {
        addressLine: '2 New Street',
        latitude: 35.2,
        longitude: 139.2,
        amenities: [],
      },
    });
  });

  it('permits a complete rejection projection without canonical changes', async () => {
    const result = await projectBusinessClaimFieldApplication(
      context,
      backend(entityState()),
      submissionId,
      entityRequest({
        entityDecision: {
          acceptedFields: [],
          rejectedFields: ['name', 'legalName'],
        },
        paymentDecision: {
          acceptedIndexes: [],
          rejectedIndexes: [0, 1],
        },
      }),
      generatedAt,
    );
    expect(result.hasAcceptedChanges).toBe(false);
    expect(result.entityApplication?.after).toEqual(result.entityApplication?.before);
    expect(result.paymentApplication?.acceptedProposals).toEqual([]);
  });

  it('rejects incomplete, overlapping, invented, and split-coordinate decisions', async () => {
    await expect(
      projectBusinessClaimFieldApplication(
        context,
        backend(entityState()),
        submissionId,
        entityRequest({
          entityDecision: { acceptedFields: ['name'], rejectedFields: [] },
        }),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_decision' });

    await expect(
      projectBusinessClaimFieldApplication(
        context,
        backend(entityState()),
        submissionId,
        entityRequest({
          entityDecision: {
            acceptedFields: ['name'],
            rejectedFields: ['name', 'legalName'],
          },
        }),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_decision' });

    await expect(
      projectBusinessClaimFieldApplication(
        context,
        backend(entityState()),
        submissionId,
        entityRequest({
          entityDecision: {
            acceptedFields: ['name', 'websiteUrl'],
            rejectedFields: ['legalName'],
          },
        }),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_decision' });

    await expect(
      projectBusinessClaimFieldApplication(
        context,
        backend(locationState()),
        submissionId,
        locationRequest({
          locationDecision: {
            acceptedFields: ['addressLine', 'latitude'],
            rejectedFields: ['longitude', 'amenities'],
          },
        }),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_decision' });
  });

  it('rejects stale targets, no-op acceptance, malformed Claims, and invalid relationships', async () => {
    await expect(
      projectBusinessClaimFieldApplication(
        context,
        backend(entityState()),
        submissionId,
        entityRequest({ expectedEntityUpdatedAt: '2026-07-14T07:01:00.000Z' }),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'stale_target' });

    const noOpProjection = entityProjection();
    noOpProjection.proposedChanges.entity.name = 'Original Merchant';
    await expect(
      projectBusinessClaimFieldApplication(
        context,
        backend(entityState(noOpProjection)),
        submissionId,
        entityRequest(),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'no_op' });

    await expect(
      projectBusinessClaimFieldApplication(
        context,
        backend(entityState({ broken: true })),
        submissionId,
        entityRequest(),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_claim' });

    const missingRelationship = entityState();
    missingRelationship.relationshipEvent = null;
    await expect(
      projectBusinessClaimFieldApplication(
        context,
        backend(missingRelationship),
        submissionId,
        entityRequest(),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_relationship' });
  });

  it('rejects unauthorized access and strict-response leakage', async () => {
    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as BusinessClaimFieldApplicationContext;
    await expect(
      projectBusinessClaimFieldApplication(
        unauthorized,
        backend(entityState()),
        submissionId,
        entityRequest(),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    const result = await projectBusinessClaimFieldApplication(
      context,
      backend(entityState()),
      submissionId,
      entityRequest(),
      generatedAt,
    );
    expect(
      businessClaimFieldApplicationProjectionSchema.safeParse({
        ...result,
        contactEmail: 'owner@merchant.example',
        authorityStatement: 'private statement',
        privateProofUrl: 'https://private.example/proof',
        editingPermission: true,
        accountId: 'account-id',
      }).success,
    ).toBe(false);
  });

  it('uses an exact dedicated allowlist for field application', () => {
    const policy = readBusinessClaimFieldApplicationAuthorizationPolicy({
      CPM_ADMIN_CLAIM_FIELD_APPLICATION_SUBJECTS: JSON.stringify(['field-applicant']),
    });
    const authorized = authorizeBusinessClaimFieldApplication(
      {
        actorId: 'cloudflare-access:field-applicant',
        actorType: 'human',
        subject: 'field-applicant',
        email: null,
      },
      policy,
    );
    expect(authorized.capabilities).toEqual(['submission:claim-fields:apply']);

    expect(() =>
      authorizeBusinessClaimFieldApplication(
        {
          actorId: 'cloudflare-access:relationship-decider',
          actorType: 'human',
          subject: 'relationship-decider',
          email: null,
        },
        policy,
      ),
    ).toThrowError(/not authorized/);
  });
});
