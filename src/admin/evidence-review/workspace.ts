import { z } from 'zod';
import {
  evidenceClassSchema,
  evidenceKindSchema,
  evidenceOriginRoleSchema,
  evidencePolaritySchema,
  evidenceReviewStatusSchema,
  evidenceSourceTypeSchema,
  evidenceVisibilitySchema,
  type EvidenceThresholdResult,
} from '../../schemas/evidence';

export const evidenceReviewReadContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.literal('evidence:review')).min(1),
  })
  .strict();

export const evidenceReviewQueueQuerySchema = z
  .object({
    reviewStatus: evidenceReviewStatusSchema.default('pending'),
    evidenceClass: evidenceClassSchema.optional(),
    polarity: evidencePolaritySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const evidenceReviewQueueItemSchema = z
  .object({
    id: z.uuid(),
    claimId: z.uuid(),
    claimStatus: z.enum(['candidate', 'confirmed', 'stale', 'ended', 'rejected']),
    claimVisibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    evidenceKind: evidenceKindSchema,
    evidenceClass: evidenceClassSchema,
    sourceType: evidenceSourceTypeSchema,
    originRole: evidenceOriginRoleSchema,
    polarity: evidencePolaritySchema,
    reviewStatus: evidenceReviewStatusSchema,
    visibility: evidenceVisibilitySchema,
    sourceName: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    observedAt: z.iso.datetime({ offset: true }).nullable(),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    summary: z.string(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const evidenceReviewQueueResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    query: evidenceReviewQueueQuerySchema,
    items: z.array(evidenceReviewQueueItemSchema),
    hasMore: z.boolean(),
  })
  .strict();

const acceptedEvidenceItemSchema = z
  .object({
    id: z.uuid(),
    evidenceClass: evidenceClassSchema,
    originRole: evidenceOriginRoleSchema,
    polarity: evidencePolaritySchema,
    sourceName: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    observedAt: z.iso.datetime({ offset: true }).nullable(),
    summary: z.string(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const thresholdSchema = z
  .object({
    eligible: z.boolean(),
    basis: z.enum(['single_a', 'independent_b_pair']).nullable(),
    supportingEvidenceIds: z.array(z.uuid()),
    latestContradictionAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const evidenceReviewDetailResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    evidence: evidenceReviewQueueItemSchema.extend({
      archiveUrl: z.string().nullable(),
      sourceNativeId: z.string().nullable(),
      fetchedAt: z.iso.datetime({ offset: true }).nullable(),
      attribution: z.string().nullable(),
      independenceKey: z.string().nullable(),
    }),
    claim: z
      .object({
        id: z.uuid(),
        claimStatus: z.enum(['candidate', 'confirmed', 'stale', 'ended', 'rejected']),
        visibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
        routeType: z.enum(['direct_wallet', 'processor_checkout']),
        acceptanceScope: z.enum([
          'all_checkout',
          'selected_products',
          'new_purchase_only',
          'renewal_only',
          'region_limited',
          'temporary',
        ]),
        customerPaysCrypto: z.boolean(),
        merchantExplicitlyAcceptsCrypto: z.boolean(),
        howToPay: z.string().nullable(),
        merchantReceives: z.enum(['crypto', 'fiat', 'crypto_or_fiat', 'not_publicly_confirmed']),
        restrictions: z.string().nullable(),
        firstConfirmedAt: z.iso.datetime({ offset: true }).nullable(),
        lastConfirmedAt: z.iso.datetime({ offset: true }).nullable(),
        nextReviewAt: z.iso.datetime({ offset: true }).nullable(),
        endedAt: z.iso.datetime({ offset: true }).nullable(),
        endedReason: z.string().nullable(),
        updatedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
    acceptedEvidence: z.array(acceptedEvidenceItemSchema),
    threshold: thresholdSchema,
  })
  .strict();

export type EvidenceReviewReadContext = z.infer<typeof evidenceReviewReadContextSchema>;
export type EvidenceReviewQueueQuery = z.infer<typeof evidenceReviewQueueQuerySchema>;
export type EvidenceReviewQueueItem = z.infer<typeof evidenceReviewQueueItemSchema>;
export type EvidenceReviewQueueResponse = z.infer<typeof evidenceReviewQueueResponseSchema>;
export type EvidenceReviewDetailResponse = z.infer<typeof evidenceReviewDetailResponseSchema>;

export interface EvidenceReviewWorkspaceBackend {
  loadQueue(
    query: EvidenceReviewQueueQuery,
    asOf: Date,
  ): Promise<{ items: EvidenceReviewQueueItem[]; hasMore: boolean }>;
  loadDetail(evidenceId: string, asOf: Date): Promise<EvidenceReviewDetailResponse | null>;
}

export type EvidenceReviewWorkspaceErrorCode =
  | 'unauthorized'
  | 'invalid_query'
  | 'invalid_evidence_id'
  | 'not_found'
  | 'backend_failure';

export class EvidenceReviewWorkspaceError extends Error {
  readonly code: EvidenceReviewWorkspaceErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: EvidenceReviewWorkspaceErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EvidenceReviewWorkspaceError';
    this.code = code;
    this.issues = issues;
  }
}

function authorize(context: EvidenceReviewReadContext) {
  const result = evidenceReviewReadContextSchema.safeParse(context);
  if (!result.success || !context.capabilities.includes('evidence:review')) {
    throw new EvidenceReviewWorkspaceError(
      'unauthorized',
      'The actor is not authorized to read Evidence review data.',
      result.success
        ? []
        : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
}

export function parseEvidenceReviewQueueQuery(url: URL): EvidenceReviewQueueQuery {
  const input = {
    reviewStatus: url.searchParams.get('reviewStatus') ?? undefined,
    evidenceClass: url.searchParams.get('evidenceClass') ?? undefined,
    polarity: url.searchParams.get('polarity') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  };
  const result = evidenceReviewQueueQuerySchema.safeParse(input);
  if (!result.success) {
    throw new EvidenceReviewWorkspaceError(
      'invalid_query',
      'The Evidence review queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadEvidenceReviewQueue(
  context: EvidenceReviewReadContext,
  backend: EvidenceReviewWorkspaceBackend,
  query: EvidenceReviewQueueQuery,
  asOf: Date,
): Promise<EvidenceReviewQueueResponse> {
  authorize(context);
  try {
    const result = await backend.loadQueue(query, asOf);
    return evidenceReviewQueueResponseSchema.parse({
      generatedAt: asOf.toISOString(),
      query,
      items: result.items,
      hasMore: result.hasMore,
    });
  } catch (error) {
    if (error instanceof EvidenceReviewWorkspaceError) throw error;
    throw new EvidenceReviewWorkspaceError(
      'backend_failure',
      'The Evidence review queue could not be loaded.',
      [],
      { cause: error },
    );
  }
}

export async function loadEvidenceReviewDetail(
  context: EvidenceReviewReadContext,
  backend: EvidenceReviewWorkspaceBackend,
  evidenceId: string,
  asOf: Date,
): Promise<EvidenceReviewDetailResponse> {
  authorize(context);
  const idResult = z.uuid().safeParse(evidenceId);
  if (!idResult.success) {
    throw new EvidenceReviewWorkspaceError(
      'invalid_evidence_id',
      'The Evidence identifier is invalid.',
    );
  }
  try {
    const detail = await backend.loadDetail(idResult.data, asOf);
    if (detail === null) {
      throw new EvidenceReviewWorkspaceError('not_found', 'The Evidence record was not found.');
    }
    return evidenceReviewDetailResponseSchema.parse(detail);
  } catch (error) {
    if (error instanceof EvidenceReviewWorkspaceError) throw error;
    throw new EvidenceReviewWorkspaceError(
      'backend_failure',
      'The Evidence review detail could not be loaded.',
      [],
      { cause: error },
    );
  }
}

export function thresholdWithEvidenceIds(
  threshold: EvidenceThresholdResult,
  acceptedEvidenceIds: readonly string[],
) {
  return {
    eligible: threshold.eligible,
    basis: threshold.basis,
    supportingEvidenceIds: threshold.supportingIndexes
      .map((index) => acceptedEvidenceIds[index])
      .filter((value): value is string => value !== undefined),
    latestContradictionAt: threshold.latestContradictionAt,
  };
}
