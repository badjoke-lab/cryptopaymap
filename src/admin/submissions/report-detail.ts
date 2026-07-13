import { z } from 'zod';
import {
  submissionEvidenceLinkSchema,
  submissionResolutionSchema,
  submissionWorkflowStatusSchema,
} from '../../submissions/contract';
import {
  existingReportTargetTypeSchema,
  paymentReportDetailsSchema,
  paymentReportResultSchema,
  problemReportCorrectionSchema,
  problemReportDuplicateTargetSchema,
  problemReportTypeSchema,
  type ReportReviewProjection,
} from '../../submissions/report-contract';
import {
  generateReportTargetContext,
  reportTargetContextResponseSchema,
  type ReportCanonicalTargetContextBackend,
  type ReportTargetContextResponse,
} from '../../submissions/report-target-context';
import type { SubmissionReviewContext } from './authorization';
import { reportSubmissionReviewContextSchema } from './report-queue';

const timestampSchema = z.iso.datetime({ offset: true });
const boundedReviewText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const paymentReportReviewProjectionSchema = z
  .object({
    reportKind: z.literal('payment_report'),
    targetType: existingReportTargetTypeSchema,
    targetId: z.uuid(),
    result: paymentReportResultSchema,
    paymentDate: z.iso.date(),
    payment: paymentReportDetailsSchema,
    notes: boundedReviewText(2_000).nullable(),
    evidenceLinks: z.array(submissionEvidenceLinkSchema).max(20),
    restrictedEvidence: z
      .object({
        privateTransactionUrlPresent: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const problemReportReviewProjectionSchema = z
  .object({
    reportKind: z.literal('problem_report'),
    targetType: existingReportTargetTypeSchema,
    targetId: z.uuid(),
    reportType: problemReportTypeSchema,
    observedAt: z.iso.date(),
    explanation: boundedReviewText(5_000),
    proposedCorrection: problemReportCorrectionSchema.nullable(),
    duplicateTarget: problemReportDuplicateTargetSchema.nullable(),
    evidenceLinks: z.array(submissionEvidenceLinkSchema).max(20),
    restrictedEvidence: z
      .object({
        privateEvidenceUrlPresent: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const reportReviewProjectionSchema = z.discriminatedUnion('reportKind', [
  paymentReportReviewProjectionSchema,
  problemReportReviewProjectionSchema,
]);

export const reportSubmissionReviewEventSchema = z
  .object({
    fromStatus: submissionWorkflowStatusSchema.nullable(),
    toStatus: submissionWorkflowStatusSchema,
    action: z.string().trim().min(1).max(96),
    reasonCode: z.string().trim().min(1).max(96).nullable(),
    actorType: z.enum(['submitter', 'reviewer', 'system']),
    createdAt: timestampSchema,
  })
  .strict();

export const reportSubmissionReviewDetailDataSchema = z
  .object({
    submission: z
      .object({
        id: z.uuid(),
        publicId: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
        submissionType: z.enum(['payment_report', 'problem_report']),
        targetType: existingReportTargetTypeSchema,
        targetId: z.uuid(),
        workflowStatus: submissionWorkflowStatusSchema,
        resolution: submissionResolutionSchema.nullable(),
        priority: z.number().int().min(0).max(1_000),
        submittedAt: timestampSchema,
        updatedAt: timestampSchema,
      })
      .strict(),
    projection: reportReviewProjectionSchema,
    events: z.array(reportSubmissionReviewEventSchema).max(100),
    eventsTruncated: z.boolean(),
  })
  .strict()
  .superRefine((detail, context) => {
    if (
      detail.submission.submissionType !== detail.projection.reportKind ||
      detail.submission.targetType !== detail.projection.targetType ||
      detail.submission.targetId !== detail.projection.targetId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stored report metadata must match the normalized review projection.',
      });
    }
  });

export const reportSubmissionReviewDetailResponseSchema =
  reportSubmissionReviewDetailDataSchema.safeExtend({
    targetContext: reportTargetContextResponseSchema,
    generatedAt: timestampSchema,
  });

export type ReportSubmissionReviewDetailData = z.infer<
  typeof reportSubmissionReviewDetailDataSchema
>;
export type ReportSubmissionReviewDetailResponse = z.infer<
  typeof reportSubmissionReviewDetailResponseSchema
>;

export interface ReportSubmissionReviewDetailBackend {
  loadDetail(submissionId: string, asOf: Date): Promise<ReportSubmissionReviewDetailData | null>;
}

export class ReportSubmissionReviewDetailError extends Error {
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
    this.name = 'ReportSubmissionReviewDetailError';
  }
}

export async function loadReportSubmissionReviewDetail(
  context: SubmissionReviewContext,
  backend: ReportSubmissionReviewDetailBackend,
  targetBackend: ReportCanonicalTargetContextBackend,
  submissionId: string,
  asOf = new Date(),
): Promise<ReportSubmissionReviewDetailResponse> {
  const contextResult = reportSubmissionReviewContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('submission:read')) {
    throw new ReportSubmissionReviewDetailError(
      'unauthorized',
      'The actor is not authorized to read report Submission details.',
    );
  }

  const idResult = z.uuid().safeParse(submissionId);
  if (!idResult.success || Number.isNaN(asOf.getTime())) {
    throw new ReportSubmissionReviewDetailError(
      'invalid_submission_id',
      'The Submission identifier is invalid.',
    );
  }

  let detail: ReportSubmissionReviewDetailData | null;
  try {
    detail = await backend.loadDetail(idResult.data, asOf);
  } catch (error) {
    if (error instanceof ReportSubmissionReviewDetailError) throw error;
    throw new ReportSubmissionReviewDetailError(
      'backend_failure',
      'The report Submission detail could not be loaded.',
      [],
      { cause: error },
    );
  }
  if (detail === null) {
    throw new ReportSubmissionReviewDetailError(
      'not_found',
      'The report Submission was not found.',
    );
  }

  const detailResult = reportSubmissionReviewDetailDataSchema.safeParse(detail);
  if (!detailResult.success) {
    throw new ReportSubmissionReviewDetailError(
      'invalid_detail',
      'The report Submission detail backend returned an invalid response.',
      detailResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  let targetContext: ReportTargetContextResponse;
  try {
    targetContext = await generateReportTargetContext(
      detailResult.data.projection as ReportReviewProjection,
      targetBackend,
      asOf,
    );
  } catch (error) {
    throw new ReportSubmissionReviewDetailError(
      'backend_failure',
      'The report target context could not be loaded.',
      [],
      { cause: error },
    );
  }

  const result = reportSubmissionReviewDetailResponseSchema.safeParse({
    ...detailResult.data,
    targetContext,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new ReportSubmissionReviewDetailError(
      'invalid_detail',
      'The report Submission reviewer response is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
