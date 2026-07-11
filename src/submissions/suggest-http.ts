import { z } from 'zod';
import {
  SubmissionAbuseControlError,
  type AbuseControlledSubmissionIntakeService,
} from './abuse-controlled-intake';
import {
  readTrustedCloudflareEdgeIdentity,
  SubmissionEdgeIdentityError,
} from './cloudflare-edge-identity';
import { SubmissionIntakeError } from './intake-service';
import type { SubmissionRateLimitBucketDeriver } from './rate-limit-bucket-environment';
import { suggestSubmissionIntakeSchema } from './suggest-contract';

export const suggestHttpMaximumBodyBytes = 128 * 1024;

const requestIdSchema = z.uuid();
const suggestHttpBodySchema = z
  .object({
    challengeToken: z.string().min(1).max(2_048),
    submission: suggestSubmissionIntakeSchema,
  })
  .strict();

export interface SuggestHttpRuntime {
  intake: AbuseControlledSubmissionIntakeService;
  bucketDeriver: SubmissionRateLimitBucketDeriver;
}

export interface SuggestHttpPagesContext<Environment = Record<string, unknown>> {
  request: Request;
  env: Environment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

export interface SuggestHttpHandlerDependencies<Environment = Record<string, unknown>> {
  runtimeFromEnvironment(environment: Environment): SuggestHttpRuntime;
  now?: () => Date;
}

class SuggestHttpBodyTooLargeError extends Error {
  constructor() {
    super('Suggest request body is too large.');
    this.name = 'SuggestHttpBodyTooLargeError';
  }
}

function jsonResponse(status: number, body: unknown, retryAfterSeconds?: number): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  if (retryAfterSeconds !== undefined) {
    headers.set('Retry-After', String(retryAfterSeconds));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function mediaType(request: Request): string | null {
  const contentType = request.headers.get('Content-Type');
  if (contentType === null) return null;
  return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? null;
}

function contentLengthExceedsLimit(request: Request): boolean {
  const raw = request.headers.get('Content-Length');
  if (raw === null) return false;
  if (!/^[0-9]+$/.test(raw)) return false;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > suggestHttpMaximumBodyBytes;
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > suggestHttpMaximumBodyBytes) {
        await reader.cancel();
        throw new SuggestHttpBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function parseRequestBody(request: Request): Promise<z.infer<typeof suggestHttpBodySchema>> {
  const bytes = await readBoundedBody(request);
  if (bytes.byteLength === 0) throw new SyntaxError('Empty JSON request body.');
  const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return suggestHttpBodySchema.parse(json);
}

function retryAfterSeconds(error: SubmissionAbuseControlError): number | undefined {
  const value = error.retryAfterSeconds;
  if (value === null || !Number.isFinite(value) || value < 1) return undefined;
  return Math.min(86_400, Math.ceil(value));
}

function mapSubmissionError(error: unknown): Response {
  if (error instanceof SubmissionAbuseControlError) {
    if (error.code === 'rate_limited') {
      return jsonResponse(429, { error: 'suggest_rate_limited' }, retryAfterSeconds(error));
    }
    if (error.code === 'abuse_request_invalid' || error.code === 'challenge_rejected') {
      return jsonResponse(400, { error: 'suggest_request_invalid' });
    }
    return jsonResponse(503, { error: 'suggest_unavailable' });
  }

  if (error instanceof SubmissionIntakeError) {
    if (error.code === 'invalid_request') {
      return jsonResponse(400, { error: 'suggest_request_invalid' });
    }
    if (error.code === 'idempotency_conflict') {
      return jsonResponse(409, { error: 'suggest_request_conflict' });
    }
    return jsonResponse(503, { error: 'suggest_unavailable' });
  }

  if (error instanceof SubmissionEdgeIdentityError) {
    return jsonResponse(503, { error: 'suggest_unavailable' });
  }

  return jsonResponse(503, { error: 'suggest_unavailable' });
}

export function createSuggestHttpHandler<Environment = Record<string, unknown>>(
  dependencies: SuggestHttpHandlerDependencies<Environment>,
) {
  const now = dependencies.now ?? (() => new Date());

  return async (context: SuggestHttpPagesContext<Environment>): Promise<Response> => {
    if (mediaType(context.request) !== 'application/json') {
      return jsonResponse(415, { error: 'suggest_media_type_unsupported' });
    }
    if (contentLengthExceedsLimit(context.request)) {
      return jsonResponse(413, { error: 'suggest_request_too_large' });
    }

    const requestId = context.request.headers.get('Idempotency-Key');
    if (!requestIdSchema.safeParse(requestId).success) {
      return jsonResponse(400, { error: 'suggest_request_invalid' });
    }

    let parsedBody: z.infer<typeof suggestHttpBodySchema>;
    try {
      parsedBody = await parseRequestBody(context.request);
    } catch (error) {
      if (error instanceof SuggestHttpBodyTooLargeError) {
        return jsonResponse(413, { error: 'suggest_request_too_large' });
      }
      return jsonResponse(400, { error: 'suggest_request_invalid' });
    }

    try {
      const edgeIdentity = readTrustedCloudflareEdgeIdentity(context.request);
      const runtime = dependencies.runtimeFromEnvironment(context.env);
      const rateLimitKey = await runtime.bucketDeriver.deriveBucketKey(edgeIdentity);
      const receivedAt = now();
      const receipt = await runtime.intake.submit({
        requestId: requestId as string,
        challengeToken: parsedBody.challengeToken,
        rateLimitKey,
        remoteIp: edgeIdentity,
        rawInput: parsedBody.submission,
        receivedAt,
      });

      return jsonResponse(202, {
        submissionReference: receipt.publicId,
        statusSecret: receipt.statusSecret,
        submittedAt: receipt.submittedAt,
      });
    } catch (error) {
      return mapSubmissionError(error);
    }
  };
}
