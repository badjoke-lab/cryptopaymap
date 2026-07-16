import { describe, expect, it, vi } from 'vitest';
import { loadPhotoParentResolutionPreview } from '../src/admin/submissions/photo-parent-resolution-preview';
import type {
  PhotoParentResolutionBackend,
  PhotoParentResolutionState,
} from '../src/admin/submissions/photo-parent-resolution';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const handoffEventId = '30000000-0000-4000-8000-000000000001';
const mediaIds = [
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
] as const;
const decisionIds = [
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
] as const;
const updatedAt = '2026-07-16T06:00:00.000Z';
const decisionTimes = [
  '2026-07-16T05:58:00.000Z',
  '2026-07-16T05:59:00.000Z',
] as const;
const generatedAt = new Date('2026-07-16T06:01:00.000Z');
const context = {
  actorId: 'reviewer:photos',
  actorType: 'human' as const,
  capabilities: ['submission:photos:resolve'] as ['submission:photos:resolve'],
};

function state(
  outcomes: Array<'approved' | 'rejected' | 'pending'>,
  overrides: Partial<PhotoParentResolutionState> = {},
): PhotoParentResolutionState {
  return {
    submissionId,
    submissionType: 'photos',
    targetType: 'entity',
    targetId: entityId,
    workflowStatus: 'in_review',
    resolution: null,
    updatedAt,
    handoff: {
      eventId: handoffEventId,
      targetType: 'entity',
      targetId: entityId,
      mediaAssetIds: mediaIds.slice(0, outcomes.length),
    },
    media: outcomes.map((outcome, index) => {
      const mediaAssetId = mediaIds[index] ?? mediaIds[0];
      const decisionId = decisionIds[index] ?? decisionIds[0];
      const decidedAt = decisionTimes[index] ?? decisionTimes[0];
      if (outcome === 'pending') {
        return {
          mediaAssetId,
          updatedAt,
          reviewStatus: 'pending',
          purpose: 'public_gallery_candidate',
          visibility: 'private',
          entityId,
          locationId: null,
          deletedAt: null,
          decision: null,
        };
      }
      const approved = outcome === 'approved';
      return {
        mediaAssetId,
        updatedAt: decidedAt,
        reviewStatus: approved ? 'accepted' : 'rejected',
        purpose: approved ? 'public_gallery' : 'public_gallery_candidate',
        visibility: approved ? 'public' : 'private',
        entityId,
        locationId: null,
        deletedAt: null,
        decision: {
          decisionId,
          action: approved ? 'approve_public' : 'reject',
          expectedReviewStatus: 'pending',
          toReviewStatus: approved ? 'accepted' : 'rejected',
          decidedAt,
        },
      };
    }),
    ...overrides,
  };
}

function backend(value: PhotoParentResolutionState | null): PhotoParentResolutionBackend {
  return {
    async readEvent() {
      return null;
    },
    async readState(requestedId) {
      return requestedId === submissionId ? structuredClone(value) : null;
    },
    async commitResolution() {
      throw new Error('preview must not commit');
    },
  };
}

describe('P5-06E2 Photos parent resolution preview', () => {
  it('projects the exact complete mixed child set and derived outcome', async () => {
    const result = await loadPhotoParentResolutionPreview(
      context,
      backend(state(['approved', 'rejected'])),
      submissionId,
      generatedAt,
    );

    expect(result).toMatchObject({
      submissionId,
      workflowStatus: 'in_review',
      readiness: 'ready',
      derivedResolution: 'partially_approved',
      approvedCount: 1,
      rejectedCount: 1,
      pendingCount: 0,
      handoffEventId,
    });
    expect(result.expectedRequest).toEqual({
      expectedSubmissionStatus: 'in_review',
      expectedSubmissionUpdatedAt: updatedAt,
      expectedHandoffEventId: handoffEventId,
      expectedMedia: [
        {
          mediaAssetId: mediaIds[0],
          expectedMediaUpdatedAt: decisionTimes[0],
          decisionId: decisionIds[0],
          expectedDecisionAction: 'approve_public',
          expectedDecisionDecidedAt: decisionTimes[0],
          expectedReviewStatus: 'accepted',
        },
        {
          mediaAssetId: mediaIds[1],
          expectedMediaUpdatedAt: decisionTimes[1],
          decisionId: decisionIds[1],
          expectedDecisionAction: 'reject',
          expectedDecisionDecidedAt: decisionTimes[1],
          expectedReviewStatus: 'rejected',
        },
      ],
    });
    expect(result.media.map((item) => item.publicDecision)).toEqual(['approved', 'rejected']);
    expect(JSON.stringify(result)).not.toContain('storage');
    expect(JSON.stringify(result)).not.toContain('reviewer');
    expect(JSON.stringify(result)).not.toContain('privateProof');
  });

  it('shows pending children without exposing a mutation request', async () => {
    const result = await loadPhotoParentResolutionPreview(
      context,
      backend(state(['approved', 'pending'])),
      submissionId,
      generatedAt,
    );
    expect(result).toMatchObject({
      readiness: 'pending',
      derivedResolution: null,
      approvedCount: 1,
      rejectedCount: 0,
      pendingCount: 1,
      expectedRequest: null,
    });
  });

  it('separates non-review and already-resolved parent states', async () => {
    const triage = await loadPhotoParentResolutionPreview(
      context,
      backend(state(['approved'], { workflowStatus: 'triage' })),
      submissionId,
      generatedAt,
    );
    expect(triage).toMatchObject({ readiness: 'not_in_review', expectedRequest: null });

    const resolved = await loadPhotoParentResolutionPreview(
      context,
      backend(state(['approved'], { workflowStatus: 'resolved', resolution: 'approved' })),
      submissionId,
      generatedAt,
    );
    expect(resolved).toMatchObject({
      readiness: 'resolved',
      currentResolution: 'approved',
      derivedResolution: 'approved',
      expectedRequest: null,
    });
  });

  it('blocks inconsistent handoff or child state instead of manufacturing a request', async () => {
    const inconsistent = state(['approved', 'rejected']);
    inconsistent.media = inconsistent.media.slice(0, 1);
    const result = await loadPhotoParentResolutionPreview(
      context,
      backend(inconsistent),
      submissionId,
      generatedAt,
    );
    expect(result).toMatchObject({ readiness: 'blocked', expectedRequest: null, media: [] });
  });

  it('fails authorization before reading parent state', async () => {
    const readState = vi.fn();
    const deniedBackend: PhotoParentResolutionBackend = {
      async readEvent() {
        return null;
      },
      readState,
      async commitResolution() {
        throw new Error('not used');
      },
    };
    await expect(
      loadPhotoParentResolutionPreview(
        { actorId: 'reviewer:nope', actorType: 'human', capabilities: [] as never },
        deniedBackend,
        submissionId,
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(readState).not.toHaveBeenCalled();
  });
});
