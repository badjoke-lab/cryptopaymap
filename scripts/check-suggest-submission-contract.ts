import { normalizeSuggestSubmissionIntake } from '../src/submissions/suggest-contract';

const projection = normalizeSuggestSubmissionIntake({
  schemaVersion: 'submission-common-v1',
  submissionType: 'suggest',
  targetType: null,
  targetId: null,
  relationship: 'customer',
  contact: null,
  evidenceLinks: [],
  originalPayload: {
    schemaVersion: 'suggest-v1',
    suggestionKind: 'online_service',
    entity: {
      name: 'Example Hosting',
      legalName: null,
      websiteUrl: 'https://hosting.example/',
      countryCode: 'us',
    },
    place: null,
    categories: [{ slug: 'web-hosting', isPrimary: true }],
    paymentProposals: [
      {
        assetSlug: 'usdc',
        networkSlug: 'base',
        routeType: 'processor_checkout',
        paymentMethod: 'processor_checkout',
        processor: {
          name: 'Example Processor',
          websiteUrl: 'https://processor.example/',
        },
        contractAddress: null,
        howToPay: 'Choose crypto during hosted checkout.',
        restrictions: null,
        isPrimary: true,
      },
    ],
    observedAt: '2026-07-02',
  },
  acknowledgements: {
    privacyNoticeAccepted: true,
    submissionTermsAccepted: true,
  },
});

if (
  projection.suggestionKind !== 'online_service' ||
  projection.entityType !== 'online_service' ||
  projection.place !== null ||
  projection.entity.countryCode !== 'US' ||
  projection.paymentProposals[0]?.networkSlug !== 'base'
) {
  throw new Error('Suggest submission contract check produced an invalid result.');
}

console.log('Suggest submission contract checks passed.');
