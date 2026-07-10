import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';
import { createSuggestSubmissionPrivateIntakeService } from '../src/submissions/suggest-intake-service';

const persistence = createInMemorySubmissionPersistenceBackend();
const intake = createSuggestSubmissionPrivateIntakeService({
  persistence,
  statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
  contactProtector: {
    async protectEmail() {
      throw new Error('contact protection must not run for no-contact fixture');
    },
  },
  generateSubmissionId: () => '10000000-0000-4000-8000-000000000001',
});

const receipt = await intake.submit(
  '20000000-0000-4000-8000-000000000001',
  {
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
      categories: [],
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
  },
  new Date('2026-07-10T00:00:00.000Z'),
);

const stored = persistence.snapshot()[0];
if (
  receipt.state !== 'committed' ||
  stored?.normalizedPayload?.suggestionKind !== 'online_service' ||
  stored.normalizedPayload?.entityType !== 'online_service' ||
  stored.normalizedPayload?.relationship !== 'customer'
) {
  throw new Error('Suggest private intake contract check produced an invalid result.');
}

console.log('Suggest private intake contract checks passed.');
