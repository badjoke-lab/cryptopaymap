import { z } from 'zod';
import { photoParentMediaReference } from '../../submissions/photo-parent-resolution-contract';
import type { PhotoParentResolutionContext } from './photo-parent-resolution-authorization';
import type {
  PhotoParentResolutionBackend,
  PhotoParentResolutionMediaState,
  PhotoParentResolutionState,
} from './photo-parent-resolution';

const timestampSchema = z.iso.datetime({ offset: true });

export const photoParentResolutionPreviewMediaSchema = z
  .object({
    mediaReference: z
      .string()
      .min(8)
      .max(80)
      .regex(/^[A-Z0-9_-]+$/),
    mediaAssetId: z.uuid(),
    mediaUpdatedAt: timestampSchema,
    reviewStatus: z.enum(['pending', 'accepted', 'rejected']),
    publicDecision: z.enum(['pending', 'approved', 'rejected']),
    decisionId: z.uuid().nullable(),
    decisionAction: z.enum(['approve_public', 'reject']).nullable(),
    decisionDecidedAt: timestampSchema.nullable(),
    expectedReviewStatus: z.enum(['accepted', 'rejected']).nullable(),
  })
  .strict()
  .superRefine((item, context) => {
    const pendingShape =
      item.publicDecision === 'pending' &&
      item.reviewStatus === 'pending' &&
      item.decisionId === null &&
      item.decisionAction === null &&
      item.decisionDecidedAt === null &&
      item.expectedReviewStatus === null;
    const approvedShape =
      item.publicDecision === 'approved' &&
      item.reviewStatus === 'accepted' &&
      item.decisionId !== null &&
      item.decisionAction === 'approve_public' &&
      item.decisionDecidedAt !== null &&
      item.expectedReviewStatus === 'accepted';
    const rejectedShape =
      item.publicDecision === 'rejected' &&
      item.reviewStatus === 'rejected' &&
      item.decisionId !== null &&
      item.decisionAction === 'reject' &&
      item.decisionDecidedAt !== null &&
      item.expectedReviewStatus === 'rejected';
    if (!pendingShape && !approvedShape && !rejectedShape) {
      context.addIssue({
        code: 'custom',
        message: 'Photos parent preview Media decision fields are inconsistent.',
      });
    }
  });

export const photoParentResolutionExpectedRequestSchema = z
  .object({
    expectedSubmissionStatus: z.literal('in_review'),
    expectedSubmissionUpdatedAt: timestampSchema,
    expectedHandoffEventId: z.uuid(),
    expectedMedia: z
      .array(
        z
          .object({
            mediaAssetId: z.uuid(),
            expectedMediaUpdatedAt: timestampSchema,
            decisionId: z.uuid(),
            expectedDecisionAction: z.enum(['approve_public', 'reject']),
            expectedDecisionDecidedAt: timestampSchema,
            expectedReviewStatus: z.enum(['accepted', 'rejected']),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

export const photoParentResolutionPreviewResponseSchema = z
  .object({
    submissionId: z.uuid(),
    workflowStatus: z.string().trim().min(1).max(64),
    currentResolution: z.enum(['approved', 'partially_approved', 'not_approved']).nullable(),
    expectedSubmissionUpdatedAt: timestampSchema,
    handoffEventId: z.uuid().nullable(),
    readiness: z.enum(['ready', 'pending', 'not_in_review', 'resolved', 'blocked']),
    derivedResolution: z.enum(['approved', 'partially_approved', 'not_approved']).nullable(),
    approvedCount: z.number().int().min(0).max(8),
    rejectedCount: z.number().int().min(0).max(8),
    pendingCount: z.number().int().min(0).max(8),
    media: z.array(photoParentResolutionPreviewMediaSchema).max(8),
    expectedRequest: photoParentResolutionExpectedRequestSchema.nullable(),
    generatedAt: timestampSchema,
  })
  .strict()
  .superRefine((preview, context) => {
    if (
      preview.approvedCount + preview.rejectedCount + preview.pendingCount !==
      preview.media.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['media'],
        message: 'Photos parent preview counts must match the Media set.',
      });
    }
    if ((preview.readiness === 'ready') !== (preview.expectedRequest !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['expectedRequest'],
        message: 'Only a ready Photos parent preview may expose an exact request snapshot.',
      });
    }
    if (
      preview.readiness === 'ready' &&
      (preview.pendingCount !== 0 || preview.derivedResolution === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['readiness'],
        message: 'Ready Photos parent previews require complete child decisions.',
      });
    }
  });

export type PhotoParentResolutionPreviewResponse = z.infer<
  typeof photoParentResolutionPreviewResponseSchema
>;

export class PhotoParentResolutionPreviewError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'invalid_request' | 'not_found' | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoParentResolutionPreviewError';
  }
}

function targetMatches(
  state: PhotoParentResolutionState,
  media: PhotoParentResolutionMediaState,
): boolean {
  if (state.handoff === null) return false;
  return state.handoff.targetType === 'entity'
    ? media.entityId === state.handoff.targetId && media.locationId === null
    : media.locationId === state.handoff.targetId && media.entityId === null;
}

function inspectMedia(
  state: PhotoParentResolutionState,
  media: PhotoParentResolutionMediaState,
): z.infer<typeof photoParentResolutionPreviewMediaSchema> | null {
  if (media.deletedAt !== null || !targetMatches(state, media)) return null;

  if (
    media.reviewStatus === 'pending' &&
    media.purpose === 'public_gallery_candidate' &&
    media.visibility === 'private' &&
    media.decision === null
  ) {
    return {
      mediaReference: photoParentMediaReference(media.mediaAssetId),
      mediaAssetId: media.mediaAssetId,
      mediaUpdatedAt: media.updatedAt,
      reviewStatus: 'pending',
      publicDecision: 'pending',
      decisionId: null,
      decisionAction: null,
      decisionDecidedAt: null,
      expectedReviewStatus: null,
    };
  }

  if (
    media.reviewStatus === 'accepted' &&
    media.purpose === 'public_gallery' &&
    media.decision?.action === 'approve_public' &&
    media.decision.expectedReviewStatus === 'pending' &&
    media.decision.toReviewStatus === 'accepted' &&
    media.updatedAt === media.decision.decidedAt
  ) {
    return {
      mediaReference: photoParentMediaReference(media.mediaAssetId),
      mediaAssetId: media.mediaAssetId,
      mediaUpdatedAt: media.updatedAt,
      reviewStatus: 'accepted',
      publicDecision: 'approved',
      decisionId: media.decision.decisionId,
      decisionAction: 'approve_public',
      decisionDecidedAt: media.decision.decidedAt,
      expectedReviewStatus: 'accepted',
    };
  }

  if (
    media.reviewStatus === 'rejected' &&
    media.purpose === 'public_gallery_candidate' &&
    media.visibility === 'private' &&
    media.decision?.action === 'reject' &&
    media.decision.expectedReviewStatus === 'pending' &&
    media.decision.toReviewStatus === 'rejected' &&
    media.updatedAt === media.decision.decidedAt
  ) {
    return {
      mediaReference: photoParentMediaReference(media.mediaAssetId),
      mediaAssetId: media.mediaAssetId,
      mediaUpdatedAt: media.updatedAt,
      reviewStatus: 'rejected',
      publicDecision: 'rejected',
      decisionId: media.decision.decisionId,
      decisionAction: 'reject',
      decisionDecidedAt: media.decision.decidedAt,
      expectedReviewStatus: 'rejected',
    };
  }

  return null;
}

function derivedResolution(
  approvedCount: number,
  rejectedCount: number,
): 'approved' | 'partially_approved' | 'not_approved' | null {
  if (approvedCount + rejectedCount === 0) return null;
  if (rejectedCount === 0) return 'approved';
  if (approvedCount === 0) return 'not_approved';
  return 'partially_approved';
}

export async function loadPhotoParentResolutionPreview(
  context: PhotoParentResolutionContext,
  backend: PhotoParentResolutionBackend,
  submissionId: string,
  generatedAt = new Date(),
): Promise<PhotoParentResolutionPreviewResponse> {
  if (!context.capabilities.includes('submission:photos:resolve')) {
    throw new PhotoParentResolutionPreviewError(
      'unauthorized',
      'The actor is not authorized for Photos parent-resolution preview.',
    );
  }
  if (!z.uuid().safeParse(submissionId).success || Number.isNaN(generatedAt.getTime())) {
    throw new PhotoParentResolutionPreviewError(
      'invalid_request',
      'The Photos parent-resolution preview request is invalid.',
    );
  }

  let state: PhotoParentResolutionState | null;
  try {
    state = await backend.readState(submissionId);
  } catch (error) {
    throw new PhotoParentResolutionPreviewError(
      'backend_failure',
      'The Photos parent-resolution preview could not be loaded.',
      { cause: error },
    );
  }
  if (state === null || state.submissionType !== 'photos') {
    throw new PhotoParentResolutionPreviewError(
      'not_found',
      'The Photos Submission was not found.',
    );
  }

  let blocked = false;
  const inspected: z.infer<typeof photoParentResolutionPreviewMediaSchema>[] = [];
  if (
    state.handoff === null ||
    state.handoff.mediaAssetIds.length === 0 ||
    new Set(state.handoff.mediaAssetIds).size !== state.handoff.mediaAssetIds.length ||
    state.targetType !== state.handoff.targetType ||
    state.targetId !== state.handoff.targetId
  ) {
    blocked = true;
  } else {
    const mediaById = new Map(state.media.map((item) => [item.mediaAssetId, item]));
    if (mediaById.size !== state.handoff.mediaAssetIds.length) {
      blocked = true;
    } else {
      for (const mediaAssetId of state.handoff.mediaAssetIds) {
        const media = mediaById.get(mediaAssetId);
        const item = media === undefined ? null : inspectMedia(state, media);
        if (item === null) {
          blocked = true;
          break;
        }
        inspected.push(photoParentResolutionPreviewMediaSchema.parse(item));
      }
    }
  }

  const approvedCount = inspected.filter((item) => item.publicDecision === 'approved').length;
  const rejectedCount = inspected.filter((item) => item.publicDecision === 'rejected').length;
  const pendingCount = inspected.filter((item) => item.publicDecision === 'pending').length;
  const outcome = pendingCount === 0 ? derivedResolution(approvedCount, rejectedCount) : null;
  const currentResolution = ['approved', 'partially_approved', 'not_approved'].includes(
    state.resolution ?? '',
  )
    ? (state.resolution as 'approved' | 'partially_approved' | 'not_approved')
    : null;
  const readiness = blocked
    ? 'blocked'
    : state.workflowStatus === 'resolved'
      ? 'resolved'
      : state.workflowStatus !== 'in_review'
        ? 'not_in_review'
        : pendingCount > 0
          ? 'pending'
          : 'ready';

  const expectedRequest =
    readiness === 'ready' && state.handoff !== null
      ? {
          expectedSubmissionStatus: 'in_review' as const,
          expectedSubmissionUpdatedAt: state.updatedAt,
          expectedHandoffEventId: state.handoff.eventId,
          expectedMedia: inspected.map((item) => ({
            mediaAssetId: item.mediaAssetId,
            expectedMediaUpdatedAt: item.mediaUpdatedAt,
            decisionId: item.decisionId as string,
            expectedDecisionAction: item.decisionAction as 'approve_public' | 'reject',
            expectedDecisionDecidedAt: item.decisionDecidedAt as string,
            expectedReviewStatus: item.expectedReviewStatus as 'accepted' | 'rejected',
          })),
        }
      : null;

  return photoParentResolutionPreviewResponseSchema.parse({
    submissionId: state.submissionId,
    workflowStatus: state.workflowStatus,
    currentResolution,
    expectedSubmissionUpdatedAt: state.updatedAt,
    handoffEventId: state.handoff?.eventId ?? null,
    readiness,
    derivedResolution: outcome,
    approvedCount,
    rejectedCount,
    pendingCount,
    media: inspected,
    expectedRequest,
    generatedAt: generatedAt.toISOString(),
  });
}
