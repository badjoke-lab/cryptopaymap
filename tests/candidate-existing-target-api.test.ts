import { describe, expect, it, vi } from 'vitest';
import { createExistingTargetLinkHandler } from '../functions/admin/api/promotions/[candidateId]/existing-target';
import type { CandidatePromotionReceipt } from '../src/admin/promotion/candidate-promotion';
import type { CandidatePromotionWorkspaceResponse } from '../src/admin/promotion/workspace';

const candidateId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const locationId = '40000000-0000-4000-8000-000000000001';
const claimId = '50000000-0000-4000-8000-000000000001';
const claimAssetId = '60000000-0000-4000-8000-000000000001';
const assetId = '70000000-0000-4000-8000-000000000001';
const networkId = '80000000-0000-4000-8000-000000000001';
const methodId = '90000000-0000-4000-8000-000000000001';
const requestId = 'a0000000-0000-4000-8000-000000000001';
const updatedAt = '2026-06-30T01:00:00.000Z';
const targetUpdatedAt = '2026-06-30T02:00:00.000Z';
const now = new Date('2026-07-01T00:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:promoter',
  actorType: 'human' as const,
  subject: 'promoter',
  email: 'promoter@example.test',
};

function workspace(): CandidatePromotionWorkspaceResponse {
  return {
    generatedAt: now.toISOString(),
    detail: {
      generatedAt: now.toISOString(),
      candidate: {
        id: candidateId,
        name: 'Example Cafe',
        candidateType: 'physical_place',
        status: 'triaged',
        priority: 500,
        firstSeenAt: '2026-06-01T00:00:00.000Z',
        lastSeenAt: '2026-06-30T00:00:00.000Z',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt,
        duplicateSignal: false,
        duplicateGroupId: null,
        duplicateGroupStatus: null,
        linkedEntity: false,
        linkedLocation: false,
      },
      importOrigin: null,
      sources: [
        {
          id: sourceId,
          relationship: 'origin',
          sourceName: 'Legacy import',
          sourceType: 'legacy_import',
          sourceActive: true,
          sourceUrl: 'https://example.test/source',
          archiveUrl: null,
          observedAt: null,
          publishedAt: null,
          fetchedAt: '2026-06-30T00:00:00.000Z',
          license: null,
          snapshot: null,
        },
      ],
      sourcesTruncated: false,
    },
    eligible: true,
    eligibilityIssues: [],
    registries: { assets: [], networks: [], paymentMethods: [], processors: [] },
  };
}

function requestBody() {
  return {
    expectedCandidateType: 'physical_place',
    expectedCandidateUpdatedAt: updatedAt,
    target: {
      entityId,
      expectedEntityUpdatedAt: targetUpdatedAt,
      locationId,
      expectedLocationUpdatedAt: targetUpdatedAt,
      expectedCanonicalPath: '/place/example-cafe',
      expectedClaimIds: [],
    },
    claim: {
      id: claimId,
      value: {
        entityId,
        locationId,
        claimScope: 'location_specific',
        routeType: 'direct_wallet',
        acceptanceScope: 'all_checkout',
        claimStatus: 'candidate',
        visibility: 'hidden',
        customerPaysCrypto: true,
        merchantExplicitlyAcceptsCrypto: true,
        processorId: null,
        howToPay: 'Scan the wallet QR code.',
        instructionsLanguage: 'en',
        merchantReceives: 'crypto',
        restrictions: null,
        firstConfirmedAt: null,
        lastConfirmedAt: null,
        nextReviewAt: null,
        endedAt: null,
        endedReason: null,
      },
    },
    claimAssets: [
      {
        id: claimAssetId,
        value: {
          claimId,
          assetId,
          networkId,
          paymentMethodId: methodId,
          contractAddress: null,
          isPrimary: true,
          notes: null,
        },
      },
    ],
    sourceRecordIds: [sourceId],
  };
}

function receipt(): CandidatePromotionReceipt {
  return {
    requestId,
    candidateId,
    entityId,
    locationId,
    claimId,
    claimAssetIds: [claimAssetId],
    canonicalPath: '/place/example-cafe',
    claimStatus: 'candidate',
    visibility: 'hidden',
    promotedAt: now.toISOString(),
    state: 'committed',
  };
}

function context(options: { idempotencyKey?: string; promoteSubjects?: string } = {}) {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  return {
    request: new Request(
      `https://example.test/admin/api/promotions/${candidateId}/existing-target`,
      { method: 'POST', headers, body: JSON.stringify(requestBody()) },
    ),
    env: {
      CPM_ADMIN_CANDIDATE_SUBJECTS: JSON.stringify(['promoter']),
      CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS:
        options.promoteSubjects ?? JSON.stringify(['promoter']),
    },
    params: { candidateId },
    data: { adminIdentity: identity },
    waitUntil: vi.fn(),
  };
}

describe('protected existing-target link endpoint', () => {
  it('commits a validated selected target through the durable backend boundary', async () => {
    const commitLink = vi.fn(async () => receipt());
    const handler = createExistingTargetLinkHandler({
      loadWorkspace: vi.fn(async () => workspace()),
      commitLink,
      now: () => now,
    });
    const response = await handler(context({ idempotencyKey: requestId }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(receipt());
    expect(commitLink).toHaveBeenCalledWith(
      candidateId,
      expect.any(Object),
      expect.objectContaining({ requestId, capabilities: ['candidate:promote'] }),
      requestBody(),
      now,
    );
  });

  it('requires separate promotion authorization and a valid idempotency key', async () => {
    const commitLink = vi.fn(async () => receipt());
    const handler = createExistingTargetLinkHandler({
      loadWorkspace: vi.fn(async () => workspace()),
      commitLink,
    });

    expect(
      (await handler(context({ idempotencyKey: requestId, promoteSubjects: JSON.stringify(['other']) }))).status,
    ).toBe(403);
    expect((await handler(context({ idempotencyKey: 'invalid' }))).status).toBe(400);
    expect(commitLink).not.toHaveBeenCalled();
  });
});
