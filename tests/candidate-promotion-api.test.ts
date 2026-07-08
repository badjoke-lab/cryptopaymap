import { describe, expect, it, vi } from 'vitest';
import { createCandidatePromotionHandlers } from '../functions/admin/api/promotions/[candidateId]';
import type { CandidatePromotionReceipt } from '../src/admin/promotion/candidate-promotion';
import type {
  CandidatePromotionEditorRequest,
  CandidatePromotionWorkspaceResponse,
} from '../src/admin/promotion/workspace';

const candidateId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const locationId = '40000000-0000-4000-8000-000000000001';
const claimId = '50000000-0000-4000-8000-000000000001';
const claimAssetId = '60000000-0000-4000-8000-000000000001';
const assetId = '70000000-0000-4000-8000-000000000001';
const networkId = '80000000-0000-4000-8000-000000000001';
const paymentMethodId = '90000000-0000-4000-8000-000000000001';
const requestId = 'a0000000-0000-4000-8000-000000000001';
const updatedAt = '2026-06-30T01:00:00.000Z';
const now = new Date('2026-07-01T00:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:promoter',
  actorType: 'human' as const,
  subject: 'promoter',
  email: 'promoter@example.test',
};

function workspace(eligible = true): CandidatePromotionWorkspaceResponse {
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
        duplicateSignal: !eligible,
        duplicateGroupId: eligible ? null : 'b0000000-0000-4000-8000-000000000001',
        duplicateGroupStatus: eligible ? null : 'open',
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
    eligible,
    eligibilityIssues: eligible ? [] : ['duplicate_review_open'],
    registries: { assets: [], networks: [], paymentMethods: [], processors: [] },
  };
}

function assignment(
  subjectType: 'entity' | 'location' | 'acceptance_claim' | 'claim_asset',
  subjectId: string,
  fieldPath: string,
) {
  return {
    subjectType,
    subjectId,
    fieldPath,
    sourceRecordIds: [sourceId],
    provenanceRole: 'origin' as const,
  };
}

function provenanceAssignments() {
  return [
    ...['name', 'websiteUrl', 'countryCode'].map((field) =>
      assignment('entity', entityId, field),
    ),
    ...[
      'name',
      'addressLine',
      'locality',
      'countryCode',
      'latitude',
      'longitude',
      'websiteUrl',
      'description',
      'openingHours',
      'amenities',
      'socialLinks',
    ].map((field) => assignment('location', locationId, field)),
    ...[
      'routeType',
      'acceptanceScope',
      'customerPaysCrypto',
      'merchantExplicitlyAcceptsCrypto',
      'howToPay',
      'merchantReceives',
    ].map((field) => assignment('acceptance_claim', claimId, field)),
    ...['assetId', 'networkId', 'paymentMethodId'].map((field) =>
      assignment('claim_asset', claimAssetId, field),
    ),
  ];
}

function body(): CandidatePromotionEditorRequest {
  return {
    expectedCandidateType: 'physical_place',
    expectedCandidateUpdatedAt: updatedAt,
    entity: {
      id: entityId,
      value: {
        entityType: 'merchant',
        name: 'Example Cafe',
        slug: null,
        legalName: null,
        websiteUrl: 'https://example.test',
        countryCode: 'JP',
        entityStatus: 'active',
        visibility: 'hidden',
      },
    },
    location: {
      id: locationId,
      value: {
        name: 'Example Cafe',
        slug: 'example-cafe',
        addressLine: '1 Main Street',
        locality: 'Tokyo',
        region: null,
        postalCode: null,
        countryCode: 'JP',
        latitude: 35.68,
        longitude: 139.76,
        locationStatus: 'active',
        visibility: 'hidden',
        websiteUrl: 'https://example.test',
        phone: null,
        description: 'Reviewed description.',
        openingHours: 'Mon-Fri 08:00-18:00',
        amenities: ['wifi'],
        socialLinks: [
          {
            platform: 'instagram',
            url: 'https://social.example.test/cafe',
            handle: '@cafe',
          },
        ],
        osmType: null,
        osmId: null,
      },
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
          paymentMethodId,
          contractAddress: null,
          isPrimary: true,
          notes: null,
        },
      },
    ],
    sourceRecordIds: [sourceId],
    provenanceAssignments: provenanceAssignments(),
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

function context(
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    identity?: unknown;
    readSubjects?: string;
    promoteSubjects?: string;
    idempotencyKey?: string;
  } = {},
) {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Accept: 'application/json' });
  if (method === 'POST') headers.set('Content-Type', 'application/json');
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  return {
    request: new Request(`https://example.test/admin/api/promotions/${candidateId}`, {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify(options.body) } : {}),
    }),
    env: {
      CPM_ADMIN_CANDIDATE_SUBJECTS: options.readSubjects ?? JSON.stringify(['promoter']),
      CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: options.promoteSubjects ?? JSON.stringify(['promoter']),
    },
    params: { candidateId },
    data: { adminIdentity: options.identity === undefined ? identity : options.identity },
    waitUntil: vi.fn(),
  };
}

describe('protected Candidate promotion endpoints', () => {
  it('returns the bounded promotion workspace to an authorized reader', async () => {
    const loadWorkspace = vi.fn(async () => workspace());
    const handlers = createCandidatePromotionHandlers({ loadWorkspace, now: () => now });
    const response = await handlers.get(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(workspace());
    expect(loadWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ['candidate:read'] }),
      candidateId,
      expect.any(Object),
      now,
    );
  });

  it('requires separate promotion authorization and an idempotency UUID', async () => {
    const commitPromotion = vi.fn(async () => receipt());
    const handlers = createCandidatePromotionHandlers({
      loadWorkspace: vi.fn(async () => workspace()),
      commitPromotion,
    });

    const denied = await handlers.post(
      context({
        method: 'POST',
        body: body(),
        idempotencyKey: requestId,
        promoteSubjects: JSON.stringify(['other']),
      }),
    );
    expect(denied.status).toBe(403);

    const invalidKey = await handlers.post(
      context({ method: 'POST', body: body(), idempotencyKey: 'invalid' }),
    );
    expect(invalidKey.status).toBe(400);
    expect(commitPromotion).not.toHaveBeenCalled();
  });

  it('rejects omitted or empty field-level provenance plans at the protected editor boundary', async () => {
    const commitPromotion = vi.fn(async () => receipt());
    const handlers = createCandidatePromotionHandlers({
      loadWorkspace: vi.fn(async () => workspace()),
      commitPromotion,
    });
    const complete = body();
    const omitted = { ...complete } as Record<string, unknown>;
    delete omitted.provenanceAssignments;
    const empty = { ...complete, provenanceAssignments: [] };

    const omittedResponse = await handlers.post(
      context({ method: 'POST', body: omitted, idempotencyKey: requestId }),
    );
    const emptyResponse = await handlers.post(
      context({ method: 'POST', body: empty, idempotencyKey: requestId }),
    );

    expect(omittedResponse.status).toBe(400);
    expect(emptyResponse.status).toBe(400);
    expect(commitPromotion).not.toHaveBeenCalled();
  });

  it('commits one eligible validated draft using the server time', async () => {
    const commitPromotion = vi.fn(async () => receipt());
    const handlers = createCandidatePromotionHandlers({
      loadWorkspace: vi.fn(async () => workspace()),
      commitPromotion,
      now: () => now,
    });
    const response = await handlers.post(
      context({ method: 'POST', body: body(), idempotencyKey: requestId }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(receipt());
    expect(commitPromotion).toHaveBeenCalledWith(
      candidateId,
      expect.any(Object),
      expect.objectContaining({ requestId, capabilities: ['candidate:promote'] }),
      body(),
      now,
    );
  });

  it('blocks an ineligible workspace without calling the transaction backend', async () => {
    const commitPromotion = vi.fn(async () => receipt());
    const handlers = createCandidatePromotionHandlers({
      loadWorkspace: vi.fn(async () => workspace(false)),
      commitPromotion,
    });
    const response = await handlers.post(
      context({ method: 'POST', body: body(), idempotencyKey: requestId }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_promotion_conflict' });
    expect(commitPromotion).not.toHaveBeenCalled();
  });
});
