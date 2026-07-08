import { describe, expect, it } from 'vitest';
import { createPhysicalPlaceImportPlan } from '../src/importers/physical-place';

const envelopeBase = {
  sourceId: '11111111-1111-4111-8111-111111111111',
  licenseId: '22222222-2222-4222-8222-222222222222',
  importBatchId: '33333333-3333-4333-8333-333333333333',
  fetchedAt: '2026-06-27T00:00:00Z',
  importerVersion: '1.0.0',
};

function record(index: number) {
  return {
    legacyId: `legacy-${index}`,
    legacyPath: `/place/legacy-${index}`,
    name: `Example Place ${index}`,
    addressLine: `${index} Example Street`,
    locality: 'Tokyo',
    region: 'Tokyo',
    postalCode: '100-0001',
    countryCode: 'JP',
    latitude: 35.68 + index / 10_000,
    longitude: 139.76 + index / 10_000,
    category: 'cafe',
    websiteUrl: `https://example.com/${index}`,
    osmType: 'node',
    osmId: String(1_000 + index),
    paymentTags: { 'payment:bitcoin': 'yes' },
    observedAt: '2026-06-20T00:00:00Z',
    sourceUrl: null,
    legacyVerificationLabel: 'listed',
  };
}

describe('physical-place candidate importer', () => {
  it('imports ten legacy rows only into private candidate-layer drafts', async () => {
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: Array.from({ length: 10 }, (_, index) => record(index + 1)),
    });

    expect(plan.summary).toMatchObject({
      inputCount: 10,
      acceptedCount: 10,
      rejectedCount: 0,
      automaticConfirmedCount: 0,
    });
    expect(plan.drafts).toHaveLength(10);
    expect(
      plan.drafts.every(
        (draft) =>
          draft.candidate.candidateStatus === 'new' &&
          draft.candidate.canonicalEntityId === null &&
          draft.candidate.canonicalLocationId === null &&
          draft.legacyMapping.migrationStatus === 'pending',
      ),
    ).toBe(true);
    expect(plan.drafts.some((draft) => Object.hasOwn(draft, 'acceptanceClaim'))).toBe(false);
  });

  it('produces deterministic candidate and source identities', async () => {
    const envelope = { ...envelopeBase, records: [record(1), record(2)] };
    const left = await createPhysicalPlaceImportPlan(envelope);
    const right = await createPhysicalPlaceImportPlan(envelope);

    expect(left.inputChecksum).toBe(right.inputChecksum);
    expect(left.drafts.map((draft) => draft.candidateId)).toEqual(
      right.drafts.map((draft) => draft.candidateId),
    );
    expect(left.drafts.map((draft) => draft.sourceRecordId)).toEqual(
      right.drafts.map((draft) => draft.sourceRecordId),
    );
  });

  it('preserves raw source values separately from normalized values', async () => {
    const rawRecord = {
      ...record(1),
      name: '  Example Place 1  ',
      countryCode: 'jp',
    };
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: [rawRecord],
    });
    const rawPayload = plan.drafts[0]?.sourceRecord.rawPayload as {
      rawRecord: Record<string, unknown>;
      normalizedRecord: Record<string, unknown>;
    };

    expect(rawPayload.rawRecord.name).toBe('  Example Place 1  ');
    expect(rawPayload.rawRecord.countryCode).toBe('jp');
    expect(rawPayload.normalizedRecord.name).toBe('Example Place 1');
    expect(rawPayload.normalizedRecord.countryCode).toBe('JP');
    expect(plan.drafts[0]?.reviewData.name).toBe('Example Place 1');
    expect(plan.drafts[0]?.reviewData.countryCode).toBe('JP');
  });

  it('normalizes practical legacy aliases into private review data without inventing social URLs', async () => {
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: [
        {
          ...record(1),
          websiteUrl: undefined,
          social_website: 'https://legacy.example.test',
          phone: '  +81 3 0000 0000  ',
          about: '  Legacy source description.  ',
          opening_hours: '  Mon-Fri 08:00-18:00  ',
          amenities: 'wifi, outdoor-seating, wifi',
          twitter: '@legacycafe',
          social_twitter: '@legacycafe',
          instagram: 'https://instagram.example.test/legacycafe',
          socialLinks: [
            {
              platform: 'Mastodon',
              url: 'https://social.example.test/@legacycafe',
              handle: '@legacycafe',
            },
          ],
        },
      ],
    });

    expect(plan.summary.rejectedCount).toBe(0);
    expect(plan.drafts[0]?.reviewData).toMatchObject({
      websiteUrl: 'https://legacy.example.test',
      phone: '+81 3 0000 0000',
      description: 'Legacy source description.',
      openingHours: 'Mon-Fri 08:00-18:00',
      amenities: ['wifi', 'outdoor-seating'],
      socialLinks: [
        {
          platform: 'mastodon',
          url: 'https://social.example.test/@legacycafe',
          handle: '@legacycafe',
        },
        { platform: 'x', url: null, handle: '@legacycafe' },
        {
          platform: 'instagram',
          url: 'https://instagram.example.test/legacycafe',
          handle: null,
        },
      ],
    });

    const rawPayload = plan.drafts[0]?.sourceRecord.rawPayload as {
      rawRecord: Record<string, unknown>;
      normalizedRecord: Record<string, unknown>;
    };
    expect(rawPayload.rawRecord.about).toBe('  Legacy source description.  ');
    expect(rawPayload.normalizedRecord).not.toHaveProperty('about');
    expect(rawPayload.normalizedRecord.description).toBe('Legacy source description.');
  });

  it('uses nullable practical review fields when legacy rows do not provide them', async () => {
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: [record(1)],
    });

    expect(plan.drafts[0]?.reviewData).toMatchObject({
      phone: null,
      description: null,
      openingHours: null,
      amenities: null,
      socialLinks: [],
    });
  });

  it('rejects malformed practical values and unknown private fields without aborting valid rows', async () => {
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: [
        record(1),
        { ...record(2), amenities: ['wifi', { privateNote: 'must not pass' }] },
        { ...record(3), twitter: 'ftp://example.test/account' },
        { ...record(4), submitterEmail: 'private@example.test' },
      ],
    });

    expect(plan.summary.acceptedCount).toBe(1);
    expect(plan.summary.rejectedCount).toBe(3);
    expect(plan.rejections.every((rejection) => rejection.reason === 'invalid_record')).toBe(true);
  });

  it('collapses exact replays and rejects conflicting legacy identities', async () => {
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: [record(1), record(1), { ...record(1), name: 'Conflicting Name' }],
    });

    expect(plan.summary.acceptedCount).toBe(1);
    expect(plan.summary.replayedCount).toBe(1);
    expect(plan.summary.rejectedCount).toBe(1);
    expect(plan.rejections[0]?.reason).toBe('conflicting_legacy_identity');
  });

  it('emits review signals instead of merging shared OSM identities', async () => {
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: [record(1), { ...record(2), osmId: record(1).osmId }],
    });

    expect(plan.drafts).toHaveLength(2);
    expect(plan.duplicateSignals).toContainEqual(
      expect.objectContaining({ reason: 'shared_osm_identity', strength: 'strong' }),
    );
    expect(new Set(plan.drafts.map((draft) => draft.candidateId)).size).toBe(2);
  });

  it('rejects unsafe rows without aborting valid rows in the same batch', async () => {
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: [record(1), { ...record(2), longitude: 999 }, { ...record(3), name: '<b>bad</b>' }],
    });

    expect(plan.summary.acceptedCount).toBe(1);
    expect(plan.summary.rejectedCount).toBe(2);
    expect(plan.rejections.every((rejection) => rejection.reason === 'invalid_record')).toBe(true);
  });

  it('preserves payment tags without creating network, method, or Confirmed claims', async () => {
    const plan = await createPhysicalPlaceImportPlan({
      ...envelopeBase,
      records: [
        {
          ...record(1),
          paymentTags: {
            'payment:bitcoin': 'yes',
            'payment:lightning': 'yes',
            'payment:cryptocurrencies': 'yes',
          },
        },
      ],
    });

    expect(plan.drafts[0]?.reviewData.affirmativePaymentSignals).toEqual([
      'payment:bitcoin',
      'payment:cryptocurrencies',
      'payment:lightning',
    ]);
    expect(plan.drafts[0]?.reviewData.requiresAcceptanceReview).toBe(true);
    expect(plan.summary.automaticConfirmedCount).toBe(0);
  });
});
