import { describe, expect, it } from 'vitest';
import type { CandidateDetailBackend, CandidateDetailData } from '../src/admin/candidates/detail';
import {
  loadCandidatePromotionWorkspace,
  type CandidatePromotionRegistryBackend,
} from '../src/admin/promotion/workspace';

const candidateId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
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
        snapshot: {
          kind: 'physical_place',
          name: 'Example Cafe',
          addressLine: '1 Main Street',
          locality: 'Tokyo',
          region: null,
          postalCode: null,
          countryCode: 'JP',
          latitude: 35.68,
          longitude: 139.76,
          category: 'Cafe',
          websiteUrl: 'https://example.test',
          phone: null,
          description: null,
          openingHours: null,
          amenities: null,
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

const registries: CandidatePromotionRegistryBackend = {
  async loadRegistryOptions() {
    return {
      assets: [
        {
          id: '30000000-0000-4000-8000-000000000001',
          slug: 'bitcoin',
          name: 'Bitcoin',
          label: 'BTC — Bitcoin',
        },
      ],
      networks: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          slug: 'bitcoin',
          name: 'Bitcoin',
          label: 'Bitcoin',
        },
      ],
      paymentMethods: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          slug: 'onchain',
          name: 'On-chain',
          label: 'On-chain',
        },
      ],
      processors: [],
    };
  },
};

function backend(value: CandidateDetailData): CandidateDetailBackend {
  return {
    async loadDetail() {
      return value;
    },
  };
}

const context = {
  actorId: 'admin:reviewer',
  actorType: 'human' as const,
  capabilities: ['candidate:read' as const],
};

describe('Candidate promotion workspace', () => {
  it('returns an eligible bounded workspace for a reviewed Candidate', async () => {
    const workspace = await loadCandidatePromotionWorkspace(
      context,
      backend(detail()),
      registries,
      candidateId,
      now,
    );

    expect(workspace.eligible).toBe(true);
    expect(workspace.eligibilityIssues).toEqual([]);
    expect(workspace.detail.sources.map((source) => source.id)).toEqual([sourceId]);
    expect(workspace.registries.assets[0]?.label).toBe('BTC — Bitcoin');
  });

  it('blocks an unresolved duplicate group before the editor can commit', async () => {
    const workspace = await loadCandidatePromotionWorkspace(
      context,
      backend(
        detail({
          duplicateSignal: true,
          duplicateGroupId: '60000000-0000-4000-8000-000000000001',
          duplicateGroupStatus: 'open',
        }),
      ),
      registries,
      candidateId,
      now,
    );

    expect(workspace.eligible).toBe(false);
    expect(workspace.eligibilityIssues).toContain('duplicate_review_open');
  });

  it('blocks truncated provenance because the exact source set is unavailable', async () => {
    const value = detail();
    value.sourcesTruncated = true;
    const workspace = await loadCandidatePromotionWorkspace(
      context,
      backend(value),
      registries,
      candidateId,
      now,
    );

    expect(workspace.eligible).toBe(false);
    expect(workspace.eligibilityIssues).toContain('source_provenance_truncated');
  });
});
