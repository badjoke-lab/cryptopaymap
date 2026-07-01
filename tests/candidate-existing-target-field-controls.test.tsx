import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateCanonicalTargetOption } from '../src/admin/promotion/target-selection';
import type { CandidatePromotionWorkspaceResponse } from '../src/admin/promotion/workspace';
import { CandidateExistingTargetForm } from '../src/components/admin/CandidateExistingTargetForm';

const candidateId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const assetId = '30000000-0000-4000-8000-000000000001';
const networkId = '40000000-0000-4000-8000-000000000001';
const methodId = '50000000-0000-4000-8000-000000000001';
const entityId = '60000000-0000-4000-8000-000000000001';
const locationId = '70000000-0000-4000-8000-000000000001';
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
          id: sourceId,
          relationship: 'origin',
          sourceName: 'Legacy import',
          sourceType: 'legacy_import',
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
      paymentMethods: [{ id: methodId, slug: 'onchain', name: 'On-chain', label: 'On-chain' }],
      processors: [],
    },
  };
}

function target(): CandidateCanonicalTargetOption {
  return {
    canonicalPath: '/place/example-cafe',
    entity: {
      id: entityId,
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
      id: locationId,
      entityId,
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
  };
}

beforeEach(() => {
  vi.stubGlobal('FormData', window.FormData);
  let sequence = 0;
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => {
      sequence += 1;
      return `80000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('existing-target field source controls', () => {
  it('submits identity attribution and new-record origin assignments', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            requestId: '90000000-0000-4000-8000-000000000001',
            candidateId,
            entityId,
            locationId,
            claimId: '80000000-0000-4000-8000-000000000001',
            claimAssetIds: ['80000000-0000-4000-8000-000000000002'],
            canonicalPath: '/place/example-cafe',
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

    render(
      <CandidateExistingTargetForm
        workspace={workspace()}
        selectedTarget={target()}
        onConflict={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Existing-target field source assignments' }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Asset'), assetId);
    await user.selectOptions(screen.getByLabelText('Network'), networkId);
    await user.selectOptions(screen.getByLabelText('Payment method'), methodId);

    await waitFor(() => {
      const hidden = document.querySelector<HTMLInputElement>('input[name="provenanceSelections"]');
      expect(hidden?.value).toContain(sourceId);
    });

    const submitButton = screen.getByRole('button', {
      name: 'Link Candidate to selected target',
    });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as {
      provenanceAssignments: Array<{
        subjectType: string;
        subjectId: string;
        fieldPath: string;
        provenanceRole: string;
      }>;
    };

    expect(body.provenanceAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectType: 'entity',
          subjectId: entityId,
          fieldPath: 'name',
          provenanceRole: 'attribution',
        }),
        expect.objectContaining({
          subjectType: 'location',
          subjectId: locationId,
          fieldPath: 'latitude',
          provenanceRole: 'attribution',
        }),
        expect.objectContaining({
          subjectType: 'acceptance_claim',
          fieldPath: 'merchantReceives',
          provenanceRole: 'origin',
        }),
        expect.objectContaining({
          subjectType: 'claim_asset',
          fieldPath: 'paymentMethodId',
          provenanceRole: 'origin',
        }),
      ]),
    );
  });
});
