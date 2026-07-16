import { describe, expect, it } from 'vitest';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createSubmissionPrivateIntakeService } from '../src/submissions/intake-service';
import { createSubmissionPrivateStatusService } from '../src/submissions/private-status-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';
import { serializeSubmissionTerminalResolutionEventPayload } from '../src/submissions/terminal-resolution-contract';

const requestId = '20000000-0000-4000-8000-000000000001';
const submissionId = '10000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-16T04:00:00.000Z');

async function foundation() {
  const persistence = createInMemorySubmissionPersistenceBackend();
  const intake = createSubmissionPrivateIntakeService({
    persistence,
    statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
    contactProtector: {
      async protectEmail() {
        throw new Error('contact protection must not run');
      },
    },
    generateSubmissionId: () => submissionId,
  });
  const receipt = await intake.submit(
    requestId,
    {
      schemaVersion: 'submission-common-v1',
      submissionType: 'suggest',
      targetType: null,
      targetId: null,
      relationship: 'customer',
      contact: null,
      evidenceLinks: [],
      originalPayload: { name: 'Example Merchant' },
      acknowledgements: {
        privacyNoticeAccepted: true,
        submissionTermsAccepted: true,
      },
    },
    receivedAt,
  );
  return {
    persistence,
    receipt,
    status: createSubmissionPrivateStatusService(persistence),
  };
}

describe('P5-06D1 terminal private status projection', () => {
  it('projects only the bounded public terminal message', async () => {
    const { persistence, receipt, status } = await foundation();
    const triageAt = new Date('2026-07-16T04:01:00.000Z');
    const reviewAt = new Date('2026-07-16T04:02:00.000Z');
    const resolvedAt = new Date('2026-07-16T04:03:00.000Z');
    const publicMessage = 'The Submission could not be approved from the available information.';
    const internalNote = 'Reviewer-only evidence assessment.';

    await persistence.transitionSubmission({
      submissionId,
      expectedStatus: 'received',
      expectedUpdatedAt: receivedAt,
      toStatus: 'triage',
      resolution: null,
      action: 'submission_triage_started',
      reasonCode: null,
      actorId: 'reviewer:test',
      actorType: 'reviewer',
      internalNote: null,
      changedAt: triageAt,
    });
    await persistence.transitionSubmission({
      submissionId,
      expectedStatus: 'triage',
      expectedUpdatedAt: triageAt,
      toStatus: 'in_review',
      resolution: null,
      action: 'submission_review_started',
      reasonCode: null,
      actorId: 'reviewer:test',
      actorType: 'reviewer',
      internalNote: null,
      changedAt: reviewAt,
    });
    await persistence.transitionSubmission({
      submissionId,
      expectedStatus: 'in_review',
      expectedUpdatedAt: reviewAt,
      toStatus: 'resolved',
      resolution: 'not_approved',
      action: 'submission_not_approved',
      reasonCode: 'insufficient_evidence',
      actorId: 'reviewer:test',
      actorType: 'reviewer',
      internalNote: serializeSubmissionTerminalResolutionEventPayload({
        schemaVersion: 'submission-terminal-resolution-event-v1',
        requestFingerprint: 'a'.repeat(64),
        submissionType: 'suggest',
        action: 'not_approved',
        resolution: 'not_approved',
        reasonCode: 'insufficient_evidence',
        publicMessage,
        internalNote,
        duplicateSubmissionId: null,
        duplicateSubmissionPublicId: null,
      }),
      changedAt: resolvedAt,
    });

    const projection = await status.read(receipt.publicId, receipt.statusSecret);
    expect(projection).toMatchObject({
      statusLabel: 'not_approved',
      requestedAction: null,
      publicMessage,
      nextReviewAt: null,
      permittedActions: [],
    });
    expect(JSON.stringify(projection)).not.toContain(internalNote);
    expect(JSON.stringify(projection)).not.toContain(submissionId);
  });
});
