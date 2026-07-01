import { describe, expect, it } from 'vitest';
import {
  buildExistingTargetFieldProvenancePlan,
  existingTargetFieldDescriptors,
  type PromotionFieldSourceSelections,
} from '../src/admin/promotion/field-source-selection';

const sourceId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const locationId = '30000000-0000-4000-8000-000000000001';
const claimId = '40000000-0000-4000-8000-000000000001';
const claimAssetId = '50000000-0000-4000-8000-000000000001';

function selections(keys: readonly string[]): PromotionFieldSourceSelections {
  return Object.fromEntries(keys.map((key) => [key, [sourceId]]));
}

function input(fieldSelections: PromotionFieldSourceSelections) {
  return {
    selections: fieldSelections,
    entity: {
      id: entityId,
      value: {
        name: 'Example Cafe Holdings',
        websiteUrl: 'https://example.test',
        countryCode: 'JP',
      },
    },
    location: {
      id: locationId,
      value: {
        name: 'Example Cafe Main Store',
        addressLine: '1 Main Street',
        locality: 'Tokyo',
        region: null,
        postalCode: null,
        countryCode: 'JP',
        latitude: 35.68,
        longitude: 139.76,
        websiteUrl: 'https://example.test',
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
        selectionKey: 'asset-row',
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

describe('existing-target field source selection', () => {
  it('separates existing identity attribution from new Claim origin', () => {
    const descriptors = existingTargetFieldDescriptors(true, ['asset-row']);
    const result = buildExistingTargetFieldProvenancePlan(
      input(selections(descriptors.map((field) => field.key))),
    );

    expect(result.missingFields).toEqual([]);
    expect(result.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectType: 'entity',
          subjectId: entityId,
          fieldPath: 'name',
          sourceRecordIds: [sourceId],
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
          subjectId: claimId,
          fieldPath: 'merchantReceives',
          provenanceRole: 'origin',
        }),
        expect.objectContaining({
          subjectType: 'claim_asset',
          subjectId: claimAssetId,
          fieldPath: 'paymentMethodId',
          provenanceRole: 'origin',
        }),
      ]),
    );
  });

  it('requires at least one existing identity attribution', () => {
    const descriptors = existingTargetFieldDescriptors(true, ['asset-row']);
    const selected = selections(descriptors.map((field) => field.key));
    for (const key of Object.keys(selected)) {
      if (key.startsWith('entity.') || key.startsWith('location.')) selected[key] = [];
    }

    const result = buildExistingTargetFieldProvenancePlan(input(selected));

    expect(result.missingFields).toContain('Existing identity attribution');
  });

  it('requires complete origin coverage for new Claim fields', () => {
    const descriptors = existingTargetFieldDescriptors(true, ['asset-row']);
    const selected = selections(descriptors.map((field) => field.key));
    selected['claim.merchantReceives'] = [];

    const result = buildExistingTargetFieldProvenancePlan(input(selected));

    expect(result.missingFields).toContain('Merchant receives');
  });
});
