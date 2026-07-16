import { z } from 'zod';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import {
  photoParentMediaDecisionSnapshotSchema,
  photoParentMediaReference,
  photoParentResolutionInternalNoteSchema,
  photoParentResolutionPublicMessageSchema,
  photoParentResolutionValueSchema,
  parsePhotoParentResolutionEventPayload,
  serializePhotoParentResolutionEventPayload,
  type PhotoParentMediaDecisionSnapshot,
} from '../../submissions/photo-parent-resolution-contract';
import type { PhotoParentResolutionContext } from './photo-parent-resolution-authorization';

const timestampSchema = z.iso.datetime({ offset: true });
const expectedMediaSchema = z
  .object({
    mediaAssetId: z.uuid(),
    expectedMediaUpdatedAt: timestampSchema,
    decisionId: z.uuid(),
    expectedDecisionAction: z.enum(['approve_public', 'reject']),
    expectedDecisionDecidedAt: timestampSchema,
    expectedReviewStatus: z.enum(['accepted', 'rejected']),
  })
  .strict()
  .superRefine((item, context) => {
    if (
      (item.expectedDecisionAction === 'approve_public' &&
        item.expectedReviewStatus !== 'accepted') ||
      (item.expectedDecisionAction === 'reject' && item.expectedReviewStatus !== 'rejected')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expectedReviewStatus'],
        message: 'Expected Media action and status must match.',
      });
    }
  });

export const photoParentResolutionRequestSchema = z
  .object({
    schemaVersion: z.literal('photo-parent-resolution-v1'),
    requestId: z.uuid(),
    expectedSubmissionStatus: z.literal('in_review'),
    expectedSubmissionUpdatedAt: timestampSchema,
    expectedHandoffEventId: z.uuid(),
    expectedMedia: z.array(expectedMediaSchema).min(1).max(8),
    publicMessage: photoParentResolutionPublicMessageSchema,
    internalNote: photoParentResolutionInternalNoteSchema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    const ids = request.expectedMedia.map((item) => item.mediaAssetId);
    const decisionIds = request.expectedMedia.map((item) => item.decisionId);
    if (new Set(ids).size !== ids.length || new Set(decisionIds).size !== decisionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['expectedMedia'],
        message: 'Expected Photos parent Media decisions must be unique.',
      });
    }
  });

export const photoParentResolutionReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    fromStatus: z.literal('in_review'),
    toStatus: z.literal('resolved'),
    resolution: photoParentResolutionValueSchema,
    publicMessage: photoParentResolutionPublicMessageSchema,
    approvedCount: z.number().int().min(0).max(8),
    rejectedCount: z.number().int().min(0).max(8),
    mediaDecisions: z
      .array(
        z
          .object({
            mediaReference: z.string().min(8).max(80).regex(/^[A-Z0-9_-]+$/),
            decision: z.enum(['approved', 'rejected']),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    changedAt: timestampSchema,
  })
  .strict();

export type PhotoParentResolutionRequest = z.infer<typeof photoParentResolutionRequestSchema>;
export type PhotoParentResolutionReceipt = z.infer<typeof photoParentResolutionReceiptSchema>;

export interface PhotoParentResolutionMediaState {
  mediaAssetId: string;
  updatedAt: string;
  reviewStatus: 'pending' | 'accepted' | 'rejected' | 'superseded';
  purpose:
    | 'evidence'
    | 'owner_verification'
    | 'public_gallery_candidate'
    | 'public_gallery'
    | 'canonical_logo';
  visibility: 'private' | 'public' | 'restricted';
  entityId: string | null;
  locationId: string | null;
  deletedAt: string | null;
  decision: {
    decisionId: string;
    action: 'approve_public' | 'reject';
    expectedReviewStatus: 'pending';
    toReviewStatus: 'accepted' | 'rejected';
    decidedAt: string;
  } | null;
}

export interface PhotoParentResolutionState {
  submissionId: string;
  submissionType: string;
  targetType: string | null;
  targetId: string | null;
  workflowStatus: string;
  resolution: string | null;
  updatedAt: string;
  handoff: {
    eventId: string;
    targetType: 'entity' | 'location';
    targetId: string;
    mediaAssetIds: string[];
  } | null;
  media: PhotoParentResolutionMediaState[];
}

export interface PhotoParentResolutionEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  reasonCode: string | null;
  actorId: string;
  internalNote: string | null;
  createdAt: string;
}

export interface PhotoParentResolutionCommitCommand {
  eventId: string;
  submissionId: string;
  expectedSubmissionUpdatedAt: Date;
  handoffEventId: string;
  resolution: 'approved' | 'partially_approved' | 'not_approved';
  reasonCode: 'all_media_approved' | 'media_partially_approved' | 'all_media_rejected';
  actorId: string;
  actorType: 'human' | 'system';
  internalNote: string;
  media: Array<{
    mediaAssetId: string;
    expectedMediaUpdatedAt: Date;
    decisionId: string;
    expectedDecisionAction: 'approve_public' | 'reject';
    expectedDecisionDecidedAt: Date;
    expectedReviewStatus: 'accepted' | 'rejected';
  }>;
  changedAt: Date;
}

export interface PhotoParentResolutionBackend {
  readEvent(eventId: string): Promise<PhotoParentResolutionEventRecord | null>;
  readState(submissionId: string): Promise<PhotoParentResolutionState | null>;
  commitResolution(command: PhotoParentResolutionCommitCommand): Promise<void>;
}

export class PhotoParentResolutionError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'idempotency_conflict'
      | 'ineligible'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoParentResolutionError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonicalize(value))),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sortedExpectedMedia(request: PhotoParentResolutionRequest) {
  return [...request.expectedMedia].sort((left, right) =>
    left.mediaAssetId.localeCompare(right.mediaAssetId),
  );
}

function resolutionForMedia(media: PhotoParentMediaDecisionSnapshot[]): {
  resolution: 'approved' | 'partially_approved' | 'not_approved';
  reasonCode: 'all_media_approved' | 'media_partially_approved' | 'all_media_rejected';
  approvedCount: number;
  rejectedCount: number;
} {
  const approvedCount = media.filter((item) => item.decision === 'approved').length;
  const rejectedCount = media.length - approvedCount;
  if (rejectedCount === 0) {
    return { resolution: 'approved', reasonCode: 'all_media_approved', approvedCount, rejectedCount };
  }
  if (approvedCount === 0) {
    return {
      resolution: 'not_approved',
      reasonCode: 'all_media_rejected',
      approvedCount,
      rejectedCount,
    };
  }
  return {
    resolution: 'partially_approved',
    reasonCode: 'media_partially_approved',
    approvedCount,
    rejectedCount,
  };
}

function receiptFromPayload(
  state: 'committed' | 'replayed',
  payload: NonNullable<ReturnType<typeof parsePhotoParentResolutionEventPayload>>,
  changedAt: string,
): PhotoParentResolutionReceipt {
  const outcome = resolutionForMedia(payload.media);
  return photoParentResolutionReceiptSchema.parse({
    state,
    submissionId: payload.submissionId,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: payload.resolution,
    publicMessage: payload.publicMessage,
    approvedCount: outcome.approvedCount,
    rejectedCount: outcome.rejectedCount,
    mediaDecisions: payload.media.map(({ mediaReference, decision }) => ({
      mediaReference,
      decision,
    })),
    changedAt,
  });
}

function replayReceipt(
  event: PhotoParentResolutionEventRecord,
  submissionId: string,
  request: PhotoParentResolutionRequest,
  actorId: string,
  requestFingerprint: string,
): PhotoParentResolutionReceipt {
  const payload = parsePhotoParentResolutionEventPayload(event.internalNote);
  if (
    event.submissionId !== submissionId ||
    event.fromStatus !== 'in_review' ||
    event.toStatus !== 'resolved' ||
    event.action !== 'photo_parent_resolution_decided' ||
    event.actorId !== actorId ||
    payload === null ||
    payload.requestId !== request.requestId ||
    payload.requestFingerprint !== requestFingerprint ||
    payload.expectedSubmissionUpdatedAt !== request.expectedSubmissionUpdatedAt ||
    payload.handoffEventId !== request.expectedHandoffEventId ||
    payload.publicMessage !== request.publicMessage ||
    payload.internalNote !== request.internalNote
  ) {
    throw new PhotoParentResolutionError(
      'idempotency_conflict',
      'The Photos parent-resolution request ID was already used for a different operation.',
    );
  }
  return receiptFromPayload('replayed', payload, event.createdAt);
}

function buildMediaSnapshots(state: PhotoParentResolutionState): PhotoParentMediaDecisionSnapshot[] {
  if (state.handoff === null) {
    throw new PhotoParentResolutionError(
      'ineligible',
      'The Photos Submission has no completed private Media handoff.',
    );
  }
  if (
    state.targetType !== state.handoff.targetType ||
    state.targetId !== state.handoff.targetId ||
    state.handoff.mediaAssetIds.length === 0 ||
    new Set(state.handoff.mediaAssetIds).size !== state.handoff.mediaAssetIds.length
  ) {
    throw new PhotoParentResolutionError(
      'ineligible',
      'The Photos Media handoff is inconsistent with the parent Submission.',
    );
  }

  const mediaById = new Map(state.media.map((item) => [item.mediaAssetId, item]));
  if (mediaById.size !== state.handoff.mediaAssetIds.length) {
    throw new PhotoParentResolutionError(
      'ineligible',
      'The Photos Media handoff set is incomplete.',
    );
  }

  return state.handoff.mediaAssetIds.map((mediaAssetId) => {
    const item = mediaById.get(mediaAssetId);
    if (item === undefined || item.deletedAt !== null || item.decision === null) {
      throw new PhotoParentResolutionError(
        'ineligible',
        'Every handed-off Media item requires a retained durable review decision.',
      );
    }
    const expectedTargetMatches =
      state.handoff?.targetType === 'entity'
        ? item.entityId === state.handoff.targetId && item.locationId === null
        : item.locationId === state.handoff?.targetId && item.entityId === null;
    const approved =
      item.reviewStatus === 'accepted' &&
      item.purpose === 'public_gallery' &&
      item.decision.action === 'approve_public' &&
      item.decision.expectedReviewStatus === 'pending' &&
      item.decision.toReviewStatus === 'accepted';
    const rejected =
      item.reviewStatus === 'rejected' &&
      item.purpose === 'public_gallery_candidate' &&
      item.visibility === 'private' &&
      item.decision.action === 'reject' &&
      item.decision.expectedReviewStatus === 'pending' &&
      item.decision.toReviewStatus === 'rejected';
    if (!expectedTargetMatches || (!approved && !rejected)) {
      throw new PhotoParentResolutionError(
        'ineligible',
        'A handed-off Media item does not have an eligible final review decision.',
      );
    }
    if (item.updatedAt !== item.decision.decidedAt) {
      throw new PhotoParentResolutionError(
        'ineligible',
        'A handed-off Media item changed after its durable review decision.',
      );
    }
    return photoParentMediaDecisionSnapshotSchema.parse({
      mediaReference: photoParentMediaReference(item.mediaAssetId),
      mediaAssetId: item.mediaAssetId,
      mediaUpdatedAt: item.updatedAt,
      decisionId: item.decision.decisionId,
      decisionAction: item.decision.action,
      decisionDecidedAt: item.decision.decidedAt,
      decision: approved ? 'approved' : 'rejected',
    });
  });
}

function assertExpectedMedia(
  request: PhotoParentResolutionRequest,
  current: PhotoParentMediaDecisionSnapshot[],
): void {
  const expected = sortedExpectedMedia(request);
  const actual = [...current]
    .sort((left, right) => left.mediaAssetId.localeCompare(right.mediaAssetId))
    .map((item) => ({
      mediaAssetId: item.mediaAssetId,
      expectedMediaUpdatedAt: item.mediaUpdatedAt,
      decisionId: item.decisionId,
      expectedDecisionAction: item.decisionAction,
      expectedDecisionDecidedAt: item.decisionDecidedAt,
      expectedReviewStatus: item.decision === 'approved' ? 'accepted' : 'rejected',
    }));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new PhotoParentResolutionError(
      'conflict',
      'The Photos child Media decisions changed before parent resolution.',
    );
  }
}

async function readEvent(
  backend: PhotoParentResolutionBackend,
  eventId: string,
): Promise<PhotoParentResolutionEventRecord | null> {
  try {
    return await backend.readEvent(eventId);
  } catch (error) {
    throw new PhotoParentResolutionError(
      'backend_failure',
      'The Photos parent-resolution replay check failed.',
      { cause: error },
    );
  }
}

async function readState(
  backend: PhotoParentResolutionBackend,
  submissionId: string,
): Promise<PhotoParentResolutionState | null> {
  try {
    return await backend.readState(submissionId);
  } catch (error) {
    throw new PhotoParentResolutionError(
      'backend_failure',
      'The Photos parent-resolution state could not be loaded.',
      { cause: error },
    );
  }
}

export async function resolvePhotoParentSubmission(
  context: PhotoParentResolutionContext,
  backend: PhotoParentResolutionBackend,
  submissionId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<PhotoParentResolutionReceipt> {
  if (!context.capabilities.includes('submission:photos:resolve')) {
    throw new PhotoParentResolutionError(
      'unauthorized',
      'The actor is not authorized for Photos parent resolution.',
    );
  }

  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = photoParentResolutionRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(changedAt.getTime())) {
    throw new PhotoParentResolutionError(
      'invalid_request',
      'The Photos parent-resolution request is invalid.',
    );
  }
  const request = requestResult.data;
  const requestFingerprint = await sha256(request);

  const existing = await readEvent(backend, request.requestId);
  if (existing !== null) {
    return replayReceipt(existing, submissionIdResult.data, request, context.actorId, requestFingerprint);
  }

  const state = await readState(backend, submissionIdResult.data);
  if (state === null || state.submissionType !== 'photos') {
    throw new PhotoParentResolutionError('not_found', 'The Photos Submission was not found.');
  }
  if (
    state.workflowStatus !== request.expectedSubmissionStatus ||
    state.resolution !== null ||
    state.updatedAt !== request.expectedSubmissionUpdatedAt
  ) {
    throw new PhotoParentResolutionError(
      'conflict',
      'The Photos parent Submission changed before resolution.',
    );
  }
  if (state.handoff?.eventId !== request.expectedHandoffEventId) {
    throw new PhotoParentResolutionError(
      'conflict',
      'The Photos Media handoff changed before parent resolution.',
    );
  }

  const media = buildMediaSnapshots(state);
  assertExpectedMedia(request, media);
  const outcome = resolutionForMedia(media);
  const internalNote = serializePhotoParentResolutionEventPayload({
    schemaVersion: 'photo-parent-resolution-event-v1',
    requestFingerprint,
    requestId: request.requestId,
    submissionId: submissionIdResult.data,
    expectedSubmissionUpdatedAt: request.expectedSubmissionUpdatedAt,
    handoffEventId: request.expectedHandoffEventId,
    resolution: outcome.resolution,
    reasonCode: outcome.reasonCode,
    publicMessage: request.publicMessage,
    internalNote: request.internalNote,
    media,
  });

  try {
    await backend.commitResolution({
      eventId: request.requestId,
      submissionId: submissionIdResult.data,
      expectedSubmissionUpdatedAt: new Date(request.expectedSubmissionUpdatedAt),
      handoffEventId: request.expectedHandoffEventId,
      resolution: outcome.resolution,
      reasonCode: outcome.reasonCode,
      actorId: context.actorId,
      actorType: context.actorType,
      internalNote,
      media: sortedExpectedMedia(request).map((item) => ({
        mediaAssetId: item.mediaAssetId,
        expectedMediaUpdatedAt: new Date(item.expectedMediaUpdatedAt),
        decisionId: item.decisionId,
        expectedDecisionAction: item.expectedDecisionAction,
        expectedDecisionDecidedAt: new Date(item.expectedDecisionDecidedAt),
        expectedReviewStatus: item.expectedReviewStatus,
      })),
      changedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      const raced = await readEvent(backend, request.requestId);
      if (raced !== null) {
        return replayReceipt(
          raced,
          submissionIdResult.data,
          request,
          context.actorId,
          requestFingerprint,
        );
      }
      throw new PhotoParentResolutionError(
        'conflict',
        'The Photos parent or child Media state changed before resolution committed.',
        { cause: error },
      );
    }
    throw new PhotoParentResolutionError(
      'backend_failure',
      'The Photos parent resolution could not be committed.',
      { cause: error },
    );
  }

  return photoParentResolutionReceiptSchema.parse({
    state: 'committed',
    submissionId: submissionIdResult.data,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: outcome.resolution,
    publicMessage: request.publicMessage,
    approvedCount: outcome.approvedCount,
    rejectedCount: outcome.rejectedCount,
    mediaDecisions: media.map(({ mediaReference, decision }) => ({ mediaReference, decision })),
    changedAt: changedAt.toISOString(),
  });
}
