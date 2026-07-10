import { z } from 'zod';
import {
  submissionEvidenceLinkSchema,
  submissionRelationshipSchema,
  submissionResolutionSchema,
  submissionWorkflowStatusSchema,
} from '../../submissions/contract';
import {
  suggestCategoryProposalsSchema,
  suggestEntityProposalSchema,
  suggestPaymentProposalsSchema,
  suggestPlaceProposalSchema,
  suggestionKindSchema,
} from '../../submissions/suggest-contract';
import {
  generateSuggestReviewSignals,
  suggestReviewSignalResponseSchema,
  type SuggestReviewSignalDependencies,
  type SuggestReviewSignalResponse,
} from '../../submissions/suggest-review-signals';
import type { SubmissionReviewContext } from './authorization';
import { submissionReviewContextSchema } from './queue';

const timestampSchema = z.iso.datetime({ offset: true });

export const suggestReviewProjectionSchema = z
  .object({
    suggestionKind: suggestionKindSchema,
    entityType: z.enum(['merchant', 'online_service']),
    entity: suggestEntityProposalSchema,
    place: suggestPlaceProposalSchema.nullable(),
    categories: suggestCategoryProposalsSchema,
    paymentProposals: suggestPaymentProposalsSchema,
    observedAt: z.iso.date(),
    relationship: submissionRelationshipSchema,
    evidenceLinks: z.array(submissionEvidenceLinkSchema).max(20),
  })
  .strict()
  .superRefine((projection, context) => {
    if (
      projection.suggestionKind === 'physical_place' &&
      (projection.entityType !== 'merchant' || projection.place === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['entityType'],
        message: 'Physical Place review projection requires merchant type and Place data.',
      });
    }
    if (
      projection.suggestionKind === 'online_service' &&
      (projection.entityType !== 'online_service' || projection.place !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['entityType'],
        message: 'Online Service review projection requires online-service type and no Place data.',
      });
    }
  });

export const suggestSubmissionReviewEventSchema = z
  .object({
    fromStatus: submissionWorkflowStatusSchema.nullable(),
    toStatus: submissionWorkflowStatusSchema,
    action: z.string().trim().min(1).max(96),
    reasonCode: z.string().trim().min(1).max(96).nullable(),
    actorType: z.enum(['submitter', 'reviewer', 'system']),
    createdAt: timestampSchema,
  })
  .strict();

export const suggestSubmissionReviewDetailDataSchema = z
  .object({
    submission: z
      .object({
        id: z.uuid(),
        publicId: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
        workflowStatus: submissionWorkflowStatusSchema,
        resolution: submissionResolutionSchema.nullable(),
        priority: z.number().int().min(0).max(1_000),
        relationship: submissionRelationshipSchema,
        submittedAt: timestampSchema,
        updatedAt: timestampSchema,
      })
      .strict(),
    projection: suggestReviewProjectionSchema,
    events: z.array(suggestSubmissionReviewEventSchema).max(100),
    eventsTruncated: z.boolean(),
  })
  .strict();

export const suggestSubmissionReviewDetailResponseSchema =
  suggestSubmissionReviewDetailDataSchema.safeExtend({
    signals: suggestReviewSignalResponseSchema,
    generatedAt: timestampSchema,
  });

export type SuggestReviewProjectionData = z.infer<typeof suggestReviewProjectionSchema>;
export type SuggestSubmissionReviewDetailData = z.infer<
  typeof suggestSubmissionReviewDetailDataSchema
>;
export type SuggestSubmissionReviewDetailResponse = z.infer<
  typeof suggestSubmissionReviewDetailResponseSchema
>;

export interface SuggestSubmissionReviewDetailBackend {
  loadDetail(submissionId: string, asOf: Date): Promise<SuggestSubmissionReviewDetailData | null>;
}

export class SuggestSubmissionReviewDetailError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_submission_id'
      | 'not_found'
      | 'invalid_detail'
      | 'backend_failure',
    message: string,
    readonly issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SuggestSubmissionReviewDetailError';
  }
}

export async function loadSuggestSubmissionReviewDetail(
  context: SubmissionReviewContext,
  backend: SuggestSubmissionReviewDetailBackend,
  signalDependencies: SuggestReviewSignalDependencies,
  submissionId: string,
  asOf = new Date(),
): Promise<SuggestSubmissionReviewDetailResponse> {
  const contextResult = submissionReviewContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('submission:read')) {
    throw new SuggestSubmissionReviewDetailError(
      'unauthorized',
      'The actor is not authorized to read Suggest Submission details.',
    );
  }

  const idResult = z.uuid().safeParse(submissionId);
  if (!idResult.success || Number.isNaN(asOf.getTime())) {
    throw new SuggestSubmissionReviewDetailError(
      'invalid_submission_id',
      'The Submission identifier is invalid.',
    );
  }

  let detail: SuggestSubmissionReviewDetailData | null;
  try {
    detail = await backend.loadDetail(idResult.data, asOf);
  } catch (error) {
    if (error instanceof SuggestSubmissionReviewDetailError) throw error;
    throw new SuggestSubmissionReviewDetailError(
      'backend_failure',
      'The Suggest Submission detail could not be loaded.',
      [],
      { cause: error },
    );
  }
  if (detail === null) {
    throw new SuggestSubmissionReviewDetailError(
      'not_found',
      'The Suggest Submission was not found.',
    );
  }

  const detailResult = suggestSubmissionReviewDetailDataSchema.safeParse(detail);
  if (!detailResult.success) {
    throw new SuggestSubmissionReviewDetailError(
      'invalid_detail',
      'The Suggest Submission detail backend returned an invalid response.',
      detailResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  let signals: SuggestReviewSignalResponse;
  try {
    signals = await generateSuggestReviewSignals(
      detailResult.data.projection,
      signalDependencies,
      asOf,
    );
  } catch (error) {
    throw new SuggestSubmissionReviewDetailError(
      'backend_failure',
      'The Suggest Submission review signals could not be loaded.',
      [],
      { cause: error },
    );
  }

  const result = suggestSubmissionReviewDetailResponseSchema.safeParse({
    ...detailResult.data,
    signals,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new SuggestSubmissionReviewDetailError(
      'invalid_detail',
      'The Suggest Submission reviewer response is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
