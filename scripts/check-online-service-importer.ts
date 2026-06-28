import { createOnlineServiceImportPlan } from '../src/importers/online-service';

const sourceId = '44444444-4444-4444-8444-444444444444';
const licenseId = '55555555-5555-4555-8555-555555555555';
const importBatchId = '66666666-6666-4666-8666-666666666666';
const fetchedAt = '2026-06-27T00:00:00Z';

function record(index: number) {
  return {
    legacyId: `legacy-online-${index}`,
    legacyPath: `/service/legacy-online-${index}`,
    recordType: index % 4 === 0 ? 'payment_processor' : 'online_service',
    name: `Example Online ${index}`,
    websiteUrl: `https://online-${index}.example.com`,
    countryCode: index % 2 === 0 ? 'US' : null,
    category: index % 4 === 0 ? 'payments' : 'software',
    acceptanceScope: index % 4 === 0 ? null : 'all_checkout',
    routeType: index % 4 === 0 ? null : 'processor_checkout',
    processorName: index % 4 === 0 ? null : 'Example Processor',
    processorUrl: index % 4 === 0 ? null : 'https://processor.example.com',
    assetLabels: index % 4 === 0 ? [] : ['BTC', 'USDC'],
    networkLabels: index % 4 === 0 ? [] : ['Lightning', 'Base'],
    paymentMethodLabels: index % 4 === 0 ? [] : ['processor checkout'],
    scopeNotes: null,
    howToPay:
      index % 4 === 0
        ? null
        : 'Choose cryptocurrency at checkout and follow the processor instructions.',
    evidenceUrls: [`https://online-${index}.example.com/payments`],
    observedAt: `2026-06-${String(10 + index).padStart(2, '0')}T00:00:00Z`,
    sourceUrl: null,
    legacyVerificationLabel: 'legacy-ready',
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

const plan = await createOnlineServiceImportPlan(envelope);
const replayPlan = await createOnlineServiceImportPlan(envelope);

if (
  plan.summary.inputCount !== 10 ||
  plan.summary.acceptedCount !== 10 ||
  plan.summary.rejectedCount !== 0 ||
  plan.summary.automaticConfirmedCount !== 0
) {
  throw new Error('The online importer did not preserve the ten-record candidate-only boundary.');
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
  throw new Error('A legacy online record crossed the canonical or Confirmed boundary.');
}

if (
  plan.inputChecksum !== replayPlan.inputChecksum ||
  plan.drafts.some(
    (draft, index) =>
      draft.candidateId !== replayPlan.drafts[index]?.candidateId ||
      draft.sourceRecordId !== replayPlan.drafts[index]?.sourceRecordId,
  )
) {
  throw new Error('Online import identities are not deterministic.');
}

const outOfScopePlan = await createOnlineServiceImportPlan({
  ...envelope,
  records: [
    { ...record(1), recordType: 'crypto_card' },
    { ...record(2), recordType: 'gift_card' },
    { ...record(3), recordType: 'bill_payment' },
    { ...record(4), recordType: 'exchange' },
    { ...record(5), recordType: 'atm' },
  ],
});
if (outOfScopePlan.drafts.length !== 0 || outOfScopePlan.summary.outOfScopeCount !== 5) {
  throw new Error('Indirect spending or exchange records entered the main candidate directory.');
}

const duplicatePlan = await createOnlineServiceImportPlan({
  ...envelope,
  records: [
    record(1),
    {
      ...record(2),
      websiteUrl: 'https://www.online-1.example.com/checkout',
    },
  ],
});
if (
  duplicatePlan.drafts.length !== 2 ||
  !duplicatePlan.duplicateSignals.some((signal) => signal.reason === 'shared_official_domain')
) {
  throw new Error('Online duplicate-signal handling failed.');
}

console.log('Online-service importer checks passed.');
