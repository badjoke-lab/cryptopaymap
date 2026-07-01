import { describe, expect, it } from 'vitest';
import {
  buildNewTargetFieldProvenancePlan,
  newTargetFieldDescriptors,
  type PromotionFieldSourceSelections,
} from '../src/admin/promotion/field-source-selection';

const sourceId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const claimId = '30000000-0000-4000-8000-000000000001';
const assetId = '40000000-0000-4000-8000-000000000001';

function selections(keys: readonly string[]): PromotionFieldSourceSelections {
  return Object.fromEntries(keys.map((key) => [key, [sourceId]]));
}

function input(fieldSelections: PromotionFieldSourceSelections) {
  return {
    selections: fieldSelections,
    entity: {
      id: entityId,
      value: {
        name: 'Example Service',
        legalName: null,
        websiteUrl: null,
        countryCode: 'JP',
      },
    },
    location: null,
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
        id: assetId,
        selectionKey: 'asset-row-1',
        value: {
          assetId: '50000000-0000-4000-8000-000000000001',
          networkId: '60000000-0000-4000-8000-000000000001',
          paymentMethodId: '70000000-0000-4000-8000-000000000001',
          contractAddress: null,
          notes: null,
        },
      },
    ],
  };
}

describe('promotion field source selection', () => {
  it('builds origin assignments for every non-null factual field', () => {
    const descriptors = newTargetFieldDescriptors(false, ['asset-row-1']);
    const result = buildNewTargetFieldProvenancePlan(
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
          provenanceRole: 'origin',
        }),
        expect.objectContaining({
          subjectType: 'acceptance_claim',
          subjectId: claimId,
          fieldPath: 'merchantReceives',
        }),
        expect.objectContaining({
          subjectType: 'claim_asset',
          subjectId: assetId,
          fieldPath: 'paymentMethodId',
        }),
      ]),
    );
  });

  it('reports a non-null field when all of its sources are cleared', () => {
    const descriptors = newTargetFieldDescriptors(false, ['asset-row-1']);
    const selected = selections(descriptors.map((field) => field.key));
    selected['entity.name'] = [];

    const result = buildNewTargetFieldProvenancePlan(input(selected));

    expect(result.missingFields).toContain('Name');
    expect(result.assignments).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectType: 'entity', fieldPath: 'name' }),
      ]),
    );
  });

  it('creates stable field keys for physical and asset rows', () => {
    const keys = newTargetFieldDescriptors(true, ['asset-a', 'asset-b']).map(
      (field) => field.key,
    );

    expect(keys).toContain('location.latitude');
    expect(keys).toContain('asset:asset-a.assetId');
    expect(keys).toContain('asset:asset-b.paymentMethodId');
  });
});
