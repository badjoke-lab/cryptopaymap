import { describe, expect, it } from 'vitest';
import { createSubmissionPrivateStatusService } from '../src/submissions/private-status-service';
import { issueSubmissionStatusSecret } from '../src/submissions/status-secret';
import type { SubmissionPersistenceBackend } from '../src/submissions/persistence';

const publicId = 'CPM-S-2026-000001';

function backend(
  tokenHash: string,
  mediaDecisions: Array<{
    mediaReference: string;
    decision: 'pending' | 'approved' | 'rejected';
  }>,
): SubmissionPersistenceBackend {
  return {
    async allocatePublicReference() {
      throw new Error('not used');
    },
    async readByIntakeRequestId() {
      return null;
    },
    async readPrivateStatusByPublicId(requestedPublicId) {
      if (requestedPublicId !== publicId) return null;
      return {
        publicId,
        workflowStatus: 'resolved',
        resolution: 'partially_approved',
        statusTokenHash: tokenHash,
        requestedAction: null,
        publicMessage: 'One submitted photo was approved and one was not approved.',
        nextReviewAt: null,
        mediaDecisions,
      };
    },
    async createSubmission() {
      throw new Error('not used');
    },
    async transitionSubmission() {
      throw new Error('not used');
    },
  };
}

describe('P5-06E Photos private status projection', () => {
  it('reveals only bounded per-Media decisions after parent resolution', async () => {
    const issued = await issueSubmissionStatusSecret(new Uint8Array(32).fill(11));
    const mediaDecisions = [
      {
        mediaReference: 'MEDIA-50000000-0000-4000-8000-000000000001',
        decision: 'approved' as const,
      },
      {
        mediaReference: 'MEDIA-50000000-0000-4000-8000-000000000002',
        decision: 'rejected' as const,
      },
    ];
    const service = createSubmissionPrivateStatusService(backend(issued.tokenHash, mediaDecisions));

    const result = await service.read(publicId, issued.secret);

    expect(result).toEqual({
      publicId,
      statusLabel: 'partially_approved',
      requestedAction: null,
      publicMessage: 'One submitted photo was approved and one was not approved.',
      nextReviewAt: null,
      linkedPublicRecord: null,
      mediaDecisions,
      permittedActions: [],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('reviewer');
    expect(serialized).not.toContain('internalNote');
    expect(serialized).not.toContain('proof');
  });
});
