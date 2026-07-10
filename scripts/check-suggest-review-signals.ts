import { generateSuggestReviewSignals } from '../src/submissions/suggest-review-signals';
import type { SuggestReviewProjection } from '../src/submissions/suggest-contract';

const projection: SuggestReviewProjection = {
  suggestionKind: 'online_service',
  entityType: 'online_service',
  entity: {
    name: 'Example Hosting',
    legalName: null,
    websiteUrl: 'https://hosting.example/',
    countryCode: 'US',
  },
  place: null,
  categories: [],
  paymentProposals: [
    {
      assetSlug: 'usdc',
      networkSlug: 'base',
      routeType: 'processor_checkout',
      paymentMethod: 'processor_checkout',
      processor: { name: 'Processor', websiteUrl: null },
      contractAddress: null,
      howToPay: 'Choose crypto at checkout.',
      restrictions: null,
      isPrimary: true,
    },
  ],
  observedAt: '2026-07-01',
  relationship: 'customer',
  evidenceLinks: [],
};

const result = await generateSuggestReviewSignals(
  projection,
  {
    candidateBackend: {
      async searchCandidateSignalMaterial() {
        return [
          {
            candidateId: '10000000-0000-4000-8000-000000000001',
            candidateType: 'online_service',
            candidateStatus: 'new',
            normalizedName: 'example hosting',
            duplicateGroupId: null,
            snapshots: [
              {
                kind: 'online_service',
                recordType: 'online_service',
                name: 'Example Hosting',
                websiteUrl: 'https://hosting.example/',
                countryCode: 'US',
                category: null,
                acceptanceScope: null,
                routeType: null,
                processorName: null,
                processorUrl: null,
                assetLabels: [],
                networkLabels: [],
                paymentMethodLabels: [],
                scopeNotes: null,
                howToPay: null,
                evidenceUrls: [],
                legacyVerificationLabel: null,
              },
            ],
          },
        ];
      },
    },
    canonicalTargetBackend: {
      async searchTargets() {
        return [];
      },
    },
  },
  new Date('2026-07-10T01:00:00.000Z'),
);

if (
  result.candidateSignals[0]?.reasons[0]?.reason !== 'shared_official_domain' ||
  result.coverage.absenceIsConclusive !== false
) {
  throw new Error('Suggest review signal contract check produced an invalid result.');
}

console.log('Suggest review signal contract checks passed.');
