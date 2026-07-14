import {
  businessClaimReviewTransitionReceiptSchema,
  businessClaimReviewTransitionRequestSchema,
} from '../src/admin/submissions/business-claim-review-transitions';
import {
  businessClaimVerificationPreparationReceiptSchema,
  businessClaimVerificationPreparationRequestSchema,
} from '../src/admin/submissions/business-claim-verification-preparation';
import { businessClaimVerificationRequestEventPayloadSchema } from '../src/submissions/business-claim-verification-request-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const updatedAt = '2026-07-14T06:00:00.000Z';
const changedAt = '2026-07-14T06:30:00.000Z';
const expiresAt = '2026-07-17T06:30:00.000Z';

businessClaimReviewTransitionRequestSchema.parse({
  schemaVersion: 'business-claim-review-transition-v1',
  requestId,
  action: 'begin_triage',
  expectedStatus: 'received',
  expectedUpdatedAt: updatedAt,
  reasonCode: 'initial_review',
});

businessClaimReviewTransitionReceiptSchema.parse({
  state: 'committed',
  submissionId,
  fromStatus: 'received',
  toStatus: 'triage',
  action: 'begin_triage',
  reasonCode: 'initial_review',
  changedAt,
});

businessClaimVerificationPreparationRequestSchema.parse({
  schemaVersion: 'business-claim-verification-preparation-v1',
  requestId,
  expectedStatus: 'in_review',
  expectedUpdatedAt: updatedAt,
  expectedMethod: 'official_domain_email',
  expiresInHours: 72,
});

businessClaimVerificationRequestEventPayloadSchema.parse({
  schemaVersion: 'business-claim-verification-request-event-v1',
  preparationId: requestId,
  expectedUpdatedAt: updatedAt,
  targetType: 'entity',
  targetId,
  method: 'official_domain_email',
  officialDomain: 'merchant.example',
  officialWebsiteUrl: null,
  officialSocialUrl: null,
  protectedContactPresent: true,
  privateProofPresent: false,
  assistedVerifierReferencePresent: false,
  expiresInHours: 72,
  expiresAt,
});

businessClaimVerificationPreparationReceiptSchema.parse({
  state: 'committed',
  submissionId,
  preparationId: requestId,
  targetType: 'entity',
  targetId,
  method: 'official_domain_email',
  protectedMaterial: {
    protectedContactPresent: true,
    privateProofPresent: false,
    assistedVerifierReferencePresent: false,
  },
  expiresAt,
  preparedAt: changedAt,
});

console.log('P5-04E Business Claim review transition schemas are valid.');
