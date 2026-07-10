import { z } from 'zod';
import {
  createHmacSubmissionStatusSecretProvider,
  type SubmissionStatusSecretProvider,
} from './status-secret-provider';

export const submissionStatusHmacEnvironmentKey =
  'CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL' as const;

const minimumKeyByteLength = 32;
const canonicalBase64UrlSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => value.length % 4 !== 1);

export const submissionStatusSecretEnvironmentSchema = z
  .object({ CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: canonicalBase64UrlSchema })
  .strict();

export type SubmissionStatusSecretEnvironment = Readonly<
  Record<string, unknown> & { CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL?: unknown }
>;

export class SubmissionStatusSecretConfigurationError extends Error {
  constructor() {
    super('Submission status-secret configuration is unavailable.');
    this.name = 'SubmissionStatusSecretConfigurationError';
  }
}

function decodeCanonicalBase64Url(value: string): Uint8Array {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const decoded = globalThis.atob(normalized.padEnd(normalized.length + paddingLength, '='));
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    let canonical = '';
    for (const byte of bytes) canonical += String.fromCharCode(byte);
    const encodedAgain = globalThis
      .btoa(canonical)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    if (encodedAgain !== value || bytes.byteLength < minimumKeyByteLength) {
      throw new SubmissionStatusSecretConfigurationError();
    }
    return bytes;
  } catch (error) {
    if (error instanceof SubmissionStatusSecretConfigurationError) throw error;
    throw new SubmissionStatusSecretConfigurationError();
  }
}

/**
 * Reads an unpadded canonical Base64URL key from an explicit server environment record and
 * composes the existing request-bound HMAC status-secret provider.
 */
export function createSubmissionStatusSecretProviderFromEnvironment(
  environment: SubmissionStatusSecretEnvironment,
): SubmissionStatusSecretProvider {
  const parsed = submissionStatusSecretEnvironmentSchema.safeParse({
    CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: environment.CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL,
  });
  if (!parsed.success) throw new SubmissionStatusSecretConfigurationError();

  return createHmacSubmissionStatusSecretProvider(
    decodeCanonicalBase64Url(parsed.data.CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL),
  );
}
