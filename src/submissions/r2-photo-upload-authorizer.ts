import { z } from 'zod';
import type {
  QuarantineUploadAuthorization,
  QuarantineUploadAuthorizationCommand,
  QuarantineUploadAuthorizer,
} from './photo-upload-authorization';
import { photoQuarantineObjectKey } from './photo-upload-authorization';

const maximumPresignedSeconds = 15 * 60;
const accountIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
const accessKeyIdSchema = z.string().regex(/^[A-Za-z0-9]{16,128}$/);
const secretAccessKeySchema = z.string().min(32).max(256);
const bucketSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/)
  .refine((value) => !value.includes('..'));
const metadataNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const metadataValueSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value));

export interface R2PhotoUploadAuthorizerConfiguration {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  quarantineBucket: string;
}

export interface R2PhotoUploadAuthorizerOptions {
  now?: () => Date;
}

export class R2PhotoUploadAuthorizerError extends Error {
  constructor(readonly code: 'invalid_configuration' | 'invalid_command' | 'signing_failed') {
    super('Private photo upload authorization is unavailable.');
    this.name = 'R2PhotoUploadAuthorizerError';
  }
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalObjectPath(bucket: string, objectKey: string): string {
  const segments = [bucket, ...objectKey.split('/')];
  return `/${segments.map(encodeRfc3986).join('/')}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const material = new Uint8Array(key);
  const imported = await crypto.subtle.importKey(
    'raw',
    material.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(value)),
  );
}

async function signingKey(secret: string, dateStamp: string): Promise<Uint8Array> {
  const date = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const region = await hmac(date, 'auto');
  const service = await hmac(region, 's3');
  return hmac(service, 'aws4_request');
}

function amzTimestamp(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function validateConfiguration(
  raw: R2PhotoUploadAuthorizerConfiguration,
): R2PhotoUploadAuthorizerConfiguration {
  try {
    return {
      accountId: accountIdSchema.parse(raw.accountId),
      accessKeyId: accessKeyIdSchema.parse(raw.accessKeyId),
      secretAccessKey: secretAccessKeySchema.parse(raw.secretAccessKey),
      quarantineBucket: bucketSchema.parse(raw.quarantineBucket),
    };
  } catch {
    throw new R2PhotoUploadAuthorizerError('invalid_configuration');
  }
}

function validateDate(date: Date): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new R2PhotoUploadAuthorizerError('invalid_command');
  }
}

function validateObjectKey(objectKey: string): void {
  const match = /^quarantine\/photos\/v1\/([0-9a-f-]{36})$/.exec(objectKey);
  if (match === null) throw new R2PhotoUploadAuthorizerError('invalid_command');
  const reservationId = z.uuid().safeParse(match[1]);
  if (!reservationId.success || photoQuarantineObjectKey(reservationId.data) !== objectKey) {
    throw new R2PhotoUploadAuthorizerError('invalid_command');
  }
}

function requiredHeaders(command: QuarantineUploadAuthorizationCommand): Record<string, string> {
  const result: Record<string, string> = {
    'content-type': command.declaredMimeType,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
  };
  const entries = Object.entries(command.metadata);
  if (entries.length < 1 || entries.length > 16) {
    throw new R2PhotoUploadAuthorizerError('invalid_command');
  }
  for (const [rawName, rawValue] of entries) {
    const name = metadataNameSchema.safeParse(rawName);
    const value = metadataValueSchema.safeParse(rawValue);
    if (!name.success || !value.success) {
      throw new R2PhotoUploadAuthorizerError('invalid_command');
    }
    const headerName = `x-amz-meta-${name.data}`;
    if (result[headerName] !== undefined) {
      throw new R2PhotoUploadAuthorizerError('invalid_command');
    }
    result[headerName] = value.data;
  }
  return result;
}

function canonicalQuery(parameters: Array<[string, string]>): string {
  return parameters
    .map(([name, value]) => [encodeRfc3986(name), encodeRfc3986(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => {
      const nameOrder = leftName.localeCompare(rightName);
      return nameOrder === 0 ? leftValue.localeCompare(rightValue) : nameOrder;
    })
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

export function createR2PhotoQuarantineUploadAuthorizer(
  rawConfiguration: R2PhotoUploadAuthorizerConfiguration,
  options: R2PhotoUploadAuthorizerOptions = {},
): QuarantineUploadAuthorizer {
  const configuration = validateConfiguration(rawConfiguration);
  const now = options.now ?? (() => new Date());

  return {
    async authorizeUpload(
      command: QuarantineUploadAuthorizationCommand,
    ): Promise<QuarantineUploadAuthorization> {
      try {
        validateObjectKey(command.objectKey);
        validateDate(command.expiresAt);
        const requestedAt = now();
        validateDate(requestedAt);
        const remainingMilliseconds = command.expiresAt.getTime() - requestedAt.getTime();
        const expiresSeconds = Math.floor(remainingMilliseconds / 1_000);
        if (expiresSeconds < 1 || expiresSeconds > maximumPresignedSeconds) {
          throw new R2PhotoUploadAuthorizerError('invalid_command');
        }

        const host = `${configuration.accountId}.r2.cloudflarestorage.com`;
        const path = canonicalObjectPath(configuration.quarantineBucket, command.objectKey);
        const headers = requiredHeaders(command);
        const canonicalHeaderEntries = Object.entries({ host, ...headers })
          .map(([name, value]) => [name.toLowerCase(), normalizeHeaderValue(value)] as const)
          .sort(([left], [right]) => left.localeCompare(right));
        const signedHeaders = canonicalHeaderEntries.map(([name]) => name).join(';');
        const canonicalHeaders = `${canonicalHeaderEntries
          .map(([name, value]) => `${name}:${value}`)
          .join('\n')}\n`;

        const timestamp = amzTimestamp(requestedAt);
        const dateStamp = timestamp.slice(0, 8);
        const scope = `${dateStamp}/auto/s3/aws4_request`;
        const parameters: Array<[string, string]> = [
          ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
          ['X-Amz-Credential', `${configuration.accessKeyId}/${scope}`],
          ['X-Amz-Date', timestamp],
          ['X-Amz-Expires', String(expiresSeconds)],
          ['X-Amz-SignedHeaders', signedHeaders],
        ];
        const query = canonicalQuery(parameters);
        const canonicalRequest = [
          'PUT',
          path,
          query,
          canonicalHeaders,
          signedHeaders,
          'UNSIGNED-PAYLOAD',
        ].join('\n');
        const stringToSign = [
          'AWS4-HMAC-SHA256',
          timestamp,
          scope,
          await sha256(canonicalRequest),
        ].join('\n');
        const signature = bytesToHex(
          await hmac(await signingKey(configuration.secretAccessKey, dateStamp), stringToSign),
        );
        const uploadUrl = `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;

        return {
          uploadUrl,
          requiredHeaders: headers,
        };
      } catch (error) {
        if (error instanceof R2PhotoUploadAuthorizerError) throw error;
        throw new R2PhotoUploadAuthorizerError('signing_failed');
      }
    },
  };
}
