import { z } from 'zod';
import {
  protectedSubmissionContactSchema,
  type SubmissionContactProtector,
} from './contact-protection';

export const submissionContactEncryptionKeyEnvironmentKey =
  'CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL' as const;
export const submissionContactEncryptionKeyIdEnvironmentKey =
  'CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID' as const;
export const submissionEmailHashHmacKeyEnvironmentKey =
  'CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL' as const;
export const submissionContactRetentionDaysEnvironmentKey =
  'CPM_SUBMISSION_CONTACT_RETENTION_DAYS' as const;

const encryptionKeyByteLength = 32;
const minimumHashKeyByteLength = 32;
const ivByteLength = 12;
const millisecondsPerDay = 86_400_000;
const maximumRetentionDays = 3_650;
const encryptionDomain = 'cryptopaymap:submission-contact-email:v1:';
const hashDomain = 'cryptopaymap:submission-email-hash:v1:';
const emailSchema = z.email().max(320);
const keyIdSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/);
const canonicalBase64UrlSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => value.length % 4 !== 1);
const retentionDaysSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,3}$/)
  .refine((value) => Number(value) <= maximumRetentionDays);

export const submissionContactProtectionEnvironmentSchema = z
  .object({
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: canonicalBase64UrlSchema,
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID: keyIdSchema,
    CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: canonicalBase64UrlSchema,
    CPM_SUBMISSION_CONTACT_RETENTION_DAYS: retentionDaysSchema,
  })
  .strict();

export type SubmissionContactProtectionEnvironment = Readonly<
  Record<string, unknown> & {
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL?: unknown;
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID?: unknown;
    CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL?: unknown;
    CPM_SUBMISSION_CONTACT_RETENTION_DAYS?: unknown;
  }
>;

export class SubmissionContactProtectionConfigurationError extends Error {
  constructor() {
    super('Submission contact-protection configuration is unavailable.');
    this.name = 'SubmissionContactProtectionConfigurationError';
  }
}

export class SubmissionContactProtectionError extends Error {
  constructor() {
    super('Submission contact protection is unavailable.');
    this.name = 'SubmissionContactProtectionError';
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
    if (base64UrlEncode(bytes) !== value) {
      throw new SubmissionContactProtectionConfigurationError();
    }
    return bytes;
  } catch (error) {
    if (error instanceof SubmissionContactProtectionConfigurationError) throw error;
    throw new SubmissionContactProtectionConfigurationError();
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function normalizeEmailForHash(email: string): string {
  return email.normalize('NFC').toLowerCase();
}

export function createSubmissionContactProtectorFromEnvironment(
  environment: SubmissionContactProtectionEnvironment,
): SubmissionContactProtector {
  const parsed = submissionContactProtectionEnvironmentSchema.safeParse({
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL:
      environment.CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL,
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID: environment.CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID,
    CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL:
      environment.CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL,
    CPM_SUBMISSION_CONTACT_RETENTION_DAYS: environment.CPM_SUBMISSION_CONTACT_RETENTION_DAYS,
  });
  if (!parsed.success) throw new SubmissionContactProtectionConfigurationError();

  const encryptionKeyBytes = decodeCanonicalBase64Url(
    parsed.data.CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL,
  );
  const hashKeyBytes = decodeCanonicalBase64Url(
    parsed.data.CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL,
  );
  if (
    encryptionKeyBytes.byteLength !== encryptionKeyByteLength ||
    hashKeyBytes.byteLength < minimumHashKeyByteLength ||
    equalBytes(encryptionKeyBytes, hashKeyBytes)
  ) {
    throw new SubmissionContactProtectionConfigurationError();
  }

  const keyId = parsed.data.CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID;
  const retentionDays = Number(parsed.data.CPM_SUBMISSION_CONTACT_RETENTION_DAYS);
  const encoder = new TextEncoder();
  const additionalData = encoder.encode(`${encryptionDomain}${keyId}`);
  const encryptionKeyPromise = crypto.subtle.importKey(
    'raw',
    copyArrayBuffer(encryptionKeyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const hashKeyPromise = crypto.subtle.importKey(
    'raw',
    copyArrayBuffer(hashKeyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return {
    async protectEmail(email, receivedAt) {
      const parsedEmail = emailSchema.safeParse(email);
      if (
        !parsedEmail.success ||
        !(receivedAt instanceof Date) ||
        Number.isNaN(receivedAt.getTime())
      ) {
        throw new SubmissionContactProtectionError();
      }

      try {
        const retentionUntilMs = receivedAt.getTime() + retentionDays * millisecondsPerDay;
        if (!Number.isFinite(retentionUntilMs)) throw new SubmissionContactProtectionError();

        const iv = crypto.getRandomValues(new Uint8Array(ivByteLength));
        const [encryptionKey, hashKey] = await Promise.all([encryptionKeyPromise, hashKeyPromise]);
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData },
          encryptionKey,
          encoder.encode(parsedEmail.data),
        );
        const signature = await crypto.subtle.sign(
          'HMAC',
          hashKey,
          encoder.encode(`${hashDomain}${normalizeEmailForHash(parsedEmail.data)}`),
        );

        return protectedSubmissionContactSchema.parse({
          encryptedEmail: `v1.${keyId}.${base64UrlEncode(iv)}.${base64UrlEncode(
            new Uint8Array(ciphertext),
          )}`,
          emailHash: hexEncode(new Uint8Array(signature)),
          retentionUntil: new Date(retentionUntilMs),
        });
      } catch (error) {
        if (error instanceof SubmissionContactProtectionError) throw error;
        throw new SubmissionContactProtectionError();
      }
    },
  };
}
