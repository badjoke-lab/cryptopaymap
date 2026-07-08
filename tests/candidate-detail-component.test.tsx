import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandidateDetailResponse } from '../src/admin/candidates/detail';
import { ReviewCandidate } from '../src/components/admin/ReviewCandidate';

const candidateId = '00000000-0000-4000-8000-000000000001';

function detailResponse(): CandidateDetailResponse {
  return {
    generatedAt: '2026-06-29T00:00:00.000Z',
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
        id: '00000000-0000-4000-8000-000000000002',
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
          name: 'Example Cafe source',
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
          description: 'Source-reviewed practical description.',
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('ReviewCandidate', () => {
  it('loads and displays a validated Candidate and practical allowlisted provenance', async () => {
    window.history.replaceState({}, '', `/admin/candidates/detail/?id=${candidateId}`);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(detailResponse()));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReviewCandidate />);

    expect(screen.getByRole('heading', { name: 'Loading Candidate detail' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Example Cafe' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Legacy physical import' })).toBeInTheDocument();
    expect(screen.getByText('Open Database License')).toBeInTheDocument();
    expect(screen.getByText('Example Cafe source')).toBeInTheDocument();
    expect(screen.getByText('+81 3 0000 0000')).toBeInTheDocument();
    expect(screen.getByText('Source-reviewed practical description.')).toBeInTheDocument();
    expect(screen.getByText('Mon-Fri 08:00-18:00')).toBeInTheDocument();
    expect(screen.getByText('wifi, outdoor-seating')).toBeInTheDocument();
    expect(screen.getByText('x: @examplecafe')).toBeInTheDocument();
    expect(screen.queryByText('privateExtra')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/admin/api/candidates/${candidateId}`);
  });

  it('requires a Candidate identifier without calling the endpoint', async () => {
    window.history.replaceState({}, '', '/admin/candidates/detail/');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(detailResponse()));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReviewCandidate />);

    expect(
      await screen.findByRole('heading', { name: 'Candidate identifier required' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on denied and invalid responses', async () => {
    window.history.replaceState({}, '', `/admin/candidates/detail/?id=${candidateId}`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'candidate_detail_denied' }, 403)),
    );
    const { unmount } = render(<ReviewCandidate />);
    expect(
      await screen.findByRole('heading', { name: 'Candidate detail access denied' }),
    ).toBeInTheDocument();
    unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ generatedAt: 'invalid' })),
    );
    render(<ReviewCandidate />);
    expect(
      await screen.findByRole('heading', {
        name: 'Candidate response could not be verified',
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Example Cafe')).not.toBeInTheDocument();
    });
  });

  it('retries an unavailable detail and renders the verified response', async () => {
    window.history.replaceState({}, '', `/admin/candidates/detail/?id=${candidateId}`);
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({}));
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'candidate_detail_unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse(detailResponse()));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReviewCandidate />);
    expect(
      await screen.findByRole('heading', { name: 'Candidate detail unavailable' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry detail' }));

    expect(await screen.findByRole('heading', { name: 'Example Cafe' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
