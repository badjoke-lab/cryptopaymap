import { describe, expect, it } from 'vitest';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createSubmissionPrivateIntakeService } from '../src/submissions/intake-service';
import {
  createSubmissionPrivateStatusService,
  SubmissionPrivateStatusError,
} from '../src/submissions/private-status-service';
import { issueSubmissionStatusSecret } from '../src/submissions/status-secret';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const requestId = '20000000-0000-4000-8000-000000000001';
const submissionId = '10000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-09T12:00:00.000Z');

function rawIntake() {
  return {
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
  };
}

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
  const receipt = await intake.submit(requestId, rawIntake(), receivedAt);
  return {
    persistence,
    receipt,
    status: createSubmissionPrivateStatusService(persistence),
  };
}

describe('P5-01F private follow-up status read', () => {
  it('returns only the bounded safe status projection for valid credentials', async () => {
    const { status, receipt } = await foundation();

    const projection = await status.read(receipt.publicId, receipt.statusSecret);

    expect(projection).toEqual({
      publicId: receipt.publicId,
      statusLabel: 'received',
      requestedAction: null,
      publicMessage: null,
      nextReviewAt: null,
      linkedPublicRecord: null,
      mediaDecisions: [],
      permittedActions: ['withdraw', 'rotate_status_secret'],
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain(submissionId);
    expect(serialized).not.toContain(requestId);
    expect(serialized).not.toContain('statusTokenHash');
    expect(serialized).not.toContain('requestFingerprint');
    expect(serialized).not.toContain('originalPayload');
    expect(serialized).not.toContain('contact');
  });

  it('returns the same generic failure for wrong secret and missing reference', async () => {
    const { status, receipt } = await foundation();
    const wrongSecret = await issueSubmissionStatusSecret(new Uint8Array(32).fill(9));

    const wrong = await status.read(receipt.publicId, wrongSecret.secret).catch((error) => error);
    const missing = await status
      .read('CPM-S-2026-999999', receipt.statusSecret)
      .catch((error) => error);

    expect(wrong).toBeInstanceOf(SubmissionPrivateStatusError);
    expect(missing).toBeInstanceOf(SubmissionPrivateStatusError);
    expect(wrong).toMatchObject({ code: 'status_not_available' });
    expect(missing).toMatchObject({ code: 'status_not_available' });
    expect((wrong as Error).message).toBe((missing as Error).message);
  });

  it('exposes the bounded information-request action without private reviewer content', async () => {
    const { persistence, status, receipt } = await foundation();
    const triageAt = new Date('2026-07-09T12:01:00.000Z');
    const reviewAt = new Date('2026-07-09T12:02:00.000Z');
    const informationAt = new Date('2026-07-09T12:03:00.000Z');

    await persistence.transitionSubmission({
      submissionId,
      expectedStatus: 'received',
      expectedUpdatedAt: receivedAt,
      toStatus: 'triage',
      resolution: null,
      action: 'triage_started',
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
      action: 'review_started',
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
      toStatus: 'needs_information',
      resolution: null,
      action: 'request_information',
      reasonCode: 'missing_evidence',
      actorId: 'reviewer:test',
      actorType: 'reviewer',
      internalNote: 'private reviewer detail that must not be projected',
      changedAt: informationAt,
    });

    await expect(status.read(receipt.publicId, receipt.statusSecret)).resolves.toEqual({
      publicId: receipt.publicId,
      statusLabel: 'more_information_needed',
      requestedAction: null,
      publicMessage: null,
      nextReviewAt: null,
      linkedPublicRecord: null,
      mediaDecisions: [],
      permittedActions: ['provide_information', 'withdraw', 'rotate_status_secret'],
    });
  });

  it('maps terminal resolution to a bounded public status with no response actions', async () => {
    const { persistence, status, receipt } = await foundation();
    const triageAt = new Date('2026-07-09T12:01:00.000Z');
    const reviewAt = new Date('2026-07-09T12:02:00.000Z');
    const resolvedAt = new Date('2026-07-09T12:03:00.000Z');

    await persistence.transitionSubmission({
      submissionId,
      expectedStatus: 'received',
      expectedUpdatedAt: receivedAt,
      toStatus: 'triage',
      resolution: null,
      action: 'triage_started',
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
      action: 'review_started',
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
      action: 'resolve_submission',
      reasonCode: 'insufficient_evidence',
      actorId: 'reviewer:test',
      actorType: 'reviewer',
      internalNote: null,
      changedAt: resolvedAt,
    });

    await expect(status.read(receipt.publicId, receipt.statusSecret)).resolves.toMatchObject({
      statusLabel: 'not_approved',
      permittedActions: [],
    });
  });
});
