import {
  suggestReadinessTokenSchema,
  type SuggestConfiguredReadinessEnvironment,
  verifySuggestConfiguredReadiness,
} from '../../../src/submissions/suggest-configured-readiness';

interface SuggestReadinessPagesContext {
  request: Request;
  env: SuggestConfiguredReadinessEnvironment;
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

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

async function tokenMatches(provided: string, expected: string): Promise<boolean> {
  const [providedDigest, expectedDigest] = await Promise.all([digest(provided), digest(expected)]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= providedDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

export async function onRequestGet(context: SuggestReadinessPagesContext): Promise<Response> {
  const parsedToken = suggestReadinessTokenSchema.safeParse(
    context.env.CPM_SUGGEST_READINESS_TOKEN,
  );
  if (!parsedToken.success) return jsonResponse(404, { error: 'not_found' });

  const authorization = context.request.headers.get('Authorization') ?? '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!(await tokenMatches(provided, parsedToken.data))) {
    return jsonResponse(404, { error: 'not_found' });
  }

  try {
    await verifySuggestConfiguredReadiness(context.env);
    return jsonResponse(200, { ready: true });
  } catch {
    return jsonResponse(503, { ready: false });
  }
}
