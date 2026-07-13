import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionReviewRead,
  readSubmissionReviewAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../src/admin/submissions/authorization';
import { createDrizzleReportSubmissionDetailBackend } from '../../../../src/admin/submissions/drizzle-report-submission-detail-backend';
import {
  ReportSubmissionReviewDetailError,
  loadReportSubmissionReviewDetail,
  type ReportSubmissionReviewDetailResponse,
} from '../../../../src/admin/submissions/report-detail';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';
import { createDrizzleReportTargetContextBackend } from '../../../../src/submissions/drizzle-report-target-context-backend';

interface ReportDetailEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ReportDetailPagesContext {
  request: Request;
  env: ReportDetailEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ReportDetailLoader = (
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  submissionId: string,
  environment: ReportDetailEnvironment,
  asOf: Date,
) => Promise<ReportSubmissionReviewDetailResponse>;

export interface ReportDetailHandlerDependencies {
  loadDetail?: ReportDetailLoader;
  now?: () => Date;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

async function loadReportDetailFromDatabase(
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  submissionId: string,
  environment: ReportDetailEnvironment,
  asOf: Date,
): Promise<ReportSubmissionReviewDetailResponse> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new ReportSubmissionReviewDetailError(
      'backend_failure',
      'The report detail database is unavailable.',
    );
  }

  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return loadReportSubmissionReviewDetail(
    context,
    createDrizzleReportSubmissionDetailBackend(database),
    createDrizzleReportTargetContextBackend(database),
    submissionId,
    asOf,
  );
}

export function createReportDetailHandler(dependencies: ReportDetailHandlerDependencies = {}) {
  const detailLoader = dependencies.loadDetail ?? loadReportDetailFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ReportDetailPagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeSubmissionReviewRead>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSubmissionReviewAuthorizationPolicy(pagesContext.env);
      context = authorizeSubmissionReviewRead(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'report_detail_unavailable' });
      }
      return jsonResponse(403, { error: 'report_detail_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'report_detail_invalid_id' });
    }

    try {
      return jsonResponse(
        200,
        await detailLoader(context, submissionId, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof ReportSubmissionReviewDetailError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'report_detail_denied' });
        }
        if (error.code === 'invalid_submission_id') {
          return jsonResponse(400, { error: 'report_detail_invalid_id' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'report_detail_not_found' });
        }
      }
      return jsonResponse(503, { error: 'report_detail_unavailable' });
    }
  };
}

export const onRequestGet = createReportDetailHandler();
