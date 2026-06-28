import { z } from 'zod';
import { verificationEventTypeValues } from '../../db/schema';

export const dashboardCapabilityValues = ['dashboard:read'] as const;
export const dashboardCapabilitySchema = z.enum(dashboardCapabilityValues);

export const adminDashboardContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(dashboardCapabilitySchema).min(1),
  })
  .strict();

const summaryCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const summaryTimestampSchema = z.iso.datetime({ offset: true });

export const adminDashboardSummaryDataSchema = z
  .object({
    candidateQueue: z
      .object({
        totalActionable: summaryCountSchema,
        new: summaryCountSchema,
        triaged: summaryCountSchema,
        linked: summaryCountSchema,
        highPriority: summaryCountSchema,
        openDuplicateGroups: summaryCountSchema,
      })
      .strict(),
    evidenceReview: z
      .object({
        pending: summaryCountSchema,
      })
      .strict(),
    rechecks: z
      .object({
        overdue: summaryCountSchema,
        dueSoon: summaryCountSchema,
        stale: summaryCountSchema,
      })
      .strict(),
    mediaReview: z
      .object({
        pending: summaryCountSchema,
      })
      .strict(),
    imports: z
      .object({
        lastCompletedAt: summaryTimestampSchema.nullable(),
        latestAcceptedCount: summaryCountSchema,
        latestRejectedCount: summaryCountSchema,
        latestDuplicateSignalCount: summaryCountSchema,
      })
      .strict(),
    publication: z
      .object({
        state: z.literal('not_available'),
        reason: z.literal('release_control_not_implemented'),
      })
      .strict(),
    recentActivity: z
      .array(
        z
          .object({
            eventType: z.enum(verificationEventTypeValues),
            effectiveAt: summaryTimestampSchema,
          })
          .strict(),
      )
      .max(10),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedActionable = value.candidateQueue.new + value.candidateQueue.triaged;
    if (value.candidateQueue.totalActionable !== expectedActionable) {
      context.addIssue({
        code: 'custom',
        path: ['candidateQueue', 'totalActionable'],
        message: 'totalActionable must equal new plus triaged candidates.',
      });
    }
  });

export const adminDashboardSummarySchema = adminDashboardSummaryDataSchema.safeExtend({
  generatedAt: summaryTimestampSchema,
});

export type AdminDashboardContext = z.infer<typeof adminDashboardContextSchema>;
export type AdminDashboardSummaryData = z.infer<typeof adminDashboardSummaryDataSchema>;
export type AdminDashboardSummary = z.infer<typeof adminDashboardSummarySchema>;

export interface AdminDashboardSummaryBackend {
  loadSummary(asOf: Date): Promise<AdminDashboardSummaryData>;
}

export type AdminDashboardSummaryErrorCode = 'unauthorized' | 'invalid_summary' | 'backend_failure';

export class AdminDashboardSummaryError extends Error {
  readonly code: AdminDashboardSummaryErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: AdminDashboardSummaryErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AdminDashboardSummaryError';
    this.code = code;
    this.issues = issues;
  }
}

export async function loadAdminDashboardSummary(
  context: AdminDashboardContext,
  backend: AdminDashboardSummaryBackend,
  asOf = new Date(),
): Promise<AdminDashboardSummary> {
  const contextResult = adminDashboardContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('dashboard:read')) {
    throw new AdminDashboardSummaryError(
      'unauthorized',
      'The actor is not authorized to read administration dashboard summaries.',
      contextResult.success
        ? []
        : contextResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  if (Number.isNaN(asOf.getTime())) {
    throw new AdminDashboardSummaryError(
      'invalid_summary',
      'The dashboard summary time is invalid.',
    );
  }

  let data: AdminDashboardSummaryData;
  try {
    data = await backend.loadSummary(asOf);
  } catch (error) {
    if (error instanceof AdminDashboardSummaryError) throw error;
    throw new AdminDashboardSummaryError(
      'backend_failure',
      'The administration dashboard summary could not be loaded.',
      [],
      { cause: error },
    );
  }

  const result = adminDashboardSummarySchema.safeParse({
    ...data,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new AdminDashboardSummaryError(
      'invalid_summary',
      'The administration dashboard backend returned an invalid summary.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  return result.data;
}
