import {
  readSuggestClientConfigurationFromEnvironment,
  SuggestClientConfigurationError,
} from '../../../src/submissions/suggest-client-config';
import type { SubmissionTurnstileEnvironment } from '../../../src/submissions/turnstile-environment';

interface SuggestClientConfigPagesContext {
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
  context: SuggestClientConfigPagesContext,
): Promise<Response> {
  try {
    return jsonResponse(200, readSuggestClientConfigurationFromEnvironment(context.env));
  } catch (error) {
    if (error instanceof SuggestClientConfigurationError) {
      return jsonResponse(503, { error: 'suggest_unavailable' });
    }
    return jsonResponse(503, { error: 'suggest_unavailable' });
  }
}
