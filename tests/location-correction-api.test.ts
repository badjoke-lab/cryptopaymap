import { describe, expect, it, vi } from 'vitest';
import { createLocationCorrectionHandlers } from '../functions/admin/api/location-corrections/[candidateId]';
import type { LocationCorrectionWorkspaceResponse } from '../src/admin/location-correction/workspace';

const candidateId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-08T00:00:00.000Z');

const identity = {
  actorId: 'cloudflare-access:subject-1',
  actorType: 'human' as const,
  subject: 'subject-1',
  email: 'reviewer@example.test',
};

function workspace(): LocationCorrectionWorkspaceResponse {
  return {
    generatedAt: now.toISOString(),
    candidate: {
      generatedAt: now.toISOString(),
      candidate: {
        id: candidateId,
        name: 'Reviewed Cafe Candidate',
        candidateType: 'physical_place',
        status: 'triaged',
        priority: 10,
        firstSeenAt: '2026-07-01T00:00:00.000Z',
        lastSeenAt: '2026-07-07T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
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
          sourceName: 'Official profile',
          sourceType: 'official_website',
          sourceActive: true,
          sourceUrl: 'https://example.test/profile',
          archiveUrl: null,
          observedAt: '2026-07-07T00:00:00.000Z',
          publishedAt: null,
          fetchedAt: '2026-07-07T00:00:00.000Z',
          license: null,
          snapshot: null,
        },
      ],
      sourcesTruncated: false,
    },
    location: {
      id: locationId,
      entityId: '50000000-0000-4000-8000-000000000001',
      canonicalPath: '/place/reviewed-cafe-tokyo',
      name: 'Reviewed Cafe Tokyo',
      addressLine: '1-1 Example',
      locality: 'Tokyo',
      region: 'Tokyo',
      postalCode: '100-0001',
      countryCode: 'JP',
      websiteUrl: 'https://example.test',
      phone: '+81 3 1111 1111',
      description: 'Old description.',
      openingHours: 'Mon-Fri 09:00-17:00',
      amenities: ['wifi'],
      socialLinks: [],
      visibility: 'public',
      locationStatus: 'active',
      updatedAt: '2026-07-06T00:00:00.000Z',
    },
    eligible: true,
    eligibilityIssues: [],
  };
}

function context(request: Request) {
  return {
    request,
    env: {
      CPM_ADMIN_LOCATION_CORRECT_SUBJECTS: JSON.stringify(['subject-1']),
    },
    params: { candidateId },
    data: { adminIdentity: identity },
    waitUntil: vi.fn(),
  };
}

function validBody() {
  return {
    expectedCandidateUpdatedAt: '2026-07-07T00:00:00.000Z',
    expectedLocationUpdatedAt: '2026-07-06T00:00:00.000Z',
    changes: {
      phone: { operation: 'set', value: '+81 3 2222 2222' },
    },
    sourceRecordIds: [sourceId],
    provenanceAssignments: [{ fieldPath: 'phone', sourceRecordIds: [sourceId] }],
    reasonCode: 'reviewed_profile_correction',
    publicSummary: 'Updated phone from reviewed official source.',
    internalNote: null,
  };
}

describe('Location correction protected API', () => {
  it('returns the version-pinned Candidate and Location workspace', async () => {
    const handlers = createLocationCorrectionHandlers({
      loadWorkspace: async () => workspace(),
      now: () => now,
    });
    const response = await handlers.get(
      context(
        new Request(
          `https://example.test/admin/api/location-corrections/${candidateId}?locationId=${locationId}`,
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      eligible: true,
      location: { id: locationId, updatedAt: '2026-07-06T00:00:00.000Z' },
    });
  });

  it('commits only after exact Candidate, Location, and source-set revalidation', async () => {
    const writeCorrection = vi.fn(async () => ({
      requestId,
      locationId,
      appliedFieldPaths: ['phone' as const],
      decidedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      state: 'committed' as const,
    }));
    const handlers = createLocationCorrectionHandlers({
      loadWorkspace: async () => workspace(),
      writeCorrection,
      now: () => now,
    });
    const response = await handlers.post(
      context(
        new Request(
          `https://example.test/admin/api/location-corrections/${candidateId}?locationId=${locationId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': requestId,
            },
            body: JSON.stringify(validBody()),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(writeCorrection).toHaveBeenCalledOnce();
    expect(writeCorrection.mock.calls[0]?.[0]).toMatchObject({
      requestId,
      capabilities: ['location:correct'],
    });
  });

  it('returns conflict before write when the reviewed Location version changed', async () => {
    const writeCorrection = vi.fn();
    const changed = workspace();
    changed.location.updatedAt = '2026-07-08T00:00:00.000Z';
    const handlers = createLocationCorrectionHandlers({
      loadWorkspace: async () => changed,
      writeCorrection,
      now: () => now,
    });
    const response = await handlers.post(
      context(
        new Request(
          `https://example.test/admin/api/location-corrections/${candidateId}?locationId=${locationId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': requestId,
            },
            body: JSON.stringify(validBody()),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    expect(writeCorrection).not.toHaveBeenCalled();
  });

  it('returns conflict before write when the exact Candidate source set changed', async () => {
    const writeCorrection = vi.fn();
    const changed = workspace();
    changed.candidate.sources.push({
      ...changed.candidate.sources[0]!,
      id: '30000000-0000-4000-8000-000000000002',
    });
    const handlers = createLocationCorrectionHandlers({
      loadWorkspace: async () => changed,
      writeCorrection,
      now: () => now,
    });
    const response = await handlers.post(
      context(
        new Request(
          `https://example.test/admin/api/location-corrections/${candidateId}?locationId=${locationId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': requestId,
            },
            body: JSON.stringify(validBody()),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    expect(writeCorrection).not.toHaveBeenCalled();
  });

  it('requires an allowlisted subject and UUID idempotency key', async () => {
    const handlers = createLocationCorrectionHandlers({
      loadWorkspace: async () => workspace(),
      now: () => now,
    });
    const deniedContext = context(
      new Request(
        `https://example.test/admin/api/location-corrections/${candidateId}?locationId=${locationId}`,
      ),
    );
    deniedContext.env.CPM_ADMIN_LOCATION_CORRECT_SUBJECTS = JSON.stringify(['subject-2']);
    expect((await handlers.get(deniedContext)).status).toBe(403);

    const invalidKeyResponse = await handlers.post(
      context(
        new Request(
          `https://example.test/admin/api/location-corrections/${candidateId}?locationId=${locationId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': 'invalid',
            },
            body: JSON.stringify(validBody()),
          },
        ),
      ),
    );
    expect(invalidKeyResponse.status).toBe(400);
  });
});
