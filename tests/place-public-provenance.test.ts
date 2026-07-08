import { describe, expect, it } from 'vitest';
import {
  buildPublicPlaceProvenance,
  PublicPlaceProvenanceError,
  type PublicPlaceFieldProvenanceRow,
} from '../src/publication/place-provenance';

const entityId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000001';
const sourceRecordId = '30000000-0000-4000-8000-000000000001';
const secondSourceRecordId = '30000000-0000-4000-8000-000000000002';

function row(
  subjectType: PublicPlaceFieldProvenanceRow['subjectType'],
  subjectId: string,
  fieldPath: string,
  sourceRecord = sourceRecordId,
): PublicPlaceFieldProvenanceRow {
  return {
    subjectType,
    subjectId,
    fieldPath,
    sourceRecordId: sourceRecord,
    provenanceRole: 'origin',
  };
}

const sources = [
  {
    sourceRecordId,
    sourceName: 'Reviewed Cafe official profile',
    sourceUrl: 'https://example.test/tokyo',
    licenseSlug: null,
    attribution: null,
  },
  {
    sourceRecordId: secondSourceRecordId,
    sourceName: 'Official social account',
    sourceUrl: 'https://social.example.test/reviewed-cafe',
    licenseSlug: null,
    attribution: null,
  },
];

describe('public Place provenance builder', () => {
  it('groups public Entity and Location field paths by resolved source record', () => {
    const result = buildPublicPlaceProvenance({
      entityId,
      locationId,
      sourceRecords: sources,
      rows: [
        row('entity', entityId, 'name'),
        row('location', locationId, 'description'),
        row('location', locationId, 'openingHours'),
        row('location', locationId, 'amenities'),
        row('location', locationId, 'socialLinks', secondSourceRecordId),
      ],
    });

    expect(result).toEqual([
      {
        sourceName: 'Official social account',
        sourceUrl: 'https://social.example.test/reviewed-cafe',
        licenseSlug: null,
        attribution: null,
        fields: ['socialLinks'],
      },
      {
        sourceName: 'Reviewed Cafe official profile',
        sourceUrl: 'https://example.test/tokyo',
        licenseSlug: null,
        attribution: null,
        fields: ['amenities', 'description', 'name', 'openingHours'],
      },
    ]);
  });

  it('excludes private and unrelated field paths from the public provenance projection', () => {
    const result = buildPublicPlaceProvenance({
      entityId,
      locationId,
      sourceRecords: sources,
      rows: [
        row('location', locationId, 'description'),
        row('location', locationId, 'privateReviewNote'),
        row('acceptance_claim', '40000000-0000-4000-8000-000000000001', 'howToPay'),
        row('location', '50000000-0000-4000-8000-000000000001', 'phone'),
      ],
    });

    expect(result).toEqual([
      {
        sourceName: 'Reviewed Cafe official profile',
        sourceUrl: 'https://example.test/tokyo',
        licenseSlug: null,
        attribution: null,
        fields: ['description'],
      },
    ]);
  });

  it('fails closed when a public field row lacks resolved source metadata', () => {
    expect(() =>
      buildPublicPlaceProvenance({
        entityId,
        locationId,
        sourceRecords: [],
        rows: [row('location', locationId, 'openingHours')],
      }),
    ).toThrow(PublicPlaceProvenanceError);
  });

  it('deduplicates repeated field rows before public projection', () => {
    const result = buildPublicPlaceProvenance({
      entityId,
      locationId,
      sourceRecords: sources,
      rows: [
        row('location', locationId, 'amenities'),
        row('location', locationId, 'amenities'),
      ],
    });

    expect(result[0]?.fields).toEqual(['amenities']);
  });
});
