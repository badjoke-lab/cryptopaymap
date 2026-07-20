import { describe, expect, it } from 'vitest';
import {
  registerSubmissionApplication,
  type SubmissionApplicationRegistrationBackend,
  type SubmissionApplicationRegistrationCommand,
  type SubmissionApplicationRegistrationRecord,
  type SubmissionApplicationRegistrationState,
} from '../src/admin/submissions/application-registration';

const submissionId = '10000000-0000-4000-8000-000000000001';
const sourceEventId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const fieldEventId = '40000000-0000-4000-8000-000000000001';
const updatedAt = '2026-07-20T00:00:00.000Z';
const registeredAt = new Date('2026-07-20T00:05:00.000Z');
const context = {
  actorId: 'reviewer:business-claim-order',
  actorType: 'human' as const,
  capabilities: ['submission:application:register'] as ['submission:application:register'],
};

function state(paymentPending: boolean): SubmissionApplicationRegistrationState {
  return {
    submissionId,
    submissionType: 'claim',
    workflowStatus: 'resolved',
    resolution: 'approved',
    updatedAt,
    sourceDecisionEvent: {
      eventId: sourceEventId,
      submissionId,
      toStatus: 'resolved',
      action: 'business_claim_relationship_approved',
      createdAt: updatedAt,
    },
    candidatePromotionDecisionId: null,
    businessClaimFieldApplicationEventId: fieldEventId,
    businessClaimPaymentApplicationPending: paymentPending,
  };
}

function createBackend(initial: SubmissionApplicationRegistrationState) {
  const commits: SubmissionApplicationRegistrationCommand[] = [];
  const registrations = new Map<string, SubmissionApplicationRegistrationRecord>();
  const backend: SubmissionApplicationRegistrationBackend & {
    commits: SubmissionApplicationRegistrationCommand[];
  } = {
    commits,
    async readRegistration(id) {
      return registrations.get(id) ?? null;
    },
    async readApplicationBySubmission() {
      return null;
    },
    async readState() {
      return structuredClone(initial);
    },
    async commitRegistration(command) {
      commits.push(command);
      registrations.set(command.registrationRequestId, {
        registrationRequestId: command.registrationRequestId,
        applicationId: command.applicationId,
        submissionId: command.submissionId,
        submissionType: command.submissionType,
        sourceDecisionKind: command.sourceDecisionKind,
        sourceDecisionEventId: command.sourceDecisionEventId,
        applicationKind: command.applicationKind,
        applicationStatus: command.applicationStatus,
        publicationStatus: command.publicationStatus,
        applicationReceipt: command.applicationReceipt,
        publicationReceipt: command.publicationReceipt,
        actorId: command.actorId,
        requestFingerprint: command.requestFingerprint,
        registeredAt: command.registeredAt.toISOString(),
      });
    },
  };
  return backend;
}

const request = {
  schemaVersion: 'submission-application-registration-v1',
  requestId,
  sourceDecisionKind: 'business_claim_relationship',
  sourceDecisionEventId: sourceEventId,
  expectedSubmissionUpdatedAt: updatedAt,
};

describe('P5-07E1 Business Claim application ordering', () => {
  it('keeps the common application pending while accepted payment drafts remain', async () => {
    const backend = createBackend(state(true));
    const receipt = await registerSubmissionApplication(
      context,
      backend,
      submissionId,
      request,
      registeredAt,
    );
    expect(receipt).toMatchObject({
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
      applicationReceipt: null,
    });
    expect(backend.commits[0]).toMatchObject({
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
      applicationReceipt: null,
    });
  });

  it('commits immediately when no accepted payment drafts remain', async () => {
    const backend = createBackend(state(false));
    const receipt = await registerSubmissionApplication(
      context,
      backend,
      submissionId,
      request,
      registeredAt,
    );
    expect(receipt).toMatchObject({
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      applicationReceipt: { kind: 'submission_event', ids: [fieldEventId] },
    });
  });
});
