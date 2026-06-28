import { createOnlineServiceImportPlan } from '../src/importers/online-service';
import { createPhysicalPlaceImportPlan } from '../src/importers/physical-place';
import {
  findNonPublicContent,
  PublicExportBoundaryError,
  validatePublicArtifact,
} from '../src/publication/export-boundary';
import { publicExportPaths } from '../src/schemas/public-exports';

const physicalEnvelope = {
  sourceId: '11111111-1111-4111-8111-111111111111',
  licenseId: '22222222-2222-4222-8222-222222222222',
  importBatchId: '33333333-3333-4333-8333-333333333333',
  fetchedAt: '2026-06-27T00:00:00Z',
  importerVersion: '1.0.0',
  records: Array.from({ length: 10 }, (_, index) => ({
    legacyId: `integration-place-${index + 1}`,
    legacyPath: `/place/integration-place-${index + 1}`,
    name: `Integration Place ${index + 1}`,
    addressLine: `${index + 1} Integration Street`,
    locality: 'Tokyo',
    region: 'Tokyo',
    postalCode: '100-0001',
    countryCode: 'JP',
    latitude: 35.68 + index / 10_000,
    longitude: 139.76 + index / 10_000,
    category: 'cafe',
    websiteUrl: `https://place-${index + 1}.example.com`,
    osmType: 'node',
    osmId: String(20_000 + index),
    paymentTags: { 'payment:bitcoin': 'yes' },
    observedAt: '2026-06-20T00:00:00Z',
    sourceUrl: null,
    legacyVerificationLabel: 'legacy-listed',
  })),
};

const onlineEnvelope = {
  sourceId: '44444444-4444-4444-8444-444444444444',
  licenseId: '55555555-5555-4555-8555-555555555555',
  importBatchId: '66666666-6666-4666-8666-666666666666',
  fetchedAt: '2026-06-27T00:00:00Z',
  importerVersion: '1.0.0',
  records: Array.from({ length: 10 }, (_, index) => ({
    legacyId: `integration-online-${index + 1}`,
    legacyPath: `/service/integration-online-${index + 1}`,
    recordType: 'online_service',
    name: `Integration Online ${index + 1}`,
    websiteUrl: `https://online-${index + 1}.example.com`,
    countryCode: null,
    category: 'software',
    acceptanceScope: 'all_checkout',
    routeType: 'processor_checkout',
    processorName: 'Example Processor',
    processorUrl: 'https://processor.example.com',
    assetLabels: ['BTC'],
    networkLabels: ['Lightning'],
    paymentMethodLabels: ['processor checkout'],
    scopeNotes: null,
    howToPay: 'Choose cryptocurrency at checkout and follow the processor instructions.',
    evidenceUrls: [`https://online-${index + 1}.example.com/payments`],
    observedAt: '2026-06-20T00:00:00Z',
    sourceUrl: null,
    legacyVerificationLabel: 'legacy-ready',
  })),
};

const physicalPlan = await createPhysicalPlaceImportPlan(physicalEnvelope);
const onlinePlan = await createOnlineServiceImportPlan(onlineEnvelope);
const drafts = [...physicalPlan.drafts, ...onlinePlan.drafts];

if (
  physicalPlan.summary.acceptedCount !== 10 ||
  onlinePlan.summary.acceptedCount !== 10 ||
  drafts.length !== 20
) {
  throw new Error('Phase 2 integration requires ten physical and ten online candidate drafts.');
}

if (
  physicalPlan.summary.automaticConfirmedCount !== 0 ||
  onlinePlan.summary.automaticConfirmedCount !== 0 ||
  drafts.some(
    (draft) =>
      draft.candidate.candidateStatus !== 'new' ||
      draft.candidate.canonicalEntityId !== null ||
      draft.candidate.canonicalLocationId !== null ||
      draft.legacyMapping.migrationStatus !== 'pending',
  )
) {
  throw new Error('A Phase 2 importer crossed the candidate-to-canonical boundary.');
}

const leakageIssues = findNonPublicContent({ physical: physicalPlan, online: onlinePlan }).map(
  (issue) => issue.toLowerCase(),
);
if (
  !leakageIssues.some((issue) => issue.includes('candidate')) ||
  !leakageIssues.some((issue) => issue.includes('payload'))
) {
  throw new Error('Candidate and raw-payload leakage signals were not detected recursively.');
}

for (const [path, value] of [
  ['/data/places.json', physicalPlan],
  ['/data/online-services.json', onlinePlan],
] as const) {
  try {
    validatePublicArtifact(path, value);
    throw new Error(`${path} accepted an importer plan as a public artifact.`);
  } catch (error) {
    if (!(error instanceof PublicExportBoundaryError)) throw error;
  }
}

if (publicExportPaths.length !== 12) {
  throw new Error('The Phase 2 integration audit expects the complete twelve-artifact allowlist.');
}

console.log(
  'Phase 2 integration checks passed for 20 private candidate drafts and 12 public paths.',
);
