import { describe, expect, it, vi } from 'vitest';
import {
  loadCandidateDetail,
  type CandidateDetailBackend,
  type CandidateDetailData,
} from '../src/admin/candidates/detail';

const candidateId = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';
const asOf = new Date('2026-06-29T00:00:00.000Z');
const authorizedContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  capabilities: ['candidate:read' as const],
};

function validDetail(): CandidateDetailData {
  return {
    candidate: {
      id: candidateId,
      name: 'Example Cafe',
      candidateType: 'physical_place',
      status: 'triaged',
      priority: 900,
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-28T01:00:00.000Z',
      duplicateSignal: false,
      duplicateGroupId: null,
      duplicateGroupStatus: null,
      linkedEntity: false,
      linkedLocation: false,
    },
    importOrigin: {
      importKind: 'physical_place',
      sourceName: 'Legacy physical import',
      sourceType: 'legacy_import',
      sourceSchemaVersion: 'physical-place-v1',
      importerVersion: '1.0.0',
      completedAt: '2026-06-01T00:05:00.000Z',
    },
    sources: [
      {
        id: sourceId,
        relationship: 'origin',
        sourceName: 'Legacy physical import',
        sourceType: 'legacy_import',
        sourceActive: true,
        sourceUrl: 'https://source.example.test/place-1',
        archiveUrl: null,
        observedAt: '2026-06-01T00:00:00.000Z',
        publishedAt: null,
        fetchedAt: '2026-06-01T00:01:00.000Z',
        license: {
          slug: 'odbl-1-0',
          name: 'Open Database License',
          version: '1.0',
          attributionRequired: true,
          shareAlike: true,
        },
        snapshot: {
          kind: 'physical_place',
          name: 'Example Cafe',
          addressLine: '1 Example Street',
          locality: 'Tokyo',
          region: null,
          postalCode: null,
          countryCode: 'JP',
          latitude: 35.68,
          longitude: 139.76,
          category: 'cafe',
          websiteUrl: 'https://example.test',
          phone: '+81 3 0000 0000',
          description: 'Reviewed source description.',
          openingHours: 'Mon-Fri 08:00-18:00',
          amenities: ['wifi', 'outdoor-seating'],
          socialLinks: [
            {
              platform: 'x',
              url: null,
              handle: '@examplecafe',
            },
          ],
          osmType: 'node',
          osmId: '123',
          paymentTags: { 'payment:bitcoin': 'yes' },
          legacyVerificationLabel: 'legacy verified',
        },
      },
    ],
    sourcesTruncated: false,
  };
}

describe('Candidate detail contract', () => {
  it('rejects unauthorized contexts before backend access', async () => {
    const backend: CandidateDetailBackend = { loadDetail: vi.fn(async () => validDetail()) };

    await expect(
      loadCandidateDetail({ ...authorizedContext, capabilities: [] }, backend, candidateId, asOf),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.loadDetail).not.toHaveBeenCalled();
  });

  it('rejects an invalid Candidate UUID before backend access', async () => {
    const backend: CandidateDetailBackend = { loadDetail: vi.fn(async () => validDetail()) };

    await expect(
      loadCandidateDetail(authorizedContext, backend, 'not-a-uuid', asOf),
    ).rejects.toMatchObject({ code: 'invalid_candidate_id' });
    expect(backend.loadDetail).not.toHaveBeenCalled();
  });

  it('returns a validated detail with practical snapshot fields and generation time', async () => {
    const backend: CandidateDetailBackend = { loadDetail: vi.fn(async () => validDetail()) };

    await expect(
      loadCandidateDetail(authorizedContext, backend, candidateId, asOf),
    ).resolves.toEqual({
      ...validDetail(),
      generatedAt: asOf.toISOString(),
    });
    expect(backend.loadDetail).toHaveBeenCalledWith(candidateId, asOf);
  });

  it('rejects duplicate normalized practical values from an invalid backend detail', async () => {
    const detail = validDetail();
    const snapshot = detail.sources[0]?.snapshot;
    if (!snapshot || snapshot.kind !== 'physical_place') throw new Error('Expected physical snapshot.');
    snapshot.amenities = ['wifi', 'wifi'];
    const backend: CandidateDetailBackend = { loadDetail: vi.fn(async () => detail) };

    await expect(
      loadCandidateDetail(authorizedContext, backend, candidateId, asOf),
    ).rejects.toMatchObject({ code: 'invalid_detail' });
  });

  it('returns not found only after authorized backend access', async () => {
    const backend: CandidateDetailBackend = { loadDetail: vi.fn(async () => null) };

    await expect(
      loadCandidateDetail(authorizedContext, backend, candidateId, asOf),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(backend.loadDetail).toHaveBeenCalledOnce();
  });

  it('rejects an invalid backend detail', async () => {
    const detail = validDetail();
    detail.candidate.duplicateGroupStatus = 'open';
    const backend: CandidateDetailBackend = { loadDetail: vi.fn(async () => detail) };

    await expect(
      loadCandidateDetail(authorizedContext, backend, candidateId, asOf),
    ).rejects.toMatchObject({
      code: 'invalid_detail',
    });
  });

  it('wraps unexpected backend failures', async () => {
    const backend: CandidateDetailBackend = {
      loadDetail: vi.fn(async () => {
        throw new Error('private database failure');
      }),
    };

    await expect(
      loadCandidateDetail(authorizedContext, backend, candidateId, asOf),
    ).rejects.toMatchObject({
      code: 'backend_failure',
    });
  });
});
