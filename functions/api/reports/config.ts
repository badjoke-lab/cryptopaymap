import {
  readReportClientConfigurationFromEnvironment,
  ReportClientConfigurationError,
} from '../../../src/submissions/report-client-config';
import type { SubmissionTurnstileEnvironment } from '../../../src/submissions/turnstile-environment';

interface ReportClientConfigPagesContext {
  env: SubmissionTurnstileEnvironment;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequestGet(
  context: ReportClientConfigPagesContext,
): Promise<Response> {
  try {
    return jsonResponse(200, readReportClientConfigurationFromEnvironment(context.env));
  } catch (error) {
    if (error instanceof ReportClientConfigurationError) {
      return jsonResponse(503, { error: 'report_unavailable' });
    }
    return jsonResponse(503, { error: 'report_unavailable' });
  }
}
