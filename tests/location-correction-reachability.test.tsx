import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CandidateCanonicalTargetOption } from '../src/admin/promotion/target-selection';
import type { CandidatePromotionWorkspaceResponse } from '../src/admin/promotion/workspace';
import { CandidateExistingTargetForm } from '../src/components/admin/CandidateExistingTargetForm';

const candidateId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000001';

function workspace(): CandidatePromotionWorkspaceResponse {
  return {
    generatedAt: '2026-07-08T00:00:00.000Z',
    detail: {
      generatedAt: '2026-07-08T00:00:00.000Z',
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
          id: '30000000-0000-4000-8000-000000000001',
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
    eligible: true,
    eligibilityIssues: [],
    registries: {
      assets: [],
      networks: [],
      paymentMethods: [],
      processors: [],
    },
  };
}

const target: CandidateCanonicalTargetOption = {
  canonicalPath: '/place/reviewed-cafe-tokyo',
  entity: {
    id: '40000000-0000-4000-8000-000000000001',
    entityType: 'merchant',
    name: 'Reviewed Cafe',
    slug: 'reviewed-cafe',
    websiteUrl: 'https://example.test',
    countryCode: 'JP',
    entityStatus: 'active',
    visibility: 'public',
    updatedAt: '2026-07-06T00:00:00.000Z',
  },
  location: {
    id: locationId,
    entityId: '40000000-0000-4000-8000-000000000001',
    name: 'Reviewed Cafe Tokyo',
    slug: 'reviewed-cafe-tokyo',
    addressLine: '1-1 Example',
    locality: 'Tokyo',
    region: 'Tokyo',
    postalCode: '100-0001',
    countryCode: 'JP',
    latitude: 35.681236,
    longitude: 139.767125,
    locationStatus: 'active',
    visibility: 'public',
    websiteUrl: 'https://example.test',
    updatedAt: '2026-07-06T00:00:00.000Z',
  },
  existingClaims: [],
  expectedClaimIds: [],
};

describe('Location correction operator reachability', () => {
  it('exposes a separate correction workspace route from a selected physical target', () => {
    render(
      <CandidateExistingTargetForm
        workspace={workspace()}
        selectedTarget={target}
        onConflict={() => undefined}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Review practical profile correction separately' }),
    ).toHaveAttribute(
      'href',
      `/admin/candidates/location-correction/?candidateId=${candidateId}&locationId=${locationId}`,
    );
  });
});
