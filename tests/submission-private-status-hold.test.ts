import { describe, expect, it } from 'vitest';
import type { SubmissionPersistenceBackend } from '../src/submissions/persistence';
import { createSubmissionPrivateStatusService } from '../src/submissions/private-status-service';
import { issueSubmissionStatusSecret } from '../src/submissions/status-secret';

const publicId = 'CPM-S-2026-000001';
const nextReviewAt = '2026-08-09T05:05:00.000Z';

describe('P5-02G private status Hold projection', () => {
  it('returns required action, public message, and next review time for on_hold only', async () => {
    const issued = await issueSubmissionStatusSecret(new Uint8Array(32).fill(8));
    const persistence = {
      async readPrivateStatusByPublicId() {
        return {
          publicId,
          workflowStatus: 'on_hold' as const,
          resolution: null,
          statusTokenHash: issued.tokenHash,
          requestedAction: 'No submitter action is required before the next review.',
          publicMessage: 'Review is paused until the next scheduled verification date.',
          nextReviewAt,
        };
      },
    } as unknown as SubmissionPersistenceBackend;
    const status = createSubmissionPrivateStatusService(persistence);

    await expect(status.read(publicId, issued.secret)).resolves.toEqual({
      publicId,
      statusLabel: 'on_hold',
      requestedAction: 'No submitter action is required before the next review.',
      publicMessage: 'Review is paused until the next scheduled verification date.',
      nextReviewAt,
      linkedPublicRecord: null,
      mediaDecisions: [],
      permittedActions: ['withdraw', 'rotate_status_secret'],
    });
  });

  it('suppresses Hold timing after status leaves on_hold', async () => {
    const issued = await issueSubmissionStatusSecret(new Uint8Array(32).fill(8));
    const persistence = {
      async readPrivateStatusByPublicId() {
        return {
          publicId,
          workflowStatus: 'in_review' as const,
          resolution: null,
          statusTokenHash: issued.tokenHash,
          requestedAction: 'Stored Hold action',
          publicMessage: 'Stored Hold message',
          nextReviewAt,
        };
      },
    } as unknown as SubmissionPersistenceBackend;
    const status = createSubmissionPrivateStatusService(persistence);

    await expect(status.read(publicId, issued.secret)).resolves.toMatchObject({
      statusLabel: 'under_review',
      requestedAction: null,
      publicMessage: null,
      nextReviewAt: null,
    });
  });
});
