import { z } from 'zod';
import { submissionStatusTokenHashSchema } from './contract';

const statusSecretByteLength = 32;

export const submissionStatusSecretSchema = z
  .string()
  .regex(/^cpmss_[A-Za-z0-9_-]{43}$/, 'Submission status secrets must use the expected format.');

export interface IssuedSubmissionStatusSecret {
  secret: string;
  tokenHash: string;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function hashSubmissionStatusSecret(secret: string): Promise<string> {
  const parsed = submissionStatusSecretSchema.parse(secret);
  const digest = await sha256(parsed);
  return submissionStatusTokenHashSchema.parse(`sha256:${bytesToHex(digest)}`);
}

export async function issueSubmissionStatusSecret(
  entropy?: Uint8Array,
): Promise<IssuedSubmissionStatusSecret> {
  const bytes =
    entropy === undefined
      ? crypto.getRandomValues(new Uint8Array(statusSecretByteLength))
      : entropy;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== statusSecretByteLength) {
    throw new Error(
      `Submission status secret entropy must be exactly ${statusSecretByteLength} bytes.`,
    );
  }

  const secret = submissionStatusSecretSchema.parse(`cpmss_${encodeBase64Url(bytes)}`);
  return {
    secret,
    tokenHash: await hashSubmissionStatusSecret(secret),
  };
}

export async function verifySubmissionStatusSecret(
  secret: string,
  storedTokenHash: string,
): Promise<boolean> {
  const parsedSecret = submissionStatusSecretSchema.safeParse(secret);
  const parsedHash = submissionStatusTokenHashSchema.safeParse(storedTokenHash);
  if (!parsedSecret.success || !parsedHash.success) return false;

  const candidateHash = await hashSubmissionStatusSecret(parsedSecret.data);
  return constantTimeEqual(candidateHash, parsedHash.data);
}
