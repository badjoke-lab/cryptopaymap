import { z } from 'zod';
import {
  mediaPurposeValues,
  mediaReviewStatusValues,
  mediaRightsStatusValues,
  mediaRoleValues,
  mediaStorageScopeValues,
  mediaVariantValues,
  mediaVisibilityValues,
} from '../../db/schema';
import { mediaReviewSubjectSchema } from './decision';
import { mediaDuplicateSignalsSchema } from './duplicate-signals';

export const mediaReviewReadContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.literal('media:review')).min(1),
  })
  .strict();

export const mediaReviewQueueQuerySchema = z
  .object({
    reviewStatus: z.enum(mediaReviewStatusValues).default('pending'),
    purpose: z.enum(mediaPurposeValues).optional(),
    role: z.enum(mediaRoleValues).optional(),
    rightsStatus: z.enum(mediaRightsStatusValues).optional(),
    visibility: z.enum(mediaVisibilityValues).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const mediaReviewQueueItemSchema = z
  .object({
    id: z.uuid(),
    purpose: z.enum(mediaPurposeValues),
    role: z.enum(mediaRoleValues),
    reviewStatus: z.enum(mediaReviewStatusValues),
    rightsStatus: z.enum(mediaRightsStatusValues),
    visibility: z.enum(mediaVisibilityValues),
    subject: mediaReviewSubjectSchema,
    altText: z.string().nullable(),
    displayOrder: z.number().int().min(0),
    fileCount: z.number().int().min(0).max(3),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const mediaReviewQueueResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    query: mediaReviewQueueQuerySchema,
    items: z.array(mediaReviewQueueItemSchema),
    hasMore: z.boolean(),
  })
  .strict();

export const mediaReviewWorkspaceFileSchema = z
  .object({
    id: z.uuid(),
    variant: z.enum(mediaVariantValues),
    storageScope: z.enum(mediaStorageScopeValues),
    storageKey: z.string().trim().min(1).max(1_024),
    originalFilename: z.string().nullable(),
    mimeType: z.string().trim().min(1).max(127),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((file, context) => {
    if ((file.width === null) !== (file.height === null)) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'Media file dimensions must both be present or both be absent.',
      });
    }
  });

export const mediaReviewDetailResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    media: mediaReviewQueueItemSchema.extend({
      licenseId: z.uuid().nullable(),
      attribution: z.string().nullable(),
      rightsHolder: z.string().nullable(),
      consentReference: z.string().nullable(),
      capturedAt: z.iso.datetime({ offset: true }).nullable(),
      publishedAt: z.iso.datetime({ offset: true }).nullable(),
      createdAt: z.iso.datetime({ offset: true }),
    }),
    files: z.array(mediaReviewWorkspaceFileSchema).max(3),
    duplicateSignals: mediaDuplicateSignalsSchema.optional(),
  })
  .strict();

export type MediaReviewReadContext = z.infer<typeof mediaReviewReadContextSchema>;
export type MediaReviewQueueQuery = z.infer<typeof mediaReviewQueueQuerySchema>;
export type MediaReviewQueueItem = z.infer<typeof mediaReviewQueueItemSchema>;
export type MediaReviewQueueResponse = z.infer<typeof mediaReviewQueueResponseSchema>;
export type MediaReviewWorkspaceFile = z.infer<typeof mediaReviewWorkspaceFileSchema>;
export type MediaReviewDetailResponse = z.infer<typeof mediaReviewDetailResponseSchema>;

export interface MediaReviewWorkspaceBackend {
  loadQueue(
    query: MediaReviewQueueQuery,
    asOf: Date,
  ): Promise<{ items: MediaReviewQueueItem[]; hasMore: boolean }>;
  loadDetail(mediaAssetId: string, asOf: Date): Promise<MediaReviewDetailResponse | null>;
}

export type MediaReviewWorkspaceErrorCode =
  | 'unauthorized'
  | 'invalid_query'
  | 'invalid_media_id'
  | 'not_found'
  | 'backend_failure';

export class MediaReviewWorkspaceError extends Error {
  readonly code: MediaReviewWorkspaceErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: MediaReviewWorkspaceErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MediaReviewWorkspaceError';
    this.code = code;
    this.issues = issues;
  }
}

function authorize(context: MediaReviewReadContext) {
  const result = mediaReviewReadContextSchema.safeParse(context);
  if (!result.success || !context.capabilities.includes('media:review')) {
    throw new MediaReviewWorkspaceError(
      'unauthorized',
      'The actor is not authorized to read Media review data.',
      result.success
        ? []
        : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
}

export function parseMediaReviewQueueQuery(url: URL): MediaReviewQueueQuery {
  const result = mediaReviewQueueQuerySchema.safeParse({
    reviewStatus: url.searchParams.get('reviewStatus') ?? undefined,
    purpose: url.searchParams.get('purpose') ?? undefined,
    role: url.searchParams.get('role') ?? undefined,
    rightsStatus: url.searchParams.get('rightsStatus') ?? undefined,
    visibility: url.searchParams.get('visibility') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!result.success) {
    throw new MediaReviewWorkspaceError(
      'invalid_query',
      'The Media review queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadMediaReviewQueue(
  context: MediaReviewReadContext,
  backend: MediaReviewWorkspaceBackend,
  query: MediaReviewQueueQuery,
  asOf: Date,
): Promise<MediaReviewQueueResponse> {
  authorize(context);
  try {
    const result = await backend.loadQueue(query, asOf);
    return mediaReviewQueueResponseSchema.parse({
      generatedAt: asOf.toISOString(),
      query,
      items: result.items,
      hasMore: result.hasMore,
    });
  } catch (error) {
    if (error instanceof MediaReviewWorkspaceError) throw error;
    throw new MediaReviewWorkspaceError(
      'backend_failure',
      'The Media review queue could not be loaded.',
      [],
      { cause: error },
    );
  }
}

export async function loadMediaReviewDetail(
  context: MediaReviewReadContext,
  backend: MediaReviewWorkspaceBackend,
  mediaAssetId: string,
  asOf: Date,
): Promise<MediaReviewDetailResponse> {
  authorize(context);
  const idResult = z.uuid().safeParse(mediaAssetId);
  if (!idResult.success) {
    throw new MediaReviewWorkspaceError('invalid_media_id', 'The Media identifier is invalid.');
  }
  try {
    const detail = await backend.loadDetail(idResult.data, asOf);
    if (detail === null) {
      throw new MediaReviewWorkspaceError('not_found', 'The Media asset was not found.');
    }
    return mediaReviewDetailResponseSchema.parse(detail);
  } catch (error) {
    if (error instanceof MediaReviewWorkspaceError) throw error;
    throw new MediaReviewWorkspaceError(
      'backend_failure',
      'The Media review detail could not be loaded.',
      [],
      { cause: error },
    );
  }
}
