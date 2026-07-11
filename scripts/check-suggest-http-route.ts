import {
  createSuggestHttpHandler,
  type SuggestHttpPagesContext,
} from '../src/submissions/suggest-http';

const requestId = '20000000-0000-4000-8000-000000000001';
const handler = createSuggestHttpHandler({
  runtimeFromEnvironment() {
    return {
      bucketDeriver: {
        async deriveBucketKey() {
          return `rl_${'A'.repeat(43)}`;
        },
      },
      intake: {
        async submit() {
          return {
            state: 'committed',
            publicId: 'CPM-S-2026-000123',
            statusSecret: 'cpmss_runtime-secret',
            submittedAt: '2026-07-11T00:00:00.000Z',
          };
        },
      },
    };
  },
  now: () => new Date('2026-07-11T00:00:00.000Z'),
});

const request = new Request('https://example.test/api/suggest', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': requestId,
    'CF-Connecting-IP': '203.0.113.10',
  },
  body: JSON.stringify({
    challengeToken: 'runtime-token',
    submission: {
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
          name: 'Runtime Hosting',
          legalName: null,
          websiteUrl: 'https://runtime.example/',
          countryCode: 'jp',
        },
        place: null,
        categories: [],
        paymentProposals: [
          {
            assetSlug: 'btc',
            networkSlug: 'bitcoin',
            routeType: 'direct_wallet',
            paymentMethod: 'onchain',
            processor: null,
            contractAddress: null,
            howToPay: 'Choose Bitcoin at checkout and pay the displayed invoice.',
            restrictions: null,
            isPrimary: true,
          },
        ],
        observedAt: '2026-07-10',
      },
      acknowledgements: {
        privacyNoticeAccepted: true,
        submissionTermsAccepted: true,
      },
    },
  }),
});

const context: SuggestHttpPagesContext<Record<string, unknown>> = {
  request,
  env: {},
  params: {},
  data: {},
  waitUntil() {},
};
const response = await handler(context);
if (response.status !== 202) {
  throw new Error(`Suggest HTTP runtime check returned ${response.status}.`);
}
const body = (await response.json()) as Record<string, unknown>;
if (
  body.submissionReference !== 'CPM-S-2026-000123' ||
  body.statusSecret !== 'cpmss_runtime-secret' ||
  body.submittedAt !== '2026-07-11T00:00:00.000Z'
) {
  throw new Error('Suggest HTTP runtime check returned an invalid safe receipt.');
}
if (JSON.stringify(body).includes('203.0.113.10')) {
  throw new Error('Suggest HTTP runtime check leaked trusted edge identity.');
}

console.log('Suggest HTTP route checks passed.');
