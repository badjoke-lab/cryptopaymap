import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconfirmationDetail } from '../src/components/admin/ReconfirmationDetail';
import { ReconfirmationQueue } from '../src/components/admin/ReconfirmationQueue';

const claimId = '20000000-0000-4000-8000-000000000001';
const now = '2026-07-03T00:00:00.000Z';
const queueItem = {
  id: claimId,
  claimStatus: 'confirmed',
  visibility: 'public',
  lastConfirmedAt: '2026-01-01T00:00:00.000Z',
  nextReviewAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  queueReason: 'overdue',
  recommendedAction: 'mark_stale',
  dueAt: '2026-07-01T00:00:00.000Z',
  daysUntilReview: -2,
  priority: 0,
  entityName: 'Example Merchant',
  entityType: 'merchant',
  locationName: 'Example Store',
  locationLocality: 'Tokyo',
  locationCountryCode: 'JP',
} as const;
const detail = {
  generatedAt: now,
  queueItem,
  claim: {
    id: claimId,
    entityId: '30000000-0000-4000-8000-000000000001',
    locationId: '40000000-0000-4000-8000-000000000001',
    entityName: 'Example Merchant',
    entityType: 'merchant',
    entityWebsiteUrl: null,
    entityCountryCode: 'JP',
    locationName: 'Example Store',
    locationSlug: 'example-store',
    locationAddressLine: null,
    locationLocality: 'Tokyo',
    locationRegion: null,
    locationCountryCode: 'JP',
    claimScope: 'location_specific',
    routeType: 'direct_wallet',
    acceptanceScope: 'all_checkout',
    claimStatus: 'confirmed',
    visibility: 'public',
    customerPaysCrypto: true,
    merchantExplicitlyAcceptsCrypto: true,
    howToPay: 'Scan the wallet QR code.',
    merchantReceives: 'crypto',
    restrictions: null,
    firstConfirmedAt: '2026-01-01T00:00:00.000Z',
    lastConfirmedAt: '2026-01-01T00:00:00.000Z',
    nextReviewAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
} as const;

beforeEach(() => {
  window.history.replaceState({}, '', '/admin/rechecks/');
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => '10000000-0000-4000-8000-000000000001'),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Rechecks components', () => {
  it('renders a validated queue item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              generatedAt: now,
              query: { dueSoonDays: 30, limit: 50 },
              items: [queueItem],
              hasMore: false,
            }),
            { status: 200 },
          ),
      ),
    );
    render(<ReconfirmationQueue />);
    expect(await screen.findByText('Example Merchant')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Claim' })).toHaveAttribute(
      'href',
      `/admin/rechecks/detail/?id=${claimId}`,
    );
  });

  it('submits exact Claim expectations without client-owned timing fields', async () => {
    window.history.replaceState({}, '', `/admin/rechecks/detail/?id=${claimId}`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ toStatus: 'stale', state: 'committed' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<ReconfirmationDetail />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Mark Claim stale' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      expectedClaimUpdatedAt: detail.claim.updatedAt,
      expectedClaimStatus: 'confirmed',
      expectedClaimVisibility: 'public',
      expectedNextReviewAt: detail.claim.nextReviewAt,
    });
    expect(body).not.toHaveProperty('effectiveAt');
    expect(body).not.toHaveProperty('reasonCode');
  });
});
