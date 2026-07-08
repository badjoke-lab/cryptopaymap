import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidatePromotionWorkspaceResponse } from '../src/admin/promotion/workspace';
import { CandidatePromotionEditor } from '../src/components/admin/CandidatePromotionEditor';

const candidateId = '10000000-0000-4000-8000-000000000001';
const now = '2026-07-01T00:00:00.000Z';

function workspace(eligible = true): CandidatePromotionWorkspaceResponse {
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
        duplicateSignal: !eligible,
        duplicateGroupId: eligible ? null : '30000000-0000-4000-8000-000000000001',
        duplicateGroupStatus: eligible ? null : 'open',
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
            phone: '+81 3 0000 0000',
            description: 'Reviewed source description.',
            openingHours: 'Mon-Fri 08:00-18:00',
            amenities: ['wifi', 'outdoor-seating'],
            socialLinks: [
              {
                platform: 'instagram',
                url: 'https://social.example.test/cafe',
                handle: '@cafe',
              },
              { platform: 'x', url: null, handle: '@cafe' },
            ],
            osmType: null,
            osmId: null,
            paymentTags: {},
            legacyVerificationLabel: null,
          },
        },
      ],
      sourcesTruncated: false,
    },
    eligible,
    eligibilityIssues: eligible ? [] : ['duplicate_review_open'],
    registries: {
      assets: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          slug: 'bitcoin',
          name: 'Bitcoin',
          label: 'BTC — Bitcoin',
        },
      ],
      networks: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          slug: 'bitcoin',
          name: 'Bitcoin',
          label: 'Bitcoin',
        },
      ],
      paymentMethods: [
        {
          id: '60000000-0000-4000-8000-000000000001',
          slug: 'onchain',
          name: 'On-chain',
          label: 'On-chain',
        },
      ],
      processors: [],
    },
  };
}

beforeEach(() => {
  window.history.replaceState({}, '', `/admin/candidates/promotion/?id=${candidateId}`);
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => '70000000-0000-4000-8000-000000000001'),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Candidate promotion editor', () => {
  it('renders practical profile controls from the B1 source snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(workspace()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    render(<CandidatePromotionEditor />);

    expect(await screen.findByRole('heading', { name: 'Example Cafe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create hidden canonical records' })).toBeEnabled();
    expect(screen.getByDisplayValue('1 Main Street')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+81 3 0000 0000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Reviewed source description.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mon-Fri 08:00-18:00')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Amenities' })).toHaveValue(
      'wifi\noutdoor-seating',
    );
    expect(screen.getByRole('textbox', { name: 'Official social links' })).toHaveValue(
      'instagram | https://social.example.test/cafe | @cafe',
    );
    expect(screen.getByRole('heading', { name: 'Source-only social values' })).toBeInTheDocument();
    expect(screen.getByText('x: @cafe')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'BTC — Bitcoin' })).toBeInTheDocument();
  });

  it('disables mutation controls while duplicate review remains open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(workspace(false)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    render(<CandidatePromotionEditor />);

    expect(
      await screen.findByRole('heading', { name: 'Promotion is blocked' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Duplicate Review Open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create hidden canonical records' })).toBeDisabled();
  });
});
