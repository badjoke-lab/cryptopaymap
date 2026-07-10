import {
  commonSubmissionIntakeSchema,
  formatSubmissionPublicId,
  publicStatusLabelForSubmission,
  submissionPublicStatusProjectionSchema,
} from '../src/submissions/contract';
import {
  issueSubmissionStatusSecret,
  verifySubmissionStatusSecret,
} from '../src/submissions/status-secret';

const publicId = formatSubmissionPublicId(2026, 123);
const intake = commonSubmissionIntakeSchema.parse({
  schemaVersion: 'submission-common-v1',
  submissionType: 'suggest',
  targetType: null,
  targetId: null,
  relationship: 'customer',
  contact: null,
  evidenceLinks: [
    {
      url: 'https://merchant.example/payments',
      observedAt: '2026-07-01',
      summary: 'Official payment information.',
    },
  ],
  originalPayload: {
    name: 'Example Merchant',
    asset: 'BTC',
  },
  acknowledgements: {
    privacyNoticeAccepted: true,
    submissionTermsAccepted: true,
  },
});

const issued = await issueSubmissionStatusSecret(new Uint8Array(32).fill(11));
const verified = await verifySubmissionStatusSecret(issued.secret, issued.tokenHash);
const status = submissionPublicStatusProjectionSchema.parse({
  publicId,
  statusLabel: publicStatusLabelForSubmission('in_review', null),
  requestedAction: null,
  publicMessage: 'The submission is under review.',
  nextReviewAt: null,
  linkedPublicRecord: null,
  mediaDecisions: [],
  permittedActions: ['withdraw'],
});

if (
  intake.submissionType !== 'suggest' ||
  status.publicId !== 'CPM-S-2026-000123' ||
  status.statusLabel !== 'under_review' ||
  !verified
) {
  throw new Error('Shared submission contract check produced an invalid result.');
}

console.log('Shared submission contract checks passed.');
