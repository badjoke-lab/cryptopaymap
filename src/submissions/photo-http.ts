import { z } from 'zod';
import {
  SubmissionAbuseControlError,
  type AbuseControlledSubmissionIntakeService,
} from './abuse-controlled-intake';
import type { SubmissionChallengeVerifier } from './challenge-verification';
import {
  readTrustedCloudflareEdgeIdentity,
  SubmissionEdgeIdentityError,
} from './cloudflare-edge-identity';
import { submissionPublicIdSchema } from './contract';
import { SubmissionIntakeError } from './intake-service';
import { photosSubmissionIntakeSchema } from './photo-media-contract';
import {
  PhotoUploadAuthorizationError,
  photoUploadAuthorizationReceiptSchema,
  photoUploadAuthorizationRequestSchema,
  type PhotoUploadAuthorizationReceipt,
} from './photo-upload-authorization';
import type { SubmissionRateLimitBucketDeriver } from './rate-limit-bucket-environment';
import type { SubmissionRateLimiter } from './rate-limit';

export const photoHttpMaximumBodyBytes = 128 * 1024;

const requestIdSchema = z.uuid();
const challengeTokenSchema = z.string().min(1).max(2_048);

export const photoUploadAuthorizationHttpRequestSchema = z
  .object({
    challengeToken: challengeTokenSchema,
    authorization: photoUploadAuthorizationRequestSchema,
  })
  .strict();

export const photoPrivateIntakeHttpRequestSchema = z
  .object({
    challengeToken: challengeTokenSchema,
    submission: photosSubmissionIntakeSchema,
  })
  .strict();

export const photoPrivateIntakeHttpResponseSchema = z
  .object({
    submissionReference: submissionPublicIdSchema,
    statusSecret: z.string().min(1).max(512),
    submittedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export interface PhotoUploadAuthorizationService {
  authorize(rawInput: unknown, requestedAt?: Date): Promise<PhotoUploadAuthorizationReceipt>;
}

export interface PhotoUploadAuthorizationHttpRuntime {
  bucketDeriver: SubmissionRateLimitBucketDeriver;
  rateLimiter: SubmissionRateLimiter;
  challengeVerifier: SubmissionChallengeVerifier;
  uploadAuthorizations: PhotoUploadAuthorizationService;
}

export interface PhotoPrivateIntakeHttpRuntime {
  bucketDeriver: SubmissionRateLimitBucketDeriver;
  intake: AbuseControlledSubmissionIntakeService;
}

export interface PhotoHttpPagesContext<Environment = Record<string, unknown>> {
  request: Request;
  env: Environment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

export interface PhotoUploadAuthorizationHttpHandlerDependencies<
  Environment = Record<string, unknown>,
> {
  runtimeFromEnvironment(environment: Environment): PhotoUploadAuthorizationHttpRuntime;
  now?: () => Date;
}

export interface PhotoPrivateIntakeHttpHandlerDependencies<Environment = Record<string, unknown>> {
  runtimeFromEnvironment(environment: Environment): PhotoPrivateIntakeHttpRuntime;
  now?: () => Date;
}

class PhotoHttpBodyTooLargeError extends Error {
  constructor() {
    super('Photos request body is too large.');
    this.name = 'PhotoHttpBodyTooLargeError';
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
  if (raw === null || !/^[0-9]+$/.test(raw)) return false;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > photoHttpMaximumBodyBytes;
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
      if (total > photoHttpMaximumBodyBytes) {
        await reader.cancel();
        throw new PhotoHttpBodyTooLargeError();
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

async function parseJsonBody(request: Request): Promise<unknown> {
  const bytes = await readBoundedBody(request);
  if (bytes.byteLength === 0) throw new SyntaxError('Empty JSON request body.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function boundedRetryAfter(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 1) {
    return undefined;
  }
  return Math.min(86_400, Math.ceil(value));
}

function mapPhotoUploadAuthorizationError(error: unknown): Response {
  if (error instanceof PhotoUploadAuthorizationError) {
    if (error.code === 'invalid_request') {
      return jsonResponse(400, { error: 'photo_request_invalid' });
    }
    if (error.code === 'idempotency_conflict' || error.code === 'reservation_unavailable') {
      return jsonResponse(409, { error: 'photo_request_conflict' });
    }
    return jsonResponse(503, { error: 'photo_unavailable' });
  }
  if (error instanceof SubmissionEdgeIdentityError) {
    return jsonResponse(503, { error: 'photo_unavailable' });
  }
  return jsonResponse(503, { error: 'photo_unavailable' });
}

function mapPhotoPrivateIntakeError(error: unknown): Response {
  if (error instanceof SubmissionAbuseControlError) {
    if (error.code === 'rate_limited') {
      return jsonResponse(429, { error: 'photo_rate_limited' }, boundedRetryAfter(error.retryAfterSeconds));
    }
    if (error.code === 'abuse_request_invalid' || error.code === 'challenge_rejected') {
      return jsonResponse(400, { error: 'photo_request_invalid' });
    }
    return jsonResponse(503, { error: 'photo_unavailable' });
  }

  if (error instanceof SubmissionIntakeError) {
    if (error.code === 'invalid_request') {
      return jsonResponse(400, { error: 'photo_request_invalid' });
    }
    if (error.code === 'idempotency_conflict') {
      return jsonResponse(409, { error: 'photo_request_conflict' });
    }
    return jsonResponse(503, { error: 'photo_unavailable' });
  }

  if (error instanceof SubmissionEdgeIdentityError) {
    return jsonResponse(503, { error: 'photo_unavailable' });
  }
  return jsonResponse(503, { error: 'photo_unavailable' });
}

function validateRequestPreamble(request: Request): Response | null {
  if (mediaType(request) !== 'application/json') {
    return jsonResponse(415, { error: 'photo_media_type_unsupported' });
  }
  if (contentLengthExceedsLimit(request)) {
    return jsonResponse(413, { error: 'photo_request_too_large' });
  }
  return null;
}

export function createPhotoUploadAuthorizationHttpHandler<Environment = Record<string, unknown>>(
  dependencies: PhotoUploadAuthorizationHttpHandlerDependencies<Environment>,
) {
  const now = dependencies.now ?? (() => new Date());

  return async (context: PhotoHttpPagesContext<Environment>): Promise<Response> => {
    const preambleFailure = validateRequestPreamble(context.request);
    if (preambleFailure !== null) return preambleFailure;

    const requestIdResult = requestIdSchema.safeParse(
      context.request.headers.get('Idempotency-Key'),
    );
    if (!requestIdResult.success) {
      return jsonResponse(400, { error: 'photo_request_invalid' });
    }

    let parsedBody: z.infer<typeof photoUploadAuthorizationHttpRequestSchema>;
    try {
      parsedBody = photoUploadAuthorizationHttpRequestSchema.parse(
        await parseJsonBody(context.request),
      );
    } catch (error) {
      if (error instanceof PhotoHttpBodyTooLargeError) {
        return jsonResponse(413, { error: 'photo_request_too_large' });
      }
      return jsonResponse(400, { error: 'photo_request_invalid' });
    }

    if (parsedBody.authorization.intakeRequestId !== requestIdResult.data) {
      return jsonResponse(400, { error: 'photo_request_invalid' });
    }

    try {
      const requestedAt = now();
      const edgeIdentity = readTrustedCloudflareEdgeIdentity(context.request);
      const runtime = dependencies.runtimeFromEnvironment(context.env);
      const rateLimitKey = await runtime.bucketDeriver.deriveBucketKey(edgeIdentity);
      const rateLimit = await runtime.rateLimiter.consume({
        requestId: requestIdResult.data,
        bucketKey: rateLimitKey,
        receivedAt: requestedAt,
      });
      if (rateLimit.outcome === 'deny') {
        return jsonResponse(
          429,
          { error: 'photo_rate_limited' },
          boundedRetryAfter(rateLimit.retryAfterSeconds),
        );
      }
      if (rateLimit.outcome === 'unavailable') {
        return jsonResponse(503, { error: 'photo_unavailable' });
      }

      const challenge = await runtime.challengeVerifier.verify({
        requestId: requestIdResult.data,
        token: parsedBody.challengeToken,
        remoteIp: edgeIdentity,
      });
      if (challenge.outcome === 'deny') {
        return jsonResponse(400, { error: 'photo_request_invalid' });
      }
      if (challenge.outcome === 'unavailable') {
        return jsonResponse(503, { error: 'photo_unavailable' });
      }

      const receipt = photoUploadAuthorizationReceiptSchema.parse(
        await runtime.uploadAuthorizations.authorize(parsedBody.authorization, requestedAt),
      );
      return jsonResponse(200, receipt);
    } catch (error) {
      return mapPhotoUploadAuthorizationError(error);
    }
  };
}

export function createPhotoPrivateIntakeHttpHandler<Environment = Record<string, unknown>>(
  dependencies: PhotoPrivateIntakeHttpHandlerDependencies<Environment>,
) {
  const now = dependencies.now ?? (() => new Date());

  return async (context: PhotoHttpPagesContext<Environment>): Promise<Response> => {
    const preambleFailure = validateRequestPreamble(context.request);
    if (preambleFailure !== null) return preambleFailure;

    const requestIdResult = requestIdSchema.safeParse(
      context.request.headers.get('Idempotency-Key'),
    );
    if (!requestIdResult.success) {
      return jsonResponse(400, { error: 'photo_request_invalid' });
    }

    let parsedBody: z.infer<typeof photoPrivateIntakeHttpRequestSchema>;
    try {
      parsedBody = photoPrivateIntakeHttpRequestSchema.parse(await parseJsonBody(context.request));
    } catch (error) {
      if (error instanceof PhotoHttpBodyTooLargeError) {
        return jsonResponse(413, { error: 'photo_request_too_large' });
      }
      return jsonResponse(400, { error: 'photo_request_invalid' });
    }

    try {
      const receivedAt = now();
      const edgeIdentity = readTrustedCloudflareEdgeIdentity(context.request);
      const runtime = dependencies.runtimeFromEnvironment(context.env);
      const rateLimitKey = await runtime.bucketDeriver.deriveBucketKey(edgeIdentity);
      const receipt = await runtime.intake.submit({
        requestId: requestIdResult.data,
        challengeToken: parsedBody.challengeToken,
        rateLimitKey,
        remoteIp: edgeIdentity,
        rawInput: parsedBody.submission,
        receivedAt,
      });

      return jsonResponse(
        202,
        photoPrivateIntakeHttpResponseSchema.parse({
          submissionReference: receipt.publicId,
          statusSecret: receipt.statusSecret,
          submittedAt: receipt.submittedAt,
        }),
      );
    } catch (error) {
      return mapPhotoPrivateIntakeError(error);
    }
  };
}
