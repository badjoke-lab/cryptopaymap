import { describe, expect, it } from 'vitest';
import { buildCandidateDuplicateSignalPersistencePlan } from '../src/admin/persistence/duplicate-signal-plan';
import { createPhysicalPlaceImportPlan } from '../src/importers/physical-place';

const sourceId = '11111111-1111-4111-8111-111111111111';
const licenseId = '22222222-2222-4222-8222-222222222222';
const importBatchId = '33333333-3333-4333-8333-333333333333';

function record(index: number) {
  return {
    legacyId: `duplicate-place-${index}`,
    legacyPath: `/place/duplicate-place-${index}`,
    name: `Duplicate Place ${index}`,
    addressLine: `${index} Duplicate Street`,
    locality: 'Tokyo',
    region: 'Tokyo',
    postalCode: '100-0001',
    countryCode: 'JP',
    latitude: 35.68 + index / 10_000,
    longitude: 139.76 + index / 10_000,
    category: 'cafe',
    websiteUrl: `https://duplicate-${index}.example.test`,
    osmType: 'node',
    osmId: '999999',
    paymentTags: { 'payment:bitcoin': 'yes' },
    observedAt: '2026-06-28T00:00:00.000Z',
    sourceUrl: null,
    legacyVerificationLabel: null,
  };
}

async function plan(records: ReturnType<typeof record>[]) {
  return createPhysicalPlaceImportPlan({
    sourceId,
    licenseId,
    importBatchId,
    fetchedAt: '2026-06-28T01:00:00.000Z',
    importerVersion: '1.0.0',
    records,
  });
}

describe('duplicate signal persistence plan', () => {
  it('places a connected Candidate component in one deterministic group', async () => {
    const persistence = await buildCandidateDuplicateSignalPersistencePlan(
      await plan([record(1), record(2), record(3)]),
    );

    expect(persistence.groups).toHaveLength(1);
    expect(persistence.signals).toHaveLength(2);
    expect(new Set(persistence.candidateGroupIds.values())).toEqual(
      new Set([persistence.groups[0]?.id]),
    );
    expect(
      persistence.signals.every((signal) => signal.duplicateGroupId === persistence.groups[0]?.id),
    ).toBe(true);
  });

  it('keeps group identity independent of record order and signal identity stable on exact replay', async () => {
    const forwardPlan = await plan([record(1), record(2), record(3)]);
    const forward = await buildCandidateDuplicateSignalPersistencePlan(forwardPlan);
    const replay = await buildCandidateDuplicateSignalPersistencePlan(structuredClone(forwardPlan));
    const reversed = await buildCandidateDuplicateSignalPersistencePlan(
      await plan([record(3), record(2), record(1)]),
    );

    expect(reversed.groups.map((group) => group.id)).toEqual(
      forward.groups.map((group) => group.id),
    );
    expect(replay.signals.map((signal) => signal.id)).toEqual(
      forward.signals.map((signal) => signal.id),
    );
  });

  it('returns no groups or signals when the importer produced no review signal', async () => {
    const first = record(1);
    const second = record(2);
    second.osmId = '1000000';
    const persistence = await buildCandidateDuplicateSignalPersistencePlan(
      await plan([first, second]),
    );

    expect(persistence.groups).toEqual([]);
    expect(persistence.signals).toEqual([]);
    expect(persistence.candidateGroupIds.size).toBe(0);
  });
});
