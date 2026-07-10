import { describe, expect, it } from 'vitest';
import type { SubmissionPersistenceBackend } from '../src/submissions/persistence';
import { createSubmissionPrivateStatusService } from '../src/submissions/private-status-service';
import { issueSubmissionStatusSecret } from '../src/submissions/status-secret';

const publicId = 'CPM-S-2026-000001';

describe('P5-02F private status information request projection', () => {
  it('returns bounded requested action and public message for needs_information only', async () => {
    const issued = await issueSubmissionStatusSecret(new Uint8Array(32).fill(7));
    const persistence = {
      async readPrivateStatusByPublicId() {
        return {
          publicId,
          workflowStatus: 'needs_information' as const,
          resolution: null,
          statusTokenHash: issued.tokenHash,
          requestedAction: 'Please confirm which network is used for USDT.',
          publicMessage: 'We need the payment network before review can continue.',
          nextReviewAt: null,
        };
      },
    } as unknown as SubmissionPersistenceBackend;
    const status = createSubmissionPrivateStatusService(persistence);

    await expect(status.read(publicId, issued.secret)).resolves.toEqual({
      publicId,
      statusLabel: 'more_information_needed',
      requestedAction: 'Please confirm which network is used for USDT.',
      publicMessage: 'We need the payment network before review can continue.',
      nextReviewAt: null,
      linkedPublicRecord: null,
      mediaDecisions: [],
      permittedActions: ['provide_information', 'withdraw', 'rotate_status_secret'],
    });
  });

  it('suppresses information request text when workflow status is not needs_information', async () => {
    const issued = await issueSubmissionStatusSecret(new Uint8Array(32).fill(7));
    const persistence = {
      async readPrivateStatusByPublicId() {
        return {
          publicId,
          workflowStatus: 'in_review' as const,
          resolution: null,
          statusTokenHash: issued.tokenHash,
          requestedAction: 'Stored request text',
          publicMessage: 'Stored public message',
          nextReviewAt: null,
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
