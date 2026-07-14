import { describe, expect, it } from 'vitest';
import type { BusinessClaimFieldApplicationState } from '../src/admin/submissions/business-claim-field-application';
import type { BusinessClaimFieldApplicationContext } from '../src/admin/submissions/business-claim-field-application-authorization';
import type {
  BusinessClaimFieldApplicationPersistenceBackend,
  BusinessClaimFieldApplicationPersistenceEventRecord,
} from '../src/admin/submissions/business-claim-field-application-persistence';
import {
  BusinessClaimFieldApplicationWorkspaceError,
  loadBusinessClaimFieldApplicationWorkspace,
} from '../src/admin/submissions/business-claim-field-application-workspace';
import { serializeBusinessClaimRelationshipDecisionEventPayload } from '../src/submissions/business-claim-relationship-decision-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const relationshipDecisionId = '30000000-0000-4000-8000-000000000001';
const preparationId = '40000000-0000-4000-8000-000000000001';
const executionId = '50000000-0000-4000-8000-000000000001';
const applicationId = '60000000-0000-4000-8000-000000000001';
const submissionUpdatedAt = '2026-07-14T08:00:00.000Z';
const entityUpdatedAt = '2026-07-14T07:00:00.000Z';
const now = new Date('2026-07-14T09:00:00.000Z');

const context: BusinessClaimFieldApplicationContext = {
  actorId: 'cloudflare-access:field-applicant',
  actorType: 'human',
  capabilities: ['submission:claim-fields:apply'],
};

function relationshipEvent(
  targetId = entityId,
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
      targetType: 'entity',
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
        targetType: 'entity',
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

function state(): BusinessClaimFieldApplicationState {
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
      requestedScopes: ['representative_relationship', 'entity_profile', 'payment_information'],
      verification: {
        method: 'dns_txt',
        officialDomain: 'merchant.example',
        protectedContactPresent: true,
        officialWebsiteUrl: null,
        officialSocialUrl: null,
        assistedVerifierReferencePresent: false,
        privateProofPresent: true,
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
        paymentProposals: [
          {
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
        ],
      },
      authorityStatement: 'I am authorized to represent this business.',
      evidenceLinks: [],
    },
    relationshipEvent: relationshipEvent(),
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

function priorApplication(): BusinessClaimFieldApplicationPersistenceEventRecord {
  return {
    eventId: applicationId,
    submissionId,
    fromStatus: null,
    toStatus: 'resolved',
    action: 'business_claim_fields_applied',
    reasonCode: 'field_decisions_committed',
    actorId: context.actorId,
    internalNote: '{}',
    createdAt: now.toISOString(),
  };
}

function backend(
  currentState: BusinessClaimFieldApplicationState,
  prior: BusinessClaimFieldApplicationPersistenceEventRecord | null = null,
): BusinessClaimFieldApplicationPersistenceBackend {
  return {
    async loadState() {
      return currentState;
    },
    async readApplicationEvent() {
      return null;
    },
    async readSubmissionApplicationEvent() {
      return prior;
    },
    async commitApplication() {},
  };
}

describe('P5-04H3 Business Claim field application workspace', () => {
  it('loads safe current-versus-proposed Entity and payment material', async () => {
    const workspace = await loadBusinessClaimFieldApplicationWorkspace(
      context,
      backend(state()),
      submissionId,
      relationshipDecisionId,
      now,
    );

    expect(workspace).toMatchObject({
      eligible: true,
      eligibilityIssues: [],
      target: {
        targetType: 'entity',
        targetId: entityId,
        updatedAt: entityUpdatedAt,
      },
      requestSeed: {
        expectedSubmissionUpdatedAt: submissionUpdatedAt,
        expectedRelationshipDecisionId: relationshipDecisionId,
        expectedEntityUpdatedAt: entityUpdatedAt,
        expectedLocationUpdatedAt: null,
      },
    });
    expect(workspace.entityFields).toEqual([
      { field: 'name', currentValue: 'Original Merchant', proposedValue: 'Updated Merchant' },
      { field: 'legalName', currentValue: null, proposedValue: 'Updated Merchant LLC' },
    ]);
    expect(workspace.paymentProposals).toHaveLength(1);

    const serialized = JSON.stringify(workspace);
    expect(serialized).not.toContain('authorityStatement');
    expect(serialized).not.toContain('merchant.example');
    expect(serialized).not.toContain('protectedContactPresent');
    expect(serialized).not.toContain('privateProofPresent');
    expect(serialized).not.toContain('editingPermission');
  });

  it('marks a Submission with a prior durable application as ineligible', async () => {
    const workspace = await loadBusinessClaimFieldApplicationWorkspace(
      context,
      backend(state(), priorApplication()),
      submissionId,
      relationshipDecisionId,
      now,
    );
    expect(workspace.eligible).toBe(false);
    expect(workspace.eligibilityIssues).toContain('already_applied');
  });

  it('fails closed when the relationship target does not match the Claim', async () => {
    const invalidState = state();
    invalidState.relationshipEvent = relationshipEvent('20000000-0000-4000-8000-000000000099');
    await expect(
      loadBusinessClaimFieldApplicationWorkspace(
        context,
        backend(invalidState),
        submissionId,
        relationshipDecisionId,
        now,
      ),
    ).rejects.toBeInstanceOf(BusinessClaimFieldApplicationWorkspaceError);
    await expect(
      loadBusinessClaimFieldApplicationWorkspace(
        context,
        backend(invalidState),
        submissionId,
        relationshipDecisionId,
        now,
      ),
    ).rejects.toMatchObject({ code: 'invalid_workspace' });
  });

  it('requires the dedicated field-application capability', async () => {
    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as BusinessClaimFieldApplicationContext;
    await expect(
      loadBusinessClaimFieldApplicationWorkspace(
        unauthorized,
        backend(state()),
        submissionId,
        relationshipDecisionId,
        now,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
