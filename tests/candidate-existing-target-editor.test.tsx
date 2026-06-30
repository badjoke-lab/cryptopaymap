import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateCanonicalTargetSearchResponse } from '../src/admin/promotion/target-selection';
import type { CandidatePromotionWorkspaceResponse } from '../src/admin/promotion/workspace';
import { CandidateExistingTargetEditor } from '../src/components/admin/CandidateExistingTargetEditor';

const candidateId = '10000000-0000-4000-8000-000000000001';
const now = '2026-07-01T00:00:00.000Z';

function workspace(): CandidatePromotionWorkspaceResponse {
  return {
    generatedAt: now,
    detail: {
      generatedAt: now,
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
    },
    eligible: true,
    eligibilityIssues: [],
    registries: {
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
    },
  };
}

function targetResponse(): CandidateCanonicalTargetSearchResponse {
  const detail = workspace().detail;
  return {
    generatedAt: now,
    detail,
    query: 'Example Cafe',
    targets: [
      {
        canonicalPath: '/place/example-cafe',
        entity: {
          id: '60000000-0000-4000-8000-000000000001',
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
          id: '70000000-0000-4000-8000-000000000001',
          entityId: '60000000-0000-4000-8000-000000000001',
          name: 'Example Cafe Main Store',
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
      },
    ],
  };
}

beforeEach(() => {
  window.history.replaceState({}, '', `/admin/candidates/existing-target/?id=${candidateId}`);
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => '80000000-0000-4000-8000-000000000001'),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Candidate existing-target editor', () => {
  it('searches, compares, and explicitly selects one canonical target', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/targets?') ? targetResponse() : workspace();
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<CandidateExistingTargetEditor />);

    await screen.findByRole('heading', { name: 'Example Cafe' });
    await user.click(screen.getByRole('button', { name: 'Search targets' }));
    expect(
      await screen.findByRole('heading', { name: 'Example Cafe Main Store' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select target' }));

    expect(screen.getByText('Selected existing target')).toBeInTheDocument();
    expect(screen.getAllByText('/place/example-cafe').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Link Candidate to selected target' })).toBeEnabled();
  });
});
