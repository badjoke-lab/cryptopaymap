import assert from 'node:assert/strict';
import {
  authorizeBusinessClaimRelationshipDecision,
  readBusinessClaimRelationshipDecisionAuthorizationPolicy,
} from '../src/admin/submissions/business-claim-relationship-decision-authorization';
import {
  decideBusinessClaimRepresentativeRelationship,
  type BusinessClaimRelationshipDecisionBackend,
  type BusinessClaimRelationshipDecisionEventRecord,
} from '../src/admin/submissions/business-claim-relationship-decision';
import { serializeBusinessClaimVerificationRequestEventPayload } from '../src/submissions/business-claim-verification-request-contract';
import { serializeBusinessClaimVerificationResultEventPayload } from '../src/submissions/business-claim-verification-result-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const preparationId = '30000000-0000-4000-8000-000000000001';
const executionId = '40000000-0000-4000-8000-000000000001';
const decisionId = '50000000-0000-4000-8000-000000000001';
const submissionUpdatedAt = '2026-07-14T07:30:00.000Z';
const preparationExpiresAt = '2026-07-17T07:00:00.000Z';
const verificationObservedAt = '2026-07-14T07:29:00.000Z';
const decidedAt = new Date('2026-07-14T08:00:00.000Z');

const policy = readBusinessClaimRelationshipDecisionAuthorizationPolicy({
  CPM_ADMIN_CLAIM_RELATIONSHIP_DECISION_SUBJECTS: JSON.stringify(['relationship-decider']),
});
const context = authorizeBusinessClaimRelationshipDecision(
  {
    actorId: 'cloudflare-access:relationship-decider',
    actorType: 'human',
    subject: 'relationship-decider',
    email: null,
  },
  policy,
);

const events = new Map<string, BusinessClaimRelationshipDecisionEventRecord>();
const backend: BusinessClaimRelationshipDecisionBackend = {
  async readState() {
    return {
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'in_review',
      updatedAt: submissionUpdatedAt,
      normalizedProjection: {
        targetType: 'entity',
        targetId,
        claimantRole: 'owner',
        requestedScopes: ['representative_relationship'],
        verification: {
          method: 'dns_txt',
          officialDomain: 'merchant.example',
          protectedContactPresent: false,
          officialWebsiteUrl: null,
          officialSocialUrl: null,
          assistedVerifierReferencePresent: false,
          privateProofPresent: false,
        },
        proposedChanges: { entity: null, location: null, paymentProposals: null },
        authorityStatement: 'I am authorized to represent this business.',
        evidenceLinks: [],
      },
      preparationEvent: {
        eventId: preparationId,
        submissionId,
        fromStatus: null,
        toStatus: 'in_review',
        action: 'claim_verification_request_prepared',
        reasonCode: 'dns_txt',
        actorId: 'cloudflare-access:preparer',
        internalNote: serializeBusinessClaimVerificationRequestEventPayload({
          schemaVersion: 'business-claim-verification-request-event-v1',
          preparationId,
          expectedUpdatedAt: '2026-07-14T07:00:00.000Z',
          targetType: 'entity',
          targetId,
          method: 'dns_txt',
          officialDomain: 'merchant.example',
          officialWebsiteUrl: null,
          officialSocialUrl: null,
          protectedContactPresent: false,
          privateProofPresent: false,
          assistedVerifierReferencePresent: false,
          expiresInHours: 72,
          expiresAt: preparationExpiresAt,
        }),
        createdAt: '2026-07-14T07:00:00.000Z',
      },
      executionEvent: {
        eventId: executionId,
        submissionId,
        fromStatus: null,
        toStatus: 'in_review',
        action: 'claim_verification_execution_recorded',
        reasonCode: 'passed',
        actorId: 'cloudflare-access:executor',
        internalNote: serializeBusinessClaimVerificationResultEventPayload({
          schemaVersion: 'business-claim-verification-result-event-v1',
          executionId,
          preparationId,
          expectedSubmissionUpdatedAt: '2026-07-14T07:00:00.000Z',
          expectedPreparationExpiresAt: preparationExpiresAt,
          targetType: 'entity',
          targetId,
          method: 'dns_txt',
          adapterId: 'dns-adapter',
          adapterVersion: '1.0.0',
          outcome: 'passed',
          resultCode: 'challenge_confirmed',
          observedAt: verificationObservedAt,
          retryable: false,
          summary: 'The DNS challenge was confirmed.',
          providerReferenceHash: null,
        }),
        createdAt: submissionUpdatedAt,
      },
    };
  },
  async readDecisionEvent(id) {
    return events.get(id) ?? null;
  },
  async commitDecision(command) {
    events.set(command.eventId, {
      eventId: command.eventId,
      submissionId: command.submissionId,
      fromStatus: 'in_review',
      toStatus: 'resolved',
      action: command.eventAction,
      reasonCode: command.reasonCode,
      actorId: command.actorId,
      internalNote: command.internalNote,
      createdAt: command.decidedAt.toISOString(),
    });
  },
};

const request = {
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
  expectedVerificationObservedAt: verificationObservedAt,
  expectedPreparationExpiresAt: preparationExpiresAt,
  decision: 'approve_relationship',
  reasonCode: 'verified_authority_confirmed',
};

const receipt = await decideBusinessClaimRepresentativeRelationship(
  context,
  backend,
  submissionId,
  request,
  decidedAt,
);
assert.equal(receipt.state, 'committed');
assert.equal(receipt.resolution, 'approved');
assert.equal(receipt.relationship?.status, 'active');
assert.equal(receipt.relationship?.relationshipId, decisionId);
assert.equal('editingPermission' in receipt, false);
assert.equal('contactEmail' in receipt, false);

const replay = await decideBusinessClaimRepresentativeRelationship(
  context,
  backend,
  submissionId,
  request,
  decidedAt,
);
assert.equal(replay.state, 'replayed');

console.log('P5-04G Business Claim relationship decision checks passed.');
