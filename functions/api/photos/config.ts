import {
  readPhotoClientConfigurationFromEnvironment,
  PhotoClientConfigurationError,
} from '../../../src/submissions/photo-client-config';
import type { SubmissionTurnstileEnvironment } from '../../../src/submissions/turnstile-environment';

interface PhotoClientConfigPagesContext {
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
  context: PhotoClientConfigPagesContext,
): Promise<Response> {
  try {
    return jsonResponse(200, readPhotoClientConfigurationFromEnvironment(context.env));
  } catch (error) {
    if (error instanceof PhotoClientConfigurationError) {
      return jsonResponse(503, { error: 'photo_unavailable' });
    }
    return jsonResponse(503, { error: 'photo_unavailable' });
  }
}
