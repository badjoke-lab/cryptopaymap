import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EvidenceReviewDetailResponse,
  EvidenceReviewQueueResponse,
} from '../src/admin/evidence-review/workspace';
import { EvidenceReviewDetail } from '../src/components/admin/EvidenceReviewDetail';
import { EvidenceReviewQueue } from '../src/components/admin/EvidenceReviewQueue';

const evidenceId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const claimAssetId = '40000000-0000-4000-8000-000000000001';
const now = '2026-07-02T00:00:00.000Z';

function queue(): EvidenceReviewQueueResponse {
  return {
    generatedAt: now,
    query: { reviewStatus: 'pending', limit: 50 },
    hasMore: false,
    items: [
      {
        id: evidenceId,
        claimId,
        claimStatus: 'candidate',
        claimVisibility: 'hidden',
        evidenceKind: 'official_payment_page',
        evidenceClass: 'a',
        sourceType: 'official_page',
        originRole: 'merchant_side',
        polarity: 'supporting',
        reviewStatus: 'pending',
        visibility: 'private',
        sourceName: 'Official payment page',
        sourceUrl: 'https://example.test/payments',
        observedAt: '2026-07-01T00:00:00.000Z',
        publishedAt: null,
        summary: 'The merchant states that direct crypto payments are accepted.',
        updatedAt: '2026-07-01T12:00:00.000Z',
      },
    ],
  };
}

function detail(): EvidenceReviewDetailResponse {
  const item = queue().items[0];
  if (item === undefined) throw new Error('Missing fixture item.');
  return {
    generatedAt: now,
    evidence: {
      ...item,
      archiveUrl: null,
      sourceNativeId: null,
      fetchedAt: now,
      attribution: null,
      independenceKey: null,
    },
    claim: {
      id: claimId,
      claimStatus: 'candidate',
      visibility: 'hidden',
      routeType: 'direct_wallet',
      acceptanceScope: 'all_checkout',
      customerPaysCrypto: true,
      merchantExplicitlyAcceptsCrypto: true,
      howToPay: 'Scan the merchant wallet QR code.',
      merchantReceives: 'crypto',
      restrictions: null,
      firstConfirmedAt: null,
      lastConfirmedAt: null,
      nextReviewAt: null,
      endedAt: null,
      endedReason: null,
      updatedAt: '2026-07-01T12:00:00.000Z',
    },
    paymentCombinations: [
      {
        id: claimAssetId,
        assetSymbol: 'BTC',
        assetStatus: 'active',
        networkSlug: 'lightning',
        networkStatus: 'active',
        paymentMethodSlug: 'lightning_invoice',
        paymentMethodStatus: 'active',
        isPrimary: true,
      },
    ],
    paymentPrerequisites: {
      eligible: true,
      issues: [],
    },
    acceptedEvidence: [],
    threshold: {
      eligible: false,
      basis: null,
      supportingEvidenceIds: [],
      latestContradictionAt: null,
    },
  };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/admin/evidence/');
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => '30000000-0000-4000-8000-000000000001'),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Evidence review components', () => {
  it('renders protected Evidence summaries from a validated queue response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(queue()), { status: 200 })),
    );

    render(<EvidenceReviewQueue />);

    expect(await screen.findByRole('heading', { name: 'Evidence summaries' })).toBeInTheDocument();
    expect(screen.getByText('Official payment page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Evidence' })).toHaveAttribute(
      'href',
      `/admin/evidence/detail/?id=${evidenceId}`,
    );
  });

  it('submits exact Evidence, Claim, accepted-set, and Claim Asset expectations', async () => {
    window.history.replaceState({}, '', `/admin/evidence/detail/?id=${evidenceId}`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(detail()), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            requestId: '30000000-0000-4000-8000-000000000001',
            evidenceId,
            claimId,
            disposition: 'accepted',
            finding: 'supports_claim',
            claimAction: 'confirm',
            evidenceReviewStatus: 'accepted',
            claimStatus: 'confirmed',
            claimVisibility: 'hidden',
            verificationEventType: 'confirmed',
            decidedAt: now,
            state: 'committed',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<EvidenceReviewDetail />);

    expect(await screen.findByRole('heading', { name: 'Evidence decision' })).toBeInTheDocument();
    expect(screen.getByText('Payment prerequisites: Eligible')).toBeInTheDocument();
    expect(screen.getByText(/BTC · Lightning · Lightning Invoice · Primary/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Public summary'), 'The Evidence supports confirmation.');
    const submitButton = screen.getByRole('button', { name: 'Commit Evidence decision' });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      claimId,
      expectedEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
      expectedEvidenceReviewStatus: 'pending',
      expectedClaimUpdatedAt: '2026-07-01T12:00:00.000Z',
      expectedClaimStatus: 'candidate',
      expectedClaimVisibility: 'hidden',
      expectedAcceptedEvidenceIds: [],
      expectedClaimAssetIds: [claimAssetId],
      disposition: 'accepted',
      finding: 'supports_claim',
      claimAction: 'confirm',
    });
  });
});
