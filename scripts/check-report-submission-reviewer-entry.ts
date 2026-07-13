import { reportSubmissionReviewDetailResponseSchema } from '../src/admin/submissions/report-detail';
import { reportSubmissionQueueResponseSchema } from '../src/admin/submissions/report-queue';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const generatedAt = '2026-07-13T04:00:00.000Z';

reportSubmissionQueueResponseSchema.parse({
  generatedAt,
  items: [
    {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      reportKind: 'problem_report',
      targetType: 'entity',
      targetId: entityId,
      paymentResult: null,
      problemType: 'wrong_instructions',
      workflowStatus: 'received',
      priority: 20,
      evidenceCount: 1,
      submittedAt: generatedAt,
      updatedAt: generatedAt,
    },
  ],
  hasNextPage: false,
  nextCursor: null,
});

reportSubmissionReviewDetailResponseSchema.parse({
  generatedAt,
  submission: {
    id: submissionId,
    publicId: 'CPM-S-2026-000001',
    submissionType: 'problem_report',
    targetType: 'entity',
    targetId: entityId,
    workflowStatus: 'received',
    resolution: null,
    priority: 20,
    submittedAt: generatedAt,
    updatedAt: generatedAt,
  },
  projection: {
    reportKind: 'problem_report',
    targetType: 'entity',
    targetId: entityId,
    reportType: 'wrong_instructions',
    observedAt: '2026-07-12',
    explanation: 'The current instructions do not match checkout.',
    proposedCorrection: {
      kind: 'instructions',
      howToPay: 'Select crypto at checkout and scan the displayed QR code.',
    },
    duplicateTarget: null,
    evidenceLinks: [
      {
        url: 'https://service.example/help/payments',
        observedAt: '2026-07-12',
        summary: 'Current official checkout instructions.',
      },
    ],
    restrictedEvidence: { privateEvidenceUrlPresent: false },
  },
  events: [],
  eventsTruncated: false,
  targetContext: {
    generatedAt,
    target: {
      targetType: 'entity',
      targetId: entityId,
      canonicalPath: '/service/example-service',
      entity: {
        id: entityId,
        entityType: 'online_service',
        name: 'Example Service',
        slug: 'example-service',
        websiteUrl: 'https://service.example/',
        countryCode: 'US',
        entityStatus: 'active',
        visibility: 'public',
        updatedAt: generatedAt,
      },
      location: null,
      selectedClaimId: null,
    },
    reportability: { publiclyReachable: true, reasons: [] },
    claimSignals: [],
    coverage: {
      targetLookupComplete: true,
      claimContextComplete: true,
      absenceIsConclusive: false,
    },
  },
});

console.log('P5-03D report reviewer schemas are valid.');
