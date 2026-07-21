import { describe, expect, it, vi } from 'vitest';
import { createBusinessClaimFieldProvenanceHandler } from '../functions/admin/api/business-claim-field-applications/[submissionId]/complete-provenance';
import { BusinessClaimFieldProvenanceError } from '../src/admin/submissions/business-claim-field-provenance';

const submissionId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-21T01:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:business-claim-field-provenance',
  actorType: 'human' as const,
  subject: 'business-claim-field-provenance',
  email: 'operator@example.com',
};
const body = {
  schemaVersion: 'business-claim-field-provenance-v1',
  requestId: '30000000-0000-4000-8000-000000000001',
  expectedFieldApplicationEventId: '40000000-0000-4000-8000-000000000001',
  expectedTargetUpdatedAt: '2026-07-20T08:00:00.000Z',
};

function pagesContext(
  overrides: {
    identity?: unknown;
    subjects?: string;
    sourceId?: string;
    submissionId?: string[];
    contentType?: string;
    rawBody?: string;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/business-claim-field-applications/${submissionId}/complete-provenance`,
      {
        method: 'POST',
        headers: { 'content-type': overrides.contentType ?? 'application/json' },
        body: overrides.rawBody ?? JSON.stringify(body),
      },
    ),
    env: {
      CPM_ADMIN_BUSINESS_CLAIM_FIELD_PROVENANCE_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['business-claim-field-provenance']),
      CPM_BUSINESS_CLAIM_SOURCE_ID: overrides.sourceId ?? sourceId,
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

const receipt = {
  state: 'committed' as const,
  submissionId,
  requestId: body.requestId,
  fieldApplicationEventId: body.expectedFieldApplicationEventId,
  sourceRecordId: '50000000-0000-4000-8000-000000000001',
  targetType: 'entity' as const,
  targetId: '60000000-0000-4000-8000-000000000001',
  fieldPaths: ['websiteUrl'],
  completedAt: now.toISOString(),
};

describe('P5-07E5 protected Business Claim field provenance API', () => {
  it('returns a bounded private receipt for an authorized subject', async () => {
    const completeProvenance = vi.fn(async () => receipt);
    const response = await createBusinessClaimFieldProvenanceHandler({
      completeProvenance,
      now: () => now,
    })(pagesContext());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(receipt);
    expect(completeProvenance).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:business-claim-field-provenance:complete'],
      },
      submissionId,
      sourceId,
      body,
      expect.any(Object),
      now,
    );
  });

  it('fails closed for authorization, configuration, content-type, JSON, and path errors', async () => {
    const completeProvenance = vi.fn();
    expect(
      (
        await createBusinessClaimFieldProvenanceHandler({ completeProvenance })(
          pagesContext({ identity: null }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createBusinessClaimFieldProvenanceHandler({ completeProvenance })(
          pagesContext({ subjects: '' }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await createBusinessClaimFieldProvenanceHandler({ completeProvenance })(
          pagesContext({ sourceId: 'not-a-uuid' }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await createBusinessClaimFieldProvenanceHandler({ completeProvenance })(
          pagesContext({ contentType: 'text/plain' }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await createBusinessClaimFieldProvenanceHandler({ completeProvenance })(
          pagesContext({ rawBody: '{' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createBusinessClaimFieldProvenanceHandler({ completeProvenance })(
          pagesContext({ submissionId: [submissionId] }),
        )
      ).status,
    ).toBe(400);
  });

  it('maps bounded completion errors without exposing private source or field material', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['conflict', 409],
      ['idempotency_conflict', 409],
      ['ineligible', 422],
    ] as const) {
      const response = await createBusinessClaimFieldProvenanceHandler({
        completeProvenance: vi.fn(async () => {
          throw new BusinessClaimFieldProvenanceError(
            code,
            'private source, provenance, and canonical field material',
          );
        }),
      })(pagesContext());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private source');
    }
  });
});
