import { describe, expect, it } from 'vitest';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { SubmissionPersistenceError } from '../src/submissions/persistence';
import {
  SubmissionWorkflowError,
  assertSubmissionWorkflowTransition,
  isSubmissionWorkflowTerminal,
} from '../src/submissions/workflow';

const submittedAt = new Date('2026-07-09T12:00:00.000Z');
const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';

function command(publicId: string) {
  return {
    id: submissionId,
    intakeRequestId: requestId,
    requestFingerprint: 'a'.repeat(64),
    publicId,
    submissionType: 'suggest' as const,
    targetType: null,
    targetId: null,
    relationship: 'customer' as const,
    statusTokenHash: `sha256:${'b'.repeat(64)}`,
    submittedAt,
    originalPayload: { name: 'Example Merchant', asset: 'BTC' },
    contact: {
      encryptedEmail: 'ciphertext-envelope',
      emailHash: 'c'.repeat(64),
      contactAllowed: true,
      retentionUntil: null,
    },
    actorId: 'submitter:public-intake',
    actorType: 'submitter' as const,
  };
}

describe('P5-01B submission persistence foundation', () => {
  it('allocates monotonic year-scoped public references', async () => {
    const backend = createInMemorySubmissionPersistenceBackend();

    await expect(backend.allocatePublicReference(2026, submittedAt)).resolves.toBe(
      'CPM-S-2026-000001',
    );
    await expect(backend.allocatePublicReference(2026, submittedAt)).resolves.toBe(
      'CPM-S-2026-000002',
    );
    await expect(backend.allocatePublicReference(2027, submittedAt)).resolves.toBe(
      'CPM-S-2027-000001',
    );
  });

  it('persists a private received submission bundle without rewriting original payload', async () => {
    const backend = createInMemorySubmissionPersistenceBackend();
    const publicId = await backend.allocatePublicReference(2026, submittedAt);
    const create = command(publicId);
    const originalBefore = structuredClone(create.originalPayload);

    const receipt = await backend.createSubmission(create);

    expect(receipt).toEqual({
      submissionId,
      publicId: 'CPM-S-2026-000001',
      workflowStatus: 'received',
      submittedAt: submittedAt.toISOString(),
    });
    expect(backend.snapshot()[0]).toMatchObject({
      workflowStatus: 'received',
      originalPayload: originalBefore,
      contact: {
        encryptedEmail: 'ciphertext-envelope',
        emailHash: 'c'.repeat(64),
      },
    });
    expect(create.originalPayload).toEqual(originalBefore);
  });

  it('keeps the intake request fingerprint available for later idempotent replay logic', async () => {
    const backend = createInMemorySubmissionPersistenceBackend();
    const publicId = await backend.allocatePublicReference(2026, submittedAt);
    await backend.createSubmission(command(publicId));

    await expect(backend.readByIntakeRequestId(requestId)).resolves.toMatchObject({
      submissionId,
      publicId,
      requestFingerprint: 'a'.repeat(64),
      workflowStatus: 'received',
    });
  });

  it('rejects persistence collisions before a second private record can exist', async () => {
    const backend = createInMemorySubmissionPersistenceBackend();
    const firstPublicId = await backend.allocatePublicReference(2026, submittedAt);
    await backend.createSubmission(command(firstPublicId));

    const second = command(await backend.allocatePublicReference(2026, submittedAt));
    second.id = '10000000-0000-4000-8000-000000000002';

    await expect(backend.createSubmission(second)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(backend.snapshot()).toHaveLength(1);
  });

  it('moves through allowed workflow states and rejects a stale expected state', async () => {
    const backend = createInMemorySubmissionPersistenceBackend();
    const publicId = await backend.allocatePublicReference(2026, submittedAt);
    await backend.createSubmission(command(publicId));

    const triageAt = new Date('2026-07-09T12:05:00.000Z');
    await expect(
      backend.transitionSubmission({
        submissionId,
        expectedStatus: 'received',
        expectedUpdatedAt: submittedAt,
        toStatus: 'triage',
        resolution: null,
        action: 'triage_started',
        reasonCode: null,
        actorId: 'reviewer:test',
        actorType: 'reviewer',
        internalNote: null,
        changedAt: triageAt,
      }),
    ).resolves.toMatchObject({ fromStatus: 'received', toStatus: 'triage' });

    await expect(
      backend.transitionSubmission({
        submissionId,
        expectedStatus: 'received',
        expectedUpdatedAt: submittedAt,
        toStatus: 'duplicate',
        resolution: 'duplicate',
        action: 'mark_duplicate',
        reasonCode: 'same_submission',
        actorId: 'reviewer:test',
        actorType: 'reviewer',
        internalNote: null,
        changedAt: new Date('2026-07-09T12:06:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects forbidden workflow transitions and invalid resolution shapes', () => {
    expect(() =>
      assertSubmissionWorkflowTransition({
        fromStatus: 'received',
        toStatus: 'resolved',
        resolution: 'approved',
      }),
    ).toThrow(SubmissionWorkflowError);

    expect(() =>
      assertSubmissionWorkflowTransition({
        fromStatus: 'in_review',
        toStatus: 'resolved',
        resolution: null,
      }),
    ).toThrow(SubmissionWorkflowError);

    expect(() =>
      assertSubmissionWorkflowTransition({
        fromStatus: 'triage',
        toStatus: 'in_review',
        resolution: 'approved',
      }),
    ).toThrow(SubmissionWorkflowError);
  });

  it('marks terminal workflow states explicitly', () => {
    expect(isSubmissionWorkflowTerminal('resolved')).toBe(true);
    expect(isSubmissionWorkflowTerminal('duplicate')).toBe(true);
    expect(isSubmissionWorkflowTerminal('rejected_spam')).toBe(true);
    expect(isSubmissionWorkflowTerminal('withdrawn')).toBe(true);
    expect(isSubmissionWorkflowTerminal('in_review')).toBe(false);
  });

  it('uses typed persistence errors for missing submissions', async () => {
    const backend = createInMemorySubmissionPersistenceBackend();
    await expect(
      backend.transitionSubmission({
        submissionId,
        expectedStatus: 'received',
        expectedUpdatedAt: submittedAt,
        toStatus: 'triage',
        resolution: null,
        action: 'triage_started',
        reasonCode: null,
        actorId: 'reviewer:test',
        actorType: 'reviewer',
        internalNote: null,
        changedAt: new Date('2026-07-09T12:05:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(SubmissionPersistenceError);
  });
});
