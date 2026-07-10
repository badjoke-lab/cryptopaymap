import { z } from 'zod';

export const submissionRateLimitBucketHmacEnvironmentKey =
  'CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL' as const;

const minimumKeyByteLength = 32;
const domain = 'cryptopaymap:submission-rate-limit-bucket:v1:';
const edgeIdentitySchema = z.string().min(1).max(64);
const bucketKeySchema = z.string().regex(/^rl_[A-Za-z0-9_-]{16,128}$/);
const canonicalBase64UrlSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => value.length % 4 !== 1);

export const submissionRateLimitBucketEnvironmentSchema = z
  .object({ CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: canonicalBase64UrlSchema })
  .strict();

export type SubmissionRateLimitBucketEnvironment = Readonly<
  Record<string, unknown> & { CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL?: unknown }
>;

export interface SubmissionRateLimitBucketDeriver {
  deriveBucketKey(edgeIdentity: string): Promise<string>;
}

export class SubmissionRateLimitBucketConfigurationError extends Error {
  constructor() {
    super('Submission rate-limit bucket configuration is unavailable.');
    this.name = 'SubmissionRateLimitBucketConfigurationError';
  }
}

export class SubmissionRateLimitBucketDerivationError extends Error {
  constructor() {
    super('Submission rate-limit bucket derivation is unavailable.');
    this.name = 'SubmissionRateLimitBucketDerivationError';
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCanonicalBase64Url(value: string): Uint8Array {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const decoded = globalThis.atob(normalized.padEnd(normalized.length + paddingLength, '='));
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    if (base64UrlEncode(bytes) !== value || bytes.byteLength < minimumKeyByteLength) {
      throw new SubmissionRateLimitBucketConfigurationError();
    }
    return bytes;
  } catch (error) {
    if (error instanceof SubmissionRateLimitBucketConfigurationError) throw error;
    throw new SubmissionRateLimitBucketConfigurationError();
  }
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function createSubmissionRateLimitBucketDeriverFromEnvironment(
  environment: SubmissionRateLimitBucketEnvironment,
): SubmissionRateLimitBucketDeriver {
  const parsed = submissionRateLimitBucketEnvironmentSchema.safeParse({
    CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL:
      environment.CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL,
  });
  if (!parsed.success) throw new SubmissionRateLimitBucketConfigurationError();

  const keyBytes = decodeCanonicalBase64Url(
    parsed.data.CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL,
  );
  const keyPromise = crypto.subtle.importKey(
    'raw',
    copyArrayBuffer(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const encoder = new TextEncoder();

  return {
    async deriveBucketKey(edgeIdentity) {
      const parsedIdentity = edgeIdentitySchema.safeParse(edgeIdentity);
      if (!parsedIdentity.success) throw new SubmissionRateLimitBucketDerivationError();

      try {
        const key = await keyPromise;
        const signature = await crypto.subtle.sign(
          'HMAC',
          key,
          encoder.encode(`${domain}${parsedIdentity.data}`),
        );
        return bucketKeySchema.parse(`rl_${base64UrlEncode(new Uint8Array(signature))}`);
      } catch (error) {
        if (error instanceof SubmissionRateLimitBucketDerivationError) throw error;
        throw new SubmissionRateLimitBucketDerivationError();
      }
    },
  };
}
