import { describe, expect, it } from 'vitest';
import {
  loadLocationCorrectionWorkspace,
  type LocationCorrectionTarget,
} from '../src/admin/location-correction/workspace';
import type { CandidateDetailData } from '../src/admin/candidates/detail';

const candidateId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-08T00:00:00.000Z');

function candidate(overrides: Partial<CandidateDetailData['candidate']> = {}): CandidateDetailData {
  return {
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
      ...overrides,
    },
    importOrigin: null,
    sources: [
      {
        id: sourceId,
        relationship: 'origin',
        sourceName: 'Official profile',
        sourceType: 'official_site',
        sourceActive: true,
        sourceUrl: 'https://example.test/profile',
        archiveUrl: null,
        observedAt: '2026-07-07T00:00:00.000Z',
        publishedAt: null,
        fetchedAt: '2026-07-07T00:00:00.000Z',
        license: null,
        snapshot: {
          kind: 'physical_place',
          name: 'Reviewed Cafe',
          addressLine: '1-1 Example',
          locality: 'Tokyo',
          region: 'Tokyo',
          postalCode: '100-0001',
          countryCode: 'JP',
          latitude: 35.681236,
          longitude: 139.767125,
          category: 'cafe',
          websiteUrl: 'https://example.test',
          phone: '+81 3 0000 0000',
          description: 'Reviewed source description.',
          openingHours: 'Mon-Fri 08:00-18:00',
          amenities: ['wifi'],
          socialLinks: [],
          osmType: null,
          osmId: null,
          paymentTags: {},
          legacyVerificationLabel: null,
        },
      },
    ],
    sourcesTruncated: false,
  };
}

const location: LocationCorrectionTarget = {
  id: locationId,
  entityId: '40000000-0000-4000-8000-000000000001',
  canonicalPath: '/place/reviewed-cafe-tokyo',
  name: 'Reviewed Cafe Tokyo',
  addressLine: '1-1 Old Address',
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
};

const context = {
  actorId: 'admin:reviewer',
  actorType: 'human' as const,
  capabilities: ['location:correct' as const],
};

describe('Location correction workspace', () => {
  it('binds one physical Candidate exact source set to one canonical Location version', async () => {
    const result = await loadLocationCorrectionWorkspace(
      context,
      { loadDetail: async () => candidate() },
      { loadLocation: async () => location },
      candidateId,
      locationId,
      now,
    );

    expect(result).toMatchObject({
      generatedAt: now.toISOString(),
      eligible: true,
      location: { id: locationId, updatedAt: '2026-07-06T00:00:00.000Z' },
    });
    expect(result.candidate.sources.map((source) => source.id)).toEqual([sourceId]);
  });

  it('blocks non-physical, non-reviewable, truncated, and duplicate-open Candidate contexts', async () => {
    const blocked = candidate({
      candidateType: 'online_service',
      status: 'promoted',
      duplicateSignal: true,
      duplicateGroupId: '50000000-0000-4000-8000-000000000001',
      duplicateGroupStatus: 'open',
    });
    blocked.sourcesTruncated = true;

    const result = await loadLocationCorrectionWorkspace(
      context,
      { loadDetail: async () => blocked },
      { loadLocation: async () => location },
      candidateId,
      locationId,
      now,
    );

    expect(result.eligible).toBe(false);
    expect(result.eligibilityIssues).toEqual(
      expect.arrayContaining([
        'candidate_type_unsupported',
        'candidate_status_unsupported',
        'candidate_sources_truncated',
        'candidate_duplicate_review_open',
      ]),
    );
  });

  it('fails when the canonical Location cannot be loaded', async () => {
    await expect(
      loadLocationCorrectionWorkspace(
        context,
        { loadDetail: async () => candidate() },
        { loadLocation: async () => null },
        candidateId,
        locationId,
        now,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
