import { z } from 'zod';
import {
  submissionResolutionSchema,
  submissionWorkflowStatusSchema,
  submissionWorkflowStatusValues,
} from '../../submissions/contract';
import { photosReviewProjectionSchema } from '../../submissions/photo-media-contract';
import type { SubmissionReviewContext } from './authorization';
import { reportSubmissionReviewContextSchema } from './report-queue';

const timestampSchema = z.iso.datetime({ offset: true });
const photoTargetTypeSchema = z.enum(['entity', 'location']);

const photoSubmissionQueueCursorSchema = z
  .object({
    priority: z.number().int().min(0).max(1_000),
    submittedAt: timestampSchema,
    id: z.uuid(),
  })
  .strict();

export const actionablePhotoSubmissionStatuses = [
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
] as const;

export const photoSubmissionQueueQuerySchema = z
  .object({
    statuses: z
      .array(submissionWorkflowStatusSchema)
      .min(1)
      .max(submissionWorkflowStatusValues.length)
      .default([...actionablePhotoSubmissionStatuses]),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: photoSubmissionQueueCursorSchema.nullable().default(null),
  })
  .strict();

export const photoSubmissionQueueItemSchema = z
  .object({
    id: z.uuid(),
    publicId: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
    targetType: photoTargetTypeSchema,
    targetId: z.uuid(),
    workflowStatus: submissionWorkflowStatusSchema,
    priority: z.number().int().min(0).max(1_000),
    mediaCount: z.number().int().min(1).max(8),
    relationship: photosReviewProjectionSchema.shape.relationship,
    submittedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const photoSubmissionQueuePageDataSchema = z
  .object({
    items: z.array(photoSubmissionQueueItemSchema).max(50),
    hasNextPage: z.boolean(),
    nextCursor: z.string().max(1_024).nullable(),
  })
  .strict()
  .superRefine((page, context) => {
    if (page.hasNextPage !== (page.nextCursor !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message: 'nextCursor must be present exactly when hasNextPage is true.',
      });
    }
  });

export const photoSubmissionQueueResponseSchema = photoSubmissionQueuePageDataSchema.safeExtend({
  generatedAt: timestampSchema,
});

export const photoSubmissionReviewEventSchema = z
  .object({
    fromStatus: submissionWorkflowStatusSchema.nullable(),
    toStatus: submissionWorkflowStatusSchema,
    action: z.string().trim().min(1).max(96),
    reasonCode: z.string().trim().min(1).max(96).nullable(),
    actorType: z.enum(['submitter', 'reviewer', 'system']),
    createdAt: timestampSchema,
  })
  .strict();

export const photoSubmissionDetailDataSchema = z
  .object({
    submission: z
      .object({
        id: z.uuid(),
        publicId: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
        submissionType: z.literal('photos'),
        targetType: photoTargetTypeSchema,
        targetId: z.uuid(),
        workflowStatus: submissionWorkflowStatusSchema,
        resolution: submissionResolutionSchema.nullable(),
        priority: z.number().int().min(0).max(1_000),
        submittedAt: timestampSchema,
        updatedAt: timestampSchema,
      })
      .strict(),
    projection: photosReviewProjectionSchema,
    events: z.array(photoSubmissionReviewEventSchema).max(100),
    eventsTruncated: z.boolean(),
  })
  .strict()
  .superRefine((detail, context) => {
    if (
      detail.submission.targetType !== detail.projection.targetType ||
      detail.submission.targetId !== detail.projection.targetId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stored Photos target metadata must match the normalized review projection.',
      });
    }
  });

export const photoSubmissionDetailResponseSchema = photoSubmissionDetailDataSchema.safeExtend({
  generatedAt: timestampSchema,
});

export type PhotoSubmissionQueueQuery = z.infer<typeof photoSubmissionQueueQuerySchema>;
export type PhotoSubmissionQueueCursor = z.infer<typeof photoSubmissionQueueCursorSchema>;
export type PhotoSubmissionQueueItem = z.infer<typeof photoSubmissionQueueItemSchema>;
export type PhotoSubmissionQueuePageData = z.infer<typeof photoSubmissionQueuePageDataSchema>;
export type PhotoSubmissionQueueResponse = z.infer<typeof photoSubmissionQueueResponseSchema>;
export type PhotoSubmissionDetailData = z.infer<typeof photoSubmissionDetailDataSchema>;
export type PhotoSubmissionDetailResponse = z.infer<typeof photoSubmissionDetailResponseSchema>;

export interface PhotoSubmissionQueueBackend {
  loadPage(query: PhotoSubmissionQueueQuery, asOf: Date): Promise<PhotoSubmissionQueuePageData>;
}

export interface PhotoSubmissionDetailBackend {
  loadDetail(submissionId: string): Promise<PhotoSubmissionDetailData | null>;
}

export class PhotoParentReviewError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_query'
      | 'invalid_page'
      | 'not_found'
      | 'invalid_detail'
      | 'backend_failure',
    message: string,
    readonly issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoParentReviewError';
  }
}

function parseMultiValue(searchParameters: URLSearchParams, key: string): string[] {
  return searchParameters
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function encodePhotoSubmissionQueueCursor(cursor: PhotoSubmissionQueueCursor): string {
  const validated = photoSubmissionQueueCursorSchema.parse(cursor);
  return globalThis
    .btoa(JSON.stringify(validated))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function decodePhotoSubmissionQueueCursor(value: string): PhotoSubmissionQueueCursor {
  if (value.length === 0 || value.length > 1_024) {
    throw new PhotoParentReviewError('invalid_query', 'Photos queue cursor is invalid.');
  }
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    return photoSubmissionQueueCursorSchema.parse(
      JSON.parse(globalThis.atob(normalized.padEnd(normalized.length + padding, '='))),
    );
  } catch (error) {
    throw new PhotoParentReviewError('invalid_query', 'Photos queue cursor is invalid.', [], {
      cause: error,
    });
  }
}

export function parsePhotoSubmissionQueueQuery(url: URL): PhotoSubmissionQueueQuery {
  const statuses = parseMultiValue(url.searchParams, 'status');
  const limitValue = url.searchParams.get('limit');
  const cursorValue = url.searchParams.get('cursor');
  const result = photoSubmissionQueueQuerySchema.safeParse({
    ...(statuses.length > 0 ? { statuses } : {}),
    limit: limitValue === null ? undefined : Number(limitValue),
    cursor: cursorValue === null ? undefined : decodePhotoSubmissionQueueCursor(cursorValue),
  });
  if (!result.success) {
    throw new PhotoParentReviewError(
      'invalid_query',
      'Photos queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

function authorize(context: SubmissionReviewContext): void {
  const result = reportSubmissionReviewContextSchema.safeParse(context);
  if (!result.success || !context.capabilities.includes('submission:read')) {
    throw new PhotoParentReviewError(
      'unauthorized',
      'The actor is not authorized to read Photos Submissions.',
    );
  }
}

export async function loadPhotoSubmissionQueue(
  context: SubmissionReviewContext,
  backend: PhotoSubmissionQueueBackend,
  query: PhotoSubmissionQueueQuery,
  asOf = new Date(),
): Promise<PhotoSubmissionQueueResponse> {
  authorize(context);
  if (Number.isNaN(asOf.getTime())) {
    throw new PhotoParentReviewError('invalid_query', 'Photos queue time is invalid.');
  }
  let page: PhotoSubmissionQueuePageData;
  try {
    page = await backend.loadPage(query, asOf);
  } catch (error) {
    if (error instanceof PhotoParentReviewError) throw error;
    throw new PhotoParentReviewError(
      'backend_failure',
      'The Photos Submission queue could not be loaded.',
      [],
      { cause: error },
    );
  }
  const result = photoSubmissionQueueResponseSchema.safeParse({
    ...page,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new PhotoParentReviewError(
      'invalid_page',
      'The Photos Submission queue backend returned an invalid page.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadPhotoSubmissionDetail(
  context: SubmissionReviewContext,
  backend: PhotoSubmissionDetailBackend,
  submissionId: string,
  asOf = new Date(),
): Promise<PhotoSubmissionDetailResponse> {
  authorize(context);
  if (!z.uuid().safeParse(submissionId).success || Number.isNaN(asOf.getTime())) {
    throw new PhotoParentReviewError('invalid_query', 'Photos detail request is invalid.');
  }
  let detail: PhotoSubmissionDetailData | null;
  try {
    detail = await backend.loadDetail(submissionId);
  } catch (error) {
    if (error instanceof PhotoParentReviewError) throw error;
    throw new PhotoParentReviewError(
      'backend_failure',
      'The Photos Submission detail could not be loaded.',
      [],
      { cause: error },
    );
  }
  if (detail === null) {
    throw new PhotoParentReviewError('not_found', 'The Photos Submission was not found.');
  }
  const result = photoSubmissionDetailResponseSchema.safeParse({
    ...detail,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new PhotoParentReviewError(
      'invalid_detail',
      'The Photos Submission backend returned invalid detail.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
