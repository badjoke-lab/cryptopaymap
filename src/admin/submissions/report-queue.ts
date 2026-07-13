import { z } from 'zod';
import {
  submissionWorkflowStatusSchema,
  submissionWorkflowStatusValues,
} from '../../submissions/contract';
import {
  existingReportTargetTypeSchema,
  paymentReportResultSchema,
  problemReportTypeSchema,
} from '../../submissions/report-contract';
import type { SubmissionReviewContext } from './authorization';

const timestampSchema = z.iso.datetime({ offset: true });
const submissionReadCapabilitySchema = z.literal('submission:read');

export const reportSubmissionReviewContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(220),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(submissionReadCapabilitySchema).min(1),
  })
  .strict();

const reportSubmissionQueueCursorSchema = z
  .object({
    priority: z.number().int().min(0).max(1_000),
    submittedAt: timestampSchema,
    id: z.uuid(),
  })
  .strict();

export const actionableReportSubmissionStatuses = [
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
] as const;

export const reportSubmissionQueueQuerySchema = z
  .object({
    statuses: z
      .array(submissionWorkflowStatusSchema)
      .min(1)
      .max(submissionWorkflowStatusValues.length)
      .default([...actionableReportSubmissionStatuses]),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: reportSubmissionQueueCursorSchema.nullable().default(null),
  })
  .strict();

export const reportSubmissionQueueItemSchema = z
  .object({
    id: z.uuid(),
    publicId: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
    reportKind: z.enum(['payment_report', 'problem_report']),
    targetType: existingReportTargetTypeSchema,
    targetId: z.uuid(),
    paymentResult: paymentReportResultSchema.nullable(),
    problemType: problemReportTypeSchema.nullable(),
    workflowStatus: submissionWorkflowStatusSchema,
    priority: z.number().int().min(0).max(1_000),
    evidenceCount: z.number().int().nonnegative().max(20),
    submittedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((item, context) => {
    const paymentShape =
      item.reportKind === 'payment_report' &&
      item.paymentResult !== null &&
      item.problemType === null;
    const problemShape =
      item.reportKind === 'problem_report' &&
      item.problemType !== null &&
      item.paymentResult === null;
    if (!paymentShape && !problemShape) {
      context.addIssue({
        code: 'custom',
        message: 'Report queue summary fields must match the report kind.',
      });
    }
  });

export const reportSubmissionQueuePageDataSchema = z
  .object({
    items: z.array(reportSubmissionQueueItemSchema).max(50),
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

export const reportSubmissionQueueResponseSchema = reportSubmissionQueuePageDataSchema.safeExtend({
  generatedAt: timestampSchema,
});

export type ReportSubmissionQueueQuery = z.infer<typeof reportSubmissionQueueQuerySchema>;
export type ReportSubmissionQueueItem = z.infer<typeof reportSubmissionQueueItemSchema>;
export type ReportSubmissionQueuePageData = z.infer<typeof reportSubmissionQueuePageDataSchema>;
export type ReportSubmissionQueueResponse = z.infer<typeof reportSubmissionQueueResponseSchema>;
export type ReportSubmissionQueueCursor = z.infer<typeof reportSubmissionQueueCursorSchema>;

export interface ReportSubmissionQueueBackend {
  loadPage(query: ReportSubmissionQueueQuery, asOf: Date): Promise<ReportSubmissionQueuePageData>;
}

export class ReportSubmissionQueueError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'invalid_query' | 'invalid_page' | 'backend_failure',
    message: string,
    readonly issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ReportSubmissionQueueError';
  }
}

function parseMultiValue(searchParameters: URLSearchParams, key: string): string[] {
  return searchParameters
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function encodeReportSubmissionQueueCursor(cursor: ReportSubmissionQueueCursor): string {
  const validated = reportSubmissionQueueCursorSchema.parse(cursor);
  return globalThis
    .btoa(JSON.stringify(validated))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function decodeReportSubmissionQueueCursor(value: string): ReportSubmissionQueueCursor {
  if (value.length === 0 || value.length > 1_024) {
    throw new ReportSubmissionQueueError('invalid_query', 'Report queue cursor is invalid.');
  }
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    return reportSubmissionQueueCursorSchema.parse(
      JSON.parse(globalThis.atob(normalized.padEnd(normalized.length + padding, '='))),
    );
  } catch (error) {
    throw new ReportSubmissionQueueError('invalid_query', 'Report queue cursor is invalid.', [], {
      cause: error,
    });
  }
}

export function parseReportSubmissionQueueQuery(url: URL): ReportSubmissionQueueQuery {
  const statuses = parseMultiValue(url.searchParams, 'status');
  const limitValue = url.searchParams.get('limit');
  const cursorValue = url.searchParams.get('cursor');
  const result = reportSubmissionQueueQuerySchema.safeParse({
    ...(statuses.length > 0 ? { statuses } : {}),
    limit: limitValue === null ? undefined : Number(limitValue),
    cursor: cursorValue === null ? undefined : decodeReportSubmissionQueueCursor(cursorValue),
  });
  if (!result.success) {
    throw new ReportSubmissionQueueError(
      'invalid_query',
      'Report queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadReportSubmissionQueue(
  context: SubmissionReviewContext,
  backend: ReportSubmissionQueueBackend,
  query: ReportSubmissionQueueQuery,
  asOf = new Date(),
): Promise<ReportSubmissionQueueResponse> {
  const contextResult = reportSubmissionReviewContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('submission:read')) {
    throw new ReportSubmissionQueueError(
      'unauthorized',
      'The actor is not authorized to read the report Submission queue.',
    );
  }
  if (Number.isNaN(asOf.getTime())) {
    throw new ReportSubmissionQueueError('invalid_query', 'Report queue time is invalid.');
  }

  let page: ReportSubmissionQueuePageData;
  try {
    page = await backend.loadPage(query, asOf);
  } catch (error) {
    if (error instanceof ReportSubmissionQueueError) throw error;
    throw new ReportSubmissionQueueError(
      'backend_failure',
      'The report Submission queue could not be loaded.',
      [],
      { cause: error },
    );
  }

  const result = reportSubmissionQueueResponseSchema.safeParse({
    ...page,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new ReportSubmissionQueueError(
      'invalid_page',
      'The report Submission queue backend returned an invalid page.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
