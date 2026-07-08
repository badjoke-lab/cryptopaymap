import { describe, expect, it } from 'vitest';
import {
  validateNewTargetProvenanceAssignments,
  type PromotionProvenanceAssignment,
} from '../src/admin/promotion/provenance-plan';

const sourceId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const locationId = '30000000-0000-4000-8000-000000000001';
const claimId = '40000000-0000-4000-8000-000000000001';
const claimAssetId = '50000000-0000-4000-8000-000000000001';

function assignment(
  subjectType: PromotionProvenanceAssignment['subjectType'],
  subjectId: string,
  fieldPath: string,
): PromotionProvenanceAssignment {
  return {
    subjectType,
    subjectId,
    fieldPath,
    sourceRecordIds: [sourceId],
    provenanceRole: 'origin',
  };
}

function context() {
  return {
    sourceRecordIds: [sourceId],
    entity: {
      id: entityId,
      value: {
        name: 'Example Cafe',
        legalName: null,
        websiteUrl: null,
        countryCode: 'JP',
      },
    },
    location: {
      id: locationId,
      value: {
        name: 'Example Cafe',
        addressLine: '1 Main Street',
        locality: 'Tokyo',
        region: null,
        postalCode: null,
        countryCode: 'JP',
        latitude: 35.68,
        longitude: 139.76,
        websiteUrl: 'https://example.test',
        phone: '+81 3 0000 0000',
        description: 'Reviewed description.',
        openingHours: 'Mon-Fri 08:00-18:00',
        amenities: ['wifi'],
        socialLinks: [
          {
            platform: 'instagram',
            url: 'https://social.example.test/cafe',
            handle: '@cafe',
          },
        ],
        osmType: null,
        osmId: null,
      },
    },
    claim: {
      id: claimId,
      value: {
        routeType: 'direct_wallet',
        acceptanceScope: 'all_checkout',
        customerPaysCrypto: true,
        merchantExplicitlyAcceptsCrypto: true,
        processorId: null,
        howToPay: null,
        merchantReceives: 'crypto',
        restrictions: null,
      },
    },
    claimAssets: [
      {
        id: claimAssetId,
        value: {
          assetId: '60000000-0000-4000-8000-000000000001',
          networkId: '70000000-0000-4000-8000-000000000001',
          paymentMethodId: '80000000-0000-4000-8000-000000000001',
          contractAddress: null,
          notes: null,
        },
      },
    ],
  };
}

function completeAssignments(): PromotionProvenanceAssignment[] {
  return [
    ...['name', 'countryCode'].map((field) => assignment('entity', entityId, field)),
    ...[
      'name',
      'addressLine',
      'locality',
      'countryCode',
      'latitude',
      'longitude',
      'websiteUrl',
      'phone',
      'description',
      'openingHours',
      'amenities',
      'socialLinks',
    ].map((field) => assignment('location', locationId, field)),
    ...[
      'routeType',
      'acceptanceScope',
      'customerPaysCrypto',
      'merchantExplicitlyAcceptsCrypto',
      'merchantReceives',
    ].map((field) => assignment('acceptance_claim', claimId, field)),
    ...['assetId', 'networkId', 'paymentMethodId'].map((field) =>
      assignment('claim_asset', claimAssetId, field),
    ),
  ];
}

describe('practical Location Promotion provenance', () => {
  it('accepts complete practical-field origin assignments', () => {
    expect(validateNewTargetProvenanceAssignments(completeAssignments(), context())).toEqual([]);
  });

  it('rejects missing practical-field origin assignments', () => {
    const assignments = completeAssignments().filter(
      (row) => !['description', 'amenities', 'socialLinks'].includes(row.fieldPath),
    );

    expect(validateNewTargetProvenanceAssignments(assignments, context())).toEqual(
      expect.arrayContaining([
        'location.description requires at least one origin source assignment',
        'location.amenities requires at least one origin source assignment',
        'location.socialLinks requires at least one origin source assignment',
      ]),
    );
  });

  it('rejects practical-field sources outside the exact Candidate source set', () => {
    const assignments = completeAssignments();
    const description = assignments.find(
      (row) => row.subjectType === 'location' && row.fieldPath === 'description',
    );
    if (!description) throw new Error('Expected description assignment.');
    description.sourceRecordIds = ['90000000-0000-4000-8000-000000000001'];

    expect(validateNewTargetProvenanceAssignments(assignments, context())).toContain(
      'location.description references a source outside the Candidate provenance set',
    );
  });
});
