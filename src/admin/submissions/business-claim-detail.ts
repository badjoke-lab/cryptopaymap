import { z } from 'zod';
import {
  submissionResolutionSchema,
  submissionWorkflowStatusSchema,
} from '../../submissions/contract';
import {
  businessClaimReviewProjectionSchema,
  businessClaimTargetContextResponseSchema,
  generateBusinessClaimTargetContext,
  type BusinessClaimCanonicalTargetContextBackend,
  type BusinessClaimTargetContextResponse,
} from '../../submissions/business-claim-target-context';
import type { SubmissionReviewContext } from './authorization';
import { businessClaimSubmissionReviewContextSchema } from './business-claim-queue';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimSubmissionReviewEventSchema = z
  .object({
    fromStatus: submissionWorkflowStatusSchema.nullable(),
    toStatus: submissionWorkflowStatusSchema,
    action: z.string().trim().min(1).max(96),
    reasonCode: z.string().trim().min(1).max(96).nullable(),
    actorType: z.enum(['submitter', 'reviewer', 'system']),
    createdAt: timestampSchema,
  })
  .strict();

export const businessClaimSubmissionReviewDetailDataSchema = z
  .object({
    submission: z
      .object({
        id: z.uuid(),
        publicId: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
        submissionType: z.literal('claim'),
        targetType: businessClaimReviewProjectionSchema.shape.targetType,
        targetId: z.uuid(),
        workflowStatus: submissionWorkflowStatusSchema,
        resolution: submissionResolutionSchema.nullable(),
        priority: z.number().int().min(0).max(1_000),
        submittedAt: timestampSchema,
        updatedAt: timestampSchema,
      })
      .strict(),
    projection: businessClaimReviewProjectionSchema,
    events: z.array(businessClaimSubmissionReviewEventSchema).max(100),
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
        message: 'Stored Business Claim metadata must match the normalized review projection.',
      });
    }
  });

export const businessClaimSubmissionReviewDetailResponseSchema =
  businessClaimSubmissionReviewDetailDataSchema.safeExtend({
    targetContext: businessClaimTargetContextResponseSchema,
    privateMaterial: z
      .object({
        protectedContactPresent: z.boolean(),
        privateProofPresent: z.boolean(),
        assistedVerifierReferencePresent: z.boolean(),
      })
      .strict(),
    generatedAt: timestampSchema,
  });

export type BusinessClaimSubmissionReviewDetailData = z.infer<
  typeof businessClaimSubmissionReviewDetailDataSchema
>;
export type BusinessClaimSubmissionReviewDetailResponse = z.infer<
  typeof businessClaimSubmissionReviewDetailResponseSchema
>;

export interface BusinessClaimSubmissionReviewDetailBackend {
  loadDetail(
    submissionId: string,
    asOf: Date,
  ): Promise<BusinessClaimSubmissionReviewDetailData | null>;
}

export class BusinessClaimSubmissionReviewDetailError extends Error {
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
    this.name = 'BusinessClaimSubmissionReviewDetailError';
  }
}

export async function loadBusinessClaimSubmissionReviewDetail(
  context: SubmissionReviewContext,
  backend: BusinessClaimSubmissionReviewDetailBackend,
  targetBackend: BusinessClaimCanonicalTargetContextBackend,
  submissionId: string,
  asOf = new Date(),
): Promise<BusinessClaimSubmissionReviewDetailResponse> {
  const contextResult = businessClaimSubmissionReviewContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('submission:read')) {
    throw new BusinessClaimSubmissionReviewDetailError(
      'unauthorized',
      'The actor is not authorized to read Business Claim Submission details.',
    );
  }

  const idResult = z.uuid().safeParse(submissionId);
  if (!idResult.success || Number.isNaN(asOf.getTime())) {
    throw new BusinessClaimSubmissionReviewDetailError(
      'invalid_submission_id',
      'The Submission identifier is invalid.',
    );
  }

  let detail: BusinessClaimSubmissionReviewDetailData | null;
  try {
    detail = await backend.loadDetail(idResult.data, asOf);
  } catch (error) {
    if (error instanceof BusinessClaimSubmissionReviewDetailError) throw error;
    throw new BusinessClaimSubmissionReviewDetailError(
      'backend_failure',
      'The Business Claim Submission detail could not be loaded.',
      [],
      { cause: error },
    );
  }
  if (detail === null) {
    throw new BusinessClaimSubmissionReviewDetailError(
      'not_found',
      'The Business Claim Submission was not found.',
    );
  }

  const detailResult = businessClaimSubmissionReviewDetailDataSchema.safeParse(detail);
  if (!detailResult.success) {
    throw new BusinessClaimSubmissionReviewDetailError(
      'invalid_detail',
      'The Business Claim Submission detail backend returned an invalid response.',
      detailResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  let targetContext: BusinessClaimTargetContextResponse;
  try {
    targetContext = await generateBusinessClaimTargetContext(
      detailResult.data.projection,
      targetBackend,
      asOf,
    );
  } catch (error) {
    throw new BusinessClaimSubmissionReviewDetailError(
      'backend_failure',
      'The Business Claim target context could not be loaded.',
      [],
      { cause: error },
    );
  }

  const verification = detailResult.data.projection.verification;
  const result = businessClaimSubmissionReviewDetailResponseSchema.safeParse({
    ...detailResult.data,
    targetContext,
    privateMaterial: {
      protectedContactPresent: verification.protectedContactPresent,
      privateProofPresent: verification.privateProofPresent,
      assistedVerifierReferencePresent: verification.assistedVerifierReferencePresent,
    },
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new BusinessClaimSubmissionReviewDetailError(
      'invalid_detail',
      'The Business Claim Submission reviewer response is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
