import { describe, expect, it } from 'vitest';
import type { SubmissionReviewContext } from '../src/admin/submissions/authorization';
import {
  loadBusinessClaimSubmissionReviewDetail,
  businessClaimSubmissionReviewDetailResponseSchema,
  type BusinessClaimSubmissionReviewDetailData,
} from '../src/admin/submissions/business-claim-detail';
import {
  loadBusinessClaimSubmissionQueue,
  businessClaimSubmissionQueueQuerySchema,
  type BusinessClaimSubmissionQueuePageData,
} from '../src/admin/submissions/business-claim-queue';
import { assertBusinessClaimSubmissionQueueIdentity } from '../src/admin/submissions/drizzle-business-claim-submission-queue-backend';
import type { BusinessClaimCanonicalTargetMaterial } from '../src/submissions/business-claim-target-context';

const context: SubmissionReviewContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human',
  capabilities: ['submission:read'],
};
const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const claimId = '30000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-14T04:00:00.000Z');

function projection() {
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
      method: 'official_domain_email' as const,
      officialDomain: 'hosting.example',
      protectedContactPresent: true,
      officialWebsiteUrl: 'https://hosting.example/account',
      officialSocialUrl: null,
      assistedVerifierReferencePresent: false,
      privateProofPresent: true,
    },
    proposedChanges: {
      entity: {
        changedFields: ['name' as const],
        name: 'Example Hosting',
        legalName: null,
        websiteUrl: null,
        countryCode: null,
      },
      location: null,
      paymentProposals: [
        {
          assetSlug: 'usdc',
          networkSlug: 'base',
          routeType: 'processor_checkout' as const,
          paymentMethod: 'processor_checkout' as const,
          processor: { name: 'Example Pay', websiteUrl: null },
          contractAddress: null,
          howToPay: 'Choose crypto at checkout.',
          restrictions: null,
          isPrimary: true,
        },
      ],
    },
    authorityStatement: 'I am authorized to represent this business.',
    evidenceLinks: [
      {
        url: 'https://hosting.example/help/payments',
        observedAt: '2026-07-14',
        summary: 'Official payment instructions.',
      },
    ],
  };
}

function queuePage(): BusinessClaimSubmissionQueuePageData {
  return {
    items: [
      {
        id: submissionId,
        publicId: 'CPM-S-2026-000001',
        targetType: 'entity',
        targetId: entityId,
        claimantRole: 'owner',
        requestedScopes: [
          'representative_relationship',
          'entity_profile',
          'payment_information',
        ],
        verificationMethod: 'official_domain_email',
        workflowStatus: 'received',
        resolution: null,
        priority: 20,
        evidenceCount: 1,
        protectedContactPresent: true,
        privateProofPresent: true,
        assistedVerifierReferencePresent: false,
        submittedAt: '2026-07-14T03:00:00.000Z',
        updatedAt: '2026-07-14T03:00:00.000Z',
      },
    ],
    hasNextPage: false,
    nextCursor: null,
  };
}

function detailData(): BusinessClaimSubmissionReviewDetailData {
  return {
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'claim',
      targetType: 'entity',
      targetId: entityId,
      workflowStatus: 'received',
      resolution: null,
      priority: 20,
      submittedAt: '2026-07-14T03:00:00.000Z',
      updatedAt: '2026-07-14T03:00:00.000Z',
    },
    projection: projection(),
    events: [
      {
        fromStatus: null,
        toStatus: 'received',
        action: 'submission_received',
        reasonCode: null,
        actorType: 'submitter',
        createdAt: '2026-07-14T03:00:00.000Z',
      },
    ],
    eventsTruncated: false,
  };
}

function targetMaterial(): BusinessClaimCanonicalTargetMaterial {
  return {
    targetType: 'entity',
    targetId: entityId,
    entity: {
      id: entityId,
      entityType: 'online_service',
      name: 'Example Hosting',
      slug: 'example-hosting',
      legalName: 'Example Hosting Incorporated',
      websiteUrl: 'https://www.hosting.example/',
      countryCode: 'US',
      entityStatus: 'active',
      visibility: 'public',
      updatedAt: '2026-07-14T00:00:00.000Z',
    },
    location: null,
    claims: [
      {
        id: claimId,
        entityId,
        locationId: null,
        claimScope: 'online_service',
        routeType: 'processor_checkout',
        acceptanceScope: 'all_checkout',
        claimStatus: 'confirmed',
        visibility: 'public',
        processorName: 'Example Pay',
        howToPay: 'Choose crypto at checkout.',
        restrictions: null,
        firstConfirmedAt: '2026-01-01T00:00:00.000Z',
        lastConfirmedAt: '2026-07-01T00:00:00.000Z',
        nextReviewAt: '2026-10-01T00:00:00.000Z',
        endedAt: null,
        updatedAt: '2026-07-01T00:00:00.000Z',
        options: [
          {
            assetSlug: 'usdc',
            networkSlug: 'base',
            paymentMethod: 'processor_checkout',
            isPrimary: true,
          },
        ],
      },
    ],
  };
}

describe('P5-04D Business Claim Submission reviewer contracts', () => {
  it('loads a bounded Business Claim queue for an authorized reviewer', async () => {
    const response = await loadBusinessClaimSubmissionQueue(
      context,
      { async loadPage() { return queuePage(); } },
      businessClaimSubmissionQueueQuerySchema.parse({}),
      now,
    );

    expect(response.generatedAt).toBe(now.toISOString());
    expect(response.items[0]).toMatchObject({
      claimantRole: 'owner',
      verificationMethod: 'official_domain_email',
      protectedContactPresent: true,
    });
    expect(JSON.stringify(response.items[0])).not.toContain('authorityStatement');
  });

  it('rejects queue access without the Submission read capability', async () => {
    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as SubmissionReviewContext;

    await expect(
      loadBusinessClaimSubmissionQueue(
        unauthorized,
        { async loadPage() { return queuePage(); } },
        businessClaimSubmissionQueueQuerySchema.parse({}),
        now,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('loads normalized Claim detail and composes read-only target context', async () => {
    const response = await loadBusinessClaimSubmissionReviewDetail(
      context,
      { async loadDetail() { return detailData(); } },
      { async loadTarget() { return targetMaterial(); } },
      submissionId,
      now,
    );

    expect(response.targetContext.target.canonicalPath).toBe('/service/example-hosting');
    expect(response.targetContext.identityComparisons.officialDomain).toBe('match');
    expect(response.privateMaterial).toEqual({
      protectedContactPresent: true,
      privateProofPresent: true,
      assistedVerifierReferencePresent: false,
    });
  });

  it('fails closed when stored metadata does not match the normalized Claim', async () => {
    const invalid = detailData();
    invalid.submission.targetId = claimId;

    await expect(
      loadBusinessClaimSubmissionReviewDetail(
        context,
        { async loadDetail() { return invalid; } },
        { async loadTarget() { return targetMaterial(); } },
        submissionId,
        now,
      ),
    ).rejects.toMatchObject({ code: 'invalid_detail' });
  });

  it('strictly rejects protected values in the reviewer response', async () => {
    const valid = await loadBusinessClaimSubmissionReviewDetail(
      context,
      { async loadDetail() { return detailData(); } },
      { async loadTarget() { return targetMaterial(); } },
      submissionId,
      now,
    );
    const candidate = {
      ...valid,
      contact: { email: 'owner@hosting.example', encryptedEmail: 'ciphertext' },
      privateProofUrl: 'https://private.example/proof',
      assistedVerifierReference: 'private-reference',
      statusTokenHash: `sha256:${'0'.repeat(64)}`,
      originalPayload: { private: true },
    };

    expect(businessClaimSubmissionReviewDetailResponseSchema.safeParse(candidate).success).toBe(false);
  });

  it('rejects queue rows whose stored identity differs from normalized Claim identity', () => {
    expect(() =>
      assertBusinessClaimSubmissionQueueIdentity({
        submissionType: 'claim',
        storedTargetType: 'entity',
        storedTargetId: entityId,
        normalizedTargetType: 'location',
        normalizedTargetId: entityId,
      }),
    ).toThrowError(/does not match/);
  });
});
