import { describe, expect, it } from 'vitest';
import { SubmissionPersistenceError } from '../src/submissions/persistence';
import {
  PhotoParentResolutionError,
  resolvePhotoParentSubmission,
  type PhotoParentResolutionBackend,
  type PhotoParentResolutionCommitCommand,
  type PhotoParentResolutionState,
} from '../src/admin/submissions/photo-parent-resolution';

const submissionId = '10000000-0000-4000-8000-000000000001';
const handoffEventId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const entityId = '40000000-0000-4000-8000-000000000001';
const mediaIds = [
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
] as const;
const decisionIds = [
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002',
] as const;
const submissionUpdatedAt = '2026-07-16T05:00:00.000Z';
const decidedAt = ['2026-07-16T05:01:00.000Z', '2026-07-16T05:02:00.000Z'] as const;
const changedAt = new Date('2026-07-16T05:03:00.000Z');
const context = {
  actorId: 'reviewer:photos',
  actorType: 'human' as const,
  capabilities: ['submission:photos:resolve'] as ['submission:photos:resolve'],
};

function makeState(
  statuses: Array<'accepted' | 'rejected' | 'pending'>,
): PhotoParentResolutionState {
  return {
    submissionId,
    submissionType: 'photos',
    targetType: 'entity',
    targetId: entityId,
    workflowStatus: 'in_review',
    resolution: null,
    updatedAt: submissionUpdatedAt,
    handoff: {
      eventId: handoffEventId,
      targetType: 'entity',
      targetId: entityId,
      mediaAssetIds: mediaIds.slice(0, statuses.length),
    },
    media: statuses.map((status, index) => ({
      mediaAssetId: mediaIds[index] ?? mediaIds[0],
      updatedAt: status === 'pending' ? submissionUpdatedAt : (decidedAt[index] ?? decidedAt[0]),
      reviewStatus: status,
      purpose: status === 'accepted' ? 'public_gallery' : 'public_gallery_candidate',
      visibility: status === 'accepted' ? 'public' : 'private',
      entityId,
      locationId: null,
      deletedAt: null,
      decision:
        status === 'pending'
          ? null
          : {
              decisionId: decisionIds[index] ?? decisionIds[0],
              action: status === 'accepted' ? 'approve_public' : 'reject',
              expectedReviewStatus: 'pending',
              toReviewStatus: status,
              decidedAt: decidedAt[index] ?? decidedAt[0],
            },
    })),
  };
}

function requestFor(state: PhotoParentResolutionState, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'photo-parent-resolution-v1',
    requestId,
    expectedSubmissionStatus: 'in_review',
    expectedSubmissionUpdatedAt: state.updatedAt,
    expectedHandoffEventId: state.handoff?.eventId,
    expectedMedia: state.media
      .filter((item) => item.decision !== null)
      .map((item) => ({
        mediaAssetId: item.mediaAssetId,
        expectedMediaUpdatedAt: item.updatedAt,
        decisionId: item.decision?.decisionId,
        expectedDecisionAction: item.decision?.action,
        expectedDecisionDecidedAt: item.decision?.decidedAt,
        expectedReviewStatus: item.reviewStatus,
      })),
    publicMessage: 'Review of all submitted photos is complete.',
    internalNote: 'Parent outcome derived from durable Media decisions.',
    ...overrides,
  };
}

function createBackend(initialState: PhotoParentResolutionState): PhotoParentResolutionBackend & {
  commits: PhotoParentResolutionCommitCommand[];
  failAfterEvent: boolean;
} {
  let state = structuredClone(initialState);
  const events = new Map<string, Awaited<ReturnType<PhotoParentResolutionBackend['readEvent']>>>();
  const commits: PhotoParentResolutionCommitCommand[] = [];
  const backend: PhotoParentResolutionBackend & {
    commits: PhotoParentResolutionCommitCommand[];
    failAfterEvent: boolean;
  } = {
    commits,
    failAfterEvent: false,
    async readEvent(eventId) {
      return events.get(eventId) ?? null;
    },
    async readState(id) {
      return id === submissionId ? structuredClone(state) : null;
    },
    async commitResolution(command) {
      commits.push(command);
      const event = {
        eventId: command.eventId,
        submissionId: command.submissionId,
        fromStatus: 'in_review',
        toStatus: 'resolved',
        action: 'photo_parent_resolution_decided',
        reasonCode: command.reasonCode,
        actorId: command.actorId,
        internalNote: command.internalNote,
        createdAt: command.changedAt.toISOString(),
      };
      events.set(command.eventId, event);
      if (backend.failAfterEvent) {
        throw new SubmissionPersistenceError('conflict', 'synthetic concurrent commit');
      }
      state = {
        ...state,
        workflowStatus: 'resolved',
        resolution: command.resolution,
        updatedAt: command.changedAt.toISOString(),
      };
    },
  };
  return backend;
}

describe('P5-06E Photos parent resolution', () => {
  it.each([
    {
      statuses: ['accepted', 'accepted'] as const,
      resolution: 'approved',
      approved: 2,
      rejected: 0,
    },
    {
      statuses: ['accepted', 'rejected'] as const,
      resolution: 'partially_approved',
      approved: 1,
      rejected: 1,
    },
    {
      statuses: ['rejected', 'rejected'] as const,
      resolution: 'not_approved',
      approved: 0,
      rejected: 2,
    },
  ])('derives $resolution only from the complete child decision set', async (example) => {
    const state = makeState([...example.statuses]);
    const backend = createBackend(state);

    const receipt = await resolvePhotoParentSubmission(
      context,
      backend,
      submissionId,
      requestFor(state),
      changedAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      submissionId,
      fromStatus: 'in_review',
      toStatus: 'resolved',
      resolution: example.resolution,
      approvedCount: example.approved,
      rejectedCount: example.rejected,
    });
    expect(receipt.mediaDecisions).toHaveLength(2);
    expect(backend.commits[0]).toMatchObject({
      submissionId,
      handoffEventId,
      resolution: example.resolution,
      media: expect.arrayContaining([
        expect.objectContaining({ mediaAssetId: mediaIds[0] }),
        expect.objectContaining({ mediaAssetId: mediaIds[1] }),
      ]),
    });
    expect(JSON.stringify(receipt)).not.toContain('internalNote');
    expect(JSON.stringify(receipt)).not.toContain('storage');
  });

  it('rejects parent resolution while any handed-off Media item remains pending', async () => {
    const state = makeState(['accepted', 'pending']);
    const backend = createBackend(state);

    await expect(
      resolvePhotoParentSubmission(context, backend, submissionId, requestFor(state), changedAt),
    ).rejects.toMatchObject({ code: 'ineligible' });
    expect(backend.commits).toHaveLength(0);
  });

  it('rejects stale child decision snapshots', async () => {
    const state = makeState(['accepted', 'rejected']);
    const backend = createBackend(state);
    const request = requestFor(state);
    const expectedMedia = structuredClone(request.expectedMedia);
    const firstExpectedMedia = expectedMedia[0];
    if (firstExpectedMedia === undefined) throw new Error('Expected Media snapshot is missing.');
    firstExpectedMedia.expectedMediaUpdatedAt = '2026-07-16T04:59:00.000Z';

    await expect(
      resolvePhotoParentSubmission(
        context,
        backend,
        submissionId,
        { ...request, expectedMedia },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('replays the same request and rejects changed content under the same UUID', async () => {
    const state = makeState(['accepted', 'rejected']);
    const backend = createBackend(state);
    const request = requestFor(state);

    const committed = await resolvePhotoParentSubmission(
      context,
      backend,
      submissionId,
      request,
      changedAt,
    );
    const replayed = await resolvePhotoParentSubmission(
      context,
      backend,
      submissionId,
      request,
      new Date('2026-07-16T06:00:00.000Z'),
    );

    expect(committed.state).toBe('committed');
    expect(replayed).toMatchObject({ state: 'replayed', resolution: 'partially_approved' });
    expect(backend.commits).toHaveLength(1);
    await expect(
      resolvePhotoParentSubmission(
        context,
        backend,
        submissionId,
        requestFor(state, { publicMessage: 'Changed public content.' }),
        changedAt,
      ),
    ).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
  });

  it('recovers a replay after a concurrent unique conflict', async () => {
    const state = makeState(['accepted', 'accepted']);
    const backend = createBackend(state);
    backend.failAfterEvent = true;

    await expect(
      resolvePhotoParentSubmission(context, backend, submissionId, requestFor(state), changedAt),
    ).resolves.toMatchObject({ state: 'replayed', resolution: 'approved' });
  });

  it('fails authorization before reading protected state', async () => {
    const state = makeState(['accepted']);
    const backend = createBackend(state);

    await expect(
      resolvePhotoParentSubmission(
        { actorId: 'reviewer:nope', actorType: 'human', capabilities: [] as never },
        backend,
        submissionId,
        requestFor(state),
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.commits).toHaveLength(0);
  });
});
