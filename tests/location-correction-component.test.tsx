import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocationCorrectionWorkspaceResponse } from '../src/admin/location-correction/workspace';
import { LocationCorrectionEditor } from '../src/components/admin/LocationCorrectionEditor';

const candidateId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const now = '2026-07-08T00:00:00.000Z';

function workspace(): LocationCorrectionWorkspaceResponse {
  return {
    generatedAt: now,
    candidate: {
      generatedAt: now,
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
          sourceType: 'official_site',
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

beforeEach(() => {
  window.history.replaceState(
    {},
    '',
    `/admin/candidates/location-correction/?candidateId=${candidateId}&locationId=${locationId}`,
  );
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => requestId) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Location correction editor', () => {
  it('loads current values and submits one field correction with explicit source assignment', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            requestId,
            locationId,
            appliedFieldPaths: ['phone'],
            decidedAt: now,
            updatedAt: now,
            state: 'committed',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(workspace()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<LocationCorrectionEditor />);
    await screen.findByRole('heading', { name: 'Reviewed Cafe Tokyo' });

    const phoneHeading = screen.getByRole('heading', { name: 'Phone' });
    const phoneSection = phoneHeading.closest('section');
    expect(phoneSection).not.toBeNull();
    await user.selectOptions(within(phoneSection!).getByRole('combobox'), 'set');
    const phoneInput = within(phoneSection!).getByRole('textbox');
    await user.clear(phoneInput);
    await user.type(phoneInput, '+81 3 2222 2222');

    await user.type(
      screen.getByRole('textbox', { name: 'Public summary' }),
      'Updated phone from reviewed official source.',
    );
    await user.click(screen.getByRole('button', { name: 'Commit reviewed correction' }));

    expect(await screen.findByText(/Committed correction for Phone/)).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall).toBeDefined();
    const init = postCall?.[1];
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      expectedCandidateUpdatedAt: '2026-07-07T00:00:00.000Z',
      expectedLocationUpdatedAt: '2026-07-06T00:00:00.000Z',
      changes: { phone: { operation: 'set', value: '+81 3 2222 2222' } },
      sourceRecordIds: [sourceId],
      provenanceAssignments: [{ fieldPath: 'phone', sourceRecordIds: [sourceId] }],
    });
  });

  it('recovers from a failed workspace load through the explicit retry action', async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(JSON.stringify({ error: 'location_correction_unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(workspace()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<LocationCorrectionEditor />);
    await screen.findByRole('heading', { name: 'Location correction unavailable' });
    await user.click(screen.getByRole('button', { name: 'Retry workspace' }));

    expect(await screen.findByRole('heading', { name: 'Reviewed Cafe Tokyo' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
