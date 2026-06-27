import { createPhysicalPlaceImportPlan } from '../src/importers/physical-place';

const sourceId = '11111111-1111-4111-8111-111111111111';
const licenseId = '22222222-2222-4222-8222-222222222222';
const importBatchId = '33333333-3333-4333-8333-333333333333';
const fetchedAt = '2026-06-27T00:00:00Z';

function record(index: number) {
  return {
    legacyId: `legacy-place-${index}`,
    legacyPath: `/place/legacy-place-${index}`,
    name: `Example Place ${index}`,
    addressLine: `${index} Example Street`,
    locality: 'Tokyo',
    region: 'Tokyo',
    postalCode: `100-00${String(index).padStart(2, '0')}`,
    countryCode: 'jp',
    latitude: 35.68 + index / 10_000,
    longitude: 139.76 + index / 10_000,
    category: index % 2 === 0 ? 'cafe' : 'shop',
    websiteUrl: `https://example.com/place-${index}`,
    osmType: 'node',
    osmId: String(10_000 + index),
    paymentTags: index % 2 === 0 ? { 'payment:bitcoin': 'yes' } : {},
    observedAt: `2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`,
    sourceUrl: null,
    legacyVerificationLabel: index % 2 === 0 ? 'legacy-listed' : null,
  };
}

const envelope = {
  sourceId,
  licenseId,
  importBatchId,
  fetchedAt,
  importerVersion: '1.0.0',
  records: Array.from({ length: 10 }, (_, index) => record(index + 1)),
};

const plan = await createPhysicalPlaceImportPlan(envelope);
const replayPlan = await createPhysicalPlaceImportPlan(envelope);

if (
  plan.summary.inputCount !== 10 ||
  plan.summary.acceptedCount !== 10 ||
  plan.summary.rejectedCount !== 0 ||
  plan.summary.automaticConfirmedCount !== 0
) {
  throw new Error('The physical importer did not preserve the ten-record candidate-only boundary.');
}

if (
  plan.drafts.some(
    (draft) =>
      draft.candidate.candidateStatus !== 'new' ||
      draft.candidate.canonicalEntityId !== null ||
      draft.candidate.canonicalLocationId !== null ||
      draft.legacyMapping.migrationStatus !== 'pending' ||
      Object.hasOwn(draft, 'acceptanceClaim'),
  )
) {
  throw new Error('A legacy physical record crossed the canonical or Confirmed boundary.');
}

if (
  plan.inputChecksum !== replayPlan.inputChecksum ||
  plan.drafts.some(
    (draft, index) =>
      draft.candidateId !== replayPlan.drafts[index]?.candidateId ||
      draft.sourceRecordId !== replayPlan.drafts[index]?.sourceRecordId,
  )
) {
  throw new Error('Physical import identities are not deterministic.');
}

const duplicateInput = {
  ...envelope,
  records: [record(1), record(1), { ...record(2), legacyId: 'legacy-place-duplicate', osmId: '10001' }],
};
const duplicatePlan = await createPhysicalPlaceImportPlan(duplicateInput);
if (
  duplicatePlan.summary.acceptedCount !== 2 ||
  duplicatePlan.summary.replayedCount !== 1 ||
  !duplicatePlan.duplicateSignals.some((signal) => signal.reason === 'shared_osm_identity')
) {
  throw new Error('Replay or duplicate-signal handling failed.');
}

const invalidPlan = await createPhysicalPlaceImportPlan({
  ...envelope,
  records: [{ ...record(1), latitude: 190 }, { ...record(2), name: '<script>bad</script>' }],
});
if (invalidPlan.summary.rejectedCount !== 2 || invalidPlan.summary.acceptedCount !== 0) {
  throw new Error('Invalid physical records were not quarantined as rejections.');
}

console.log('Physical-place importer checks passed.');
