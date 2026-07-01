import { describe, expect, it } from 'vitest';
import type { CandidateDetailBackend, CandidateDetailData } from '../src/admin/candidates/detail';
import {
  CandidateCanonicalTargetSearchError,
  searchCandidateCanonicalTargets,
  type CandidateCanonicalTargetOption,
  type CandidateCanonicalTargetSearchBackend,
} from '../src/admin/promotion/target-selection';

const candidateId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-01T00:00:00.000Z');

function detail(overrides: Partial<CandidateDetailData['candidate']> = {}): CandidateDetailData {
  return {
    candidate: {
      id: candidateId,
      name: 'Example Cafe',
      candidateType: 'physical_place',
      status: 'triaged',
      priority: 500,
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-30T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-30T01:00:00.000Z',
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
        id: '20000000-0000-4000-8000-000000000001',
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
  };
}

function target(): CandidateCanonicalTargetOption {
  return {
    canonicalPath: '/place/example-cafe',
    entity: {
      id: '30000000-0000-4000-8000-000000000001',
      entityType: 'merchant',
      name: 'Example Cafe Holdings',
      slug: null,
      websiteUrl: 'https://example.test',
      countryCode: 'JP',
      entityStatus: 'active',
      visibility: 'public',
      updatedAt: '2026-06-30T02:00:00.000Z',
    },
    location: {
      id: '40000000-0000-4000-8000-000000000001',
      entityId: '30000000-0000-4000-8000-000000000001',
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
      visibility: 'public',
      websiteUrl: 'https://example.test',
      updatedAt: '2026-06-30T02:00:00.000Z',
    },
    existingClaims: [],
    expectedClaimIds: [],
  };
}

function detailBackend(value: CandidateDetailData): CandidateDetailBackend {
  return {
    async loadDetail() {
      return value;
    },
  };
}

const targetBackend: CandidateCanonicalTargetSearchBackend = {
  async searchTargets(candidateType, query, limit) {
    expect(candidateType).toBe('physical_place');
    expect(query).toBe('Example Cafe');
    expect(limit).toBe(10);
    return [target()];
  },
};

const context = {
  actorId: 'admin:reviewer',
  actorType: 'human' as const,
  capabilities: ['candidate:read' as const],
};

describe('Candidate canonical target selection', () => {
  it('returns a bounded comparison response for an eligible Candidate', async () => {
    const response = await searchCandidateCanonicalTargets(
      context,
      detailBackend(detail()),
      targetBackend,
      candidateId,
      { query: 'Example Cafe', limit: 10 },
      now,
    );

    expect(response.generatedAt).toBe(now.toISOString());
    expect(response.detail.candidate.id).toBe(candidateId);
    expect(response.targets).toEqual([target()]);
  });

  it('blocks target search while duplicate review remains open', async () => {
    await expect(
      searchCandidateCanonicalTargets(
        context,
        detailBackend(
          detail({
            duplicateSignal: true,
            duplicateGroupId: '50000000-0000-4000-8000-000000000001',
            duplicateGroupStatus: 'open',
          }),
        ),
        targetBackend,
        candidateId,
        { query: 'Example Cafe', limit: 10 },
        now,
      ),
    ).rejects.toMatchObject({ code: 'candidate_not_eligible' });
  });

  it('rejects undersized search queries before calling the backend', async () => {
    let called = false;
    await expect(
      searchCandidateCanonicalTargets(
        context,
        detailBackend(detail()),
        {
          async searchTargets() {
            called = true;
            return [];
          },
        },
        candidateId,
        { query: 'E', limit: 10 },
        now,
      ),
    ).rejects.toBeInstanceOf(CandidateCanonicalTargetSearchError);
    expect(called).toBe(false);
  });
});
