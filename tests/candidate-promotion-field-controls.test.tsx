import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidatePromotionWorkspaceResponse } from '../src/admin/promotion/workspace';
import { CandidatePromotionForm } from '../src/components/admin/CandidatePromotionForm';

const candidateId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const assetId = '30000000-0000-4000-8000-000000000001';
const networkId = '40000000-0000-4000-8000-000000000001';
const methodId = '50000000-0000-4000-8000-000000000001';
const now = '2026-07-01T00:00:00.000Z';

function workspace(): CandidatePromotionWorkspaceResponse {
  return {
    generatedAt: now,
    detail: {
      generatedAt: now,
      candidate: {
        id: candidateId,
        name: 'Example Service',
        candidateType: 'online_service',
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
          id: sourceId,
          relationship: 'origin',
          sourceName: 'Official announcement',
          sourceType: 'official_website',
          sourceActive: true,
          sourceUrl: 'https://example.test/source',
          archiveUrl: null,
          observedAt: null,
          publishedAt: null,
          fetchedAt: now,
          license: null,
          snapshot: null,
        },
      ],
      sourcesTruncated: false,
    },
    eligible: true,
    eligibilityIssues: [],
    registries: {
      assets: [{ id: assetId, slug: 'bitcoin', name: 'Bitcoin', label: 'BTC — Bitcoin' }],
      networks: [{ id: networkId, slug: 'bitcoin', name: 'Bitcoin', label: 'Bitcoin' }],
      paymentMethods: [
        { id: methodId, slug: 'onchain', name: 'On-chain', label: 'On-chain' },
      ],
      processors: [],
    },
  };
}

beforeEach(() => {
  let sequence = 0;
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => {
      sequence += 1;
      return `60000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Candidate promotion field source controls', () => {
  it('sends explicit field provenance assignments with the promotion request', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          requestId: '70000000-0000-4000-8000-000000000001',
          candidateId,
          entityId: '60000000-0000-4000-8000-000000000002',
          locationId: null,
          claimId: '60000000-0000-4000-8000-000000000003',
          claimAssetIds: ['60000000-0000-4000-8000-000000000001'],
          canonicalPath: '/service/example-service',
          claimStatus: 'candidate',
          visibility: 'hidden',
          promotedAt: now,
          state: 'committed',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<CandidatePromotionForm workspace={workspace()} reload={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Field source assignments' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Asset'), assetId);
    await user.selectOptions(screen.getByLabelText('Network'), networkId);
    await user.selectOptions(screen.getByLabelText('Payment method'), methodId);

    await waitFor(() => {
      const hidden = document.querySelector<HTMLInputElement>(
        'input[name="provenanceSelections"]',
      );
      expect(hidden?.value).toContain(sourceId);
    });

    await user.click(screen.getByRole('button', { name: 'Create hidden canonical records' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String((request as RequestInit | undefined)?.body)) as {
      provenanceAssignments: Array<{
        subjectType: string;
        fieldPath: string;
        sourceRecordIds: string[];
        provenanceRole: string;
      }>;
    };

    expect(body.provenanceAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectType: 'entity',
          fieldPath: 'name',
          sourceRecordIds: [sourceId],
          provenanceRole: 'origin',
        }),
        expect.objectContaining({
          subjectType: 'acceptance_claim',
          fieldPath: 'merchantReceives',
        }),
        expect.objectContaining({
          subjectType: 'claim_asset',
          fieldPath: 'paymentMethodId',
        }),
      ]),
    );
  });
});
