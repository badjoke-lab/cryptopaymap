import {
  businessClaimRelationshipDecisionReceiptSchema,
  businessClaimRelationshipDecisionRequestSchema,
} from '../src/admin/submissions/business-claim-relationship-decision';
import {
  businessClaimRelationshipDecisionEventPayloadSchema,
  businessClaimRepresentativeRelationshipSchema,
} from '../src/submissions/business-claim-relationship-decision-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const preparationId = '30000000-0000-4000-8000-000000000001';
const executionId = '40000000-0000-4000-8000-000000000001';
const decisionId = '50000000-0000-4000-8000-000000000001';
const submissionUpdatedAt = '2026-07-14T07:30:00.000Z';
const observedAt = '2026-07-14T07:29:00.000Z';
const expiresAt = '2026-07-17T07:00:00.000Z';
const decidedAt = '2026-07-14T08:00:00.000Z';

businessClaimRelationshipDecisionRequestSchema.parse({
  schemaVersion: 'business-claim-relationship-decision-v1',
  decisionId,
  executionId,
  preparationId,
  expectedSubmissionUpdatedAt: submissionUpdatedAt,
  expectedTargetType: 'entity',
  expectedTargetId: targetId,
  expectedClaimantRole: 'owner',
  expectedMethod: 'dns_txt',
  expectedOutcome: 'passed',
  expectedResultCode: 'challenge_confirmed',
  expectedVerificationObservedAt: observedAt,
  expectedPreparationExpiresAt: expiresAt,
  decision: 'approve_relationship',
  reasonCode: 'verified_authority_confirmed',
});

const relationship = businessClaimRepresentativeRelationshipSchema.parse({
  relationshipId: decisionId,
  status: 'active',
  targetType: 'entity',
  targetId,
  claimantRole: 'owner',
  approvedScope: 'representative_relationship',
  verificationMethod: 'dns_txt',
  preparationId,
  executionId,
  verifiedAt: observedAt,
  createdAt: decidedAt,
});

businessClaimRelationshipDecisionEventPayloadSchema.parse({
  schemaVersion: 'business-claim-relationship-decision-event-v1',
  decisionId,
  expectedSubmissionUpdatedAt: submissionUpdatedAt,
  decision: 'approve_relationship',
  reasonCode: 'verified_authority_confirmed',
  targetType: 'entity',
  targetId,
  claimantRole: 'owner',
  approvedScope: 'representative_relationship',
  verificationMethod: 'dns_txt',
  preparationId,
  executionId,
  executionOutcome: 'passed',
  executionResultCode: 'challenge_confirmed',
  verificationObservedAt: observedAt,
  preparationExpiresAt: expiresAt,
  relationship,
});

businessClaimRelationshipDecisionReceiptSchema.parse({
  state: 'committed',
  submissionId,
  decisionId,
  decision: 'approve_relationship',
  resolution: 'approved',
  reasonCode: 'verified_authority_confirmed',
  targetType: 'entity',
  targetId,
  claimantRole: 'owner',
  verificationMethod: 'dns_txt',
  preparationId,
  executionId,
  executionOutcome: 'passed',
  relationship,
  decidedAt,
});

if (
  businessClaimRelationshipDecisionReceiptSchema.safeParse({
    state: 'committed',
    submissionId,
    decisionId,
    decision: 'approve_relationship',
    resolution: 'approved',
    reasonCode: 'verified_authority_confirmed',
    targetType: 'entity',
    targetId,
    claimantRole: 'owner',
    verificationMethod: 'dns_txt',
    preparationId,
    executionId,
    executionOutcome: 'passed',
    relationship,
    decidedAt,
    editingPermission: true,
    contactEmail: 'owner@merchant.example',
  }).success
) {
  throw new Error('P5-04G receipt accepted protected or permission material.');
}

console.log('P5-04G Business Claim relationship decision checks passed.');
