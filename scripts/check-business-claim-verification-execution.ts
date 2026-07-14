import {
  businessClaimVerificationExecutionReceiptSchema,
  businessClaimVerificationExecutionRequestSchema,
} from '../src/admin/submissions/business-claim-verification-execution';
import {
  businessClaimVerificationAdapterResultSchema,
  businessClaimVerificationResultEventPayloadSchema,
} from '../src/submissions/business-claim-verification-result-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const preparationId = '30000000-0000-4000-8000-000000000001';
const executionId = '40000000-0000-4000-8000-000000000001';
const updatedAt = '2026-07-14T07:00:00.000Z';
const expiresAt = '2026-07-17T07:00:00.000Z';
const observedAt = '2026-07-14T07:29:00.000Z';
const executedAt = '2026-07-14T07:30:00.000Z';

businessClaimVerificationExecutionRequestSchema.parse({
  schemaVersion: 'business-claim-verification-execution-v1',
  executionId,
  preparationId,
  expectedSubmissionUpdatedAt: updatedAt,
  expectedMethod: 'dns_txt',
  expectedPreparationExpiresAt: expiresAt,
});

businessClaimVerificationAdapterResultSchema.parse({
  outcome: 'passed',
  resultCode: 'dns_record_confirmed',
  observedAt,
  retryable: false,
  summary: 'The prepared DNS TXT challenge was confirmed.',
  providerReferenceHash: `sha256:${'a'.repeat(64)}`,
});

businessClaimVerificationResultEventPayloadSchema.parse({
  schemaVersion: 'business-claim-verification-result-event-v1',
  executionId,
  preparationId,
  expectedSubmissionUpdatedAt: updatedAt,
  expectedPreparationExpiresAt: expiresAt,
  targetType: 'entity',
  targetId,
  method: 'dns_txt',
  adapterId: 'dns-txt-adapter',
  adapterVersion: '1.0.0',
  outcome: 'passed',
  resultCode: 'dns_record_confirmed',
  observedAt,
  retryable: false,
  summary: 'The prepared DNS TXT challenge was confirmed.',
  providerReferenceHash: `sha256:${'a'.repeat(64)}`,
});

businessClaimVerificationExecutionReceiptSchema.parse({
  state: 'committed',
  submissionId,
  executionId,
  preparationId,
  targetType: 'entity',
  targetId,
  method: 'dns_txt',
  outcome: 'passed',
  resultCode: 'dns_record_confirmed',
  observedAt,
  retryable: false,
  summary: 'The prepared DNS TXT challenge was confirmed.',
  adapterId: 'dns-txt-adapter',
  adapterVersion: '1.0.0',
  executedAt,
});

console.log('P5-04F Business Claim verification execution schemas are valid.');
