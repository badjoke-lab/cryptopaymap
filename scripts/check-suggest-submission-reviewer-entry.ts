import {
  suggestSubmissionReviewDetailResponseSchema,
  suggestReviewProjectionSchema,
} from '../src/admin/submissions/detail';
import { suggestSubmissionQueueResponseSchema } from '../src/admin/submissions/queue';

const generatedAt = '2026-07-10T02:00:00.000Z';
const submissionId = '10000000-0000-4000-8000-000000000001';

const projection = suggestReviewProjectionSchema.parse({
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
      howToPay: 'Choose crypto during hosted checkout.',
      restrictions: null,
      isPrimary: true,
    },
  ],
  observedAt: '2026-07-01',
  relationship: 'customer',
  evidenceLinks: [],
});

suggestSubmissionQueueResponseSchema.parse({
  generatedAt,
  items: [
    {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      suggestionKind: 'online_service',
      name: 'Example Hosting',
      workflowStatus: 'received',
      priority: 0,
      relationship: 'customer',
      evidenceCount: 0,
      submittedAt: '2026-07-10T01:00:00.000Z',
      updatedAt: '2026-07-10T01:00:00.000Z',
    },
  ],
  hasNextPage: false,
  nextCursor: null,
});

suggestSubmissionReviewDetailResponseSchema.parse({
  generatedAt,
  submission: {
    id: submissionId,
    publicId: 'CPM-S-2026-000001',
    workflowStatus: 'received',
    resolution: null,
    priority: 0,
    relationship: 'customer',
    submittedAt: '2026-07-10T01:00:00.000Z',
    updatedAt: '2026-07-10T01:00:00.000Z',
  },
  projection,
  signals: {
    generatedAt,
    candidateSignals: [],
    canonicalTargetSignals: [],
    coverage: {
      candidateSearchComplete: true,
      canonicalSearchComplete: true,
      absenceIsConclusive: false,
    },
  },
  events: [],
  eventsTruncated: false,
});

console.log('Suggest Submission reviewer entry checks passed.');
