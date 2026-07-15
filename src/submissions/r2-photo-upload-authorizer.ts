import { z } from 'zod';
import type {
  QuarantineUploadAuthorization,
  QuarantineUploadAuthorizationCommand,
  QuarantineUploadAuthorizer,
} from './photo-upload-authorization';

const maximumPresignSeconds = 15 * 60;
const privatePhotoObjectKeySchema = z
  .string()
  .regex(/^quarantine\/photos\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const metadataKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/);
const metadataValueSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));

export const r2PhotoUploadAuthorizerEnvironmentSchema = z
  .object({
    CPM_R2_ACCOUNT_ID: z.string().regex(/^[0-9a-f]{32}$/i),
    CPM_R2_PHOTO_QUARANTINE_BUCKET: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
    CPM_R2_ACCESS_KEY_ID: z.string().min(16).max(128).regex(/^[A-Za-z0-9]+$/),
    CPM_R2_SECRET_ACCESS_KEY: z.string().min(32).max(256).regex(/^\S+$/),
  })
  .strict();

export type R2PhotoUploadAuthorizerEnvironment = Readonly<
  Record<string, unknown> & {
    CPM_R2_ACCOUNT_ID?: unknown;
    CPM_R2_PHOTO_QUARANTINE_BUCKET?: unknown;
    CPM_R2_ACCESS_KEY_ID?: unknown;
    CPM_R2_SECRET_ACCESS_KEY?: unknown;
  }
>;

export interface R2PhotoUploadAuthorizerConfiguration {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface R2PhotoUploadAuthorizerOptions {
  now?: () => Date;
}

export class R2PhotoUploadAuthorizerConfigurationError extends Error {
  constructor() {
    super('R2 photo upload authorization configuration is unavailable.');
    this.name = 'R2PhotoUploadAuthorizerConfigurationError';
  }
}

export class R2PhotoUploadAuthorizationError extends Error {
  constructor(
    readonly code: 'invalid_command' | 'authorization_expired' | 'authorization_failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'R2PhotoUploadAuthorizationError';
  }
}

const textEncoder = new TextEncoder();

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectKey(value: string): string {
  return `/${value.split('/').map(awsEncode).join('/')}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256(keyBytes: Uint8Array, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value));
  return new Uint8Array(signature);
}

function canonicalHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function formatSigningDate(value: Date): { amzDate: string; dateStamp: string } {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new R2PhotoUploadAuthorizationError('invalid_command', 'Signing time is invalid.');
  }
  const amzDate = value.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function canonicalQuery(parameters: Record<string, string>): string {
  return Object.entries(parameters)
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function validateConfiguration(
  rawConfiguration: R2PhotoUploadAuthorizerConfiguration,
): R2PhotoUploadAuthorizerConfiguration {
  const parsed = r2PhotoUploadAuthorizerEnvironmentSchema.safeParse({
    CPM_R2_ACCOUNT_ID: rawConfiguration.accountId,
    CPM_R2_PHOTO_QUARANTINE_BUCKET: rawConfiguration.bucketName,
    CPM_R2_ACCESS_KEY_ID: rawConfiguration.accessKeyId,
    CPM_R2_SECRET_ACCESS_KEY: rawConfiguration.secretAccessKey,
  });
  if (!parsed.success) throw new R2PhotoUploadAuthorizerConfigurationError();
  return {
    accountId: parsed.data.CPM_R2_ACCOUNT_ID.toLowerCase(),
    bucketName: parsed.data.CPM_R2_PHOTO_QUARANTINE_BUCKET,
    accessKeyId: parsed.data.CPM_R2_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.CPM_R2_SECRET_ACCESS_KEY,
  };
}

function validateCommand(command: QuarantineUploadAuthorizationCommand): {
  objectKey: string;
  expiresAt: Date;
  declaredMimeType: string;
  metadata: Record<string, string>;
} {
  try {
    const objectKey = privatePhotoObjectKeySchema.parse(command.objectKey);
    if (!(command.expiresAt instanceof Date) || Number.isNaN(command.expiresAt.getTime())) {
      throw new Error('Invalid expiry.');
    }
    const declaredMimeType = z
      .enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
      .parse(command.declaredMimeType);
    const metadataEntries = Object.entries(command.metadata).map(([key, value]) => [
      metadataKeySchema.parse(key.toLowerCase()),
      metadataValueSchema.parse(value),
    ] as const);
    if (metadataEntries.length < 1 || metadataEntries.length > 16) {
      throw new Error('Invalid metadata count.');
    }
    return {
      objectKey,
      expiresAt: new Date(command.expiresAt),
      declaredMimeType,
      metadata: Object.fromEntries(metadataEntries),
    };
  } catch (error) {
    throw new R2PhotoUploadAuthorizationError(
      'invalid_command',
      'R2 photo upload authorization command failed validation.',
      { cause: error },
    );
  }
}

export function createR2PhotoUploadAuthorizer(
  rawConfiguration: R2PhotoUploadAuthorizerConfiguration,
  options: R2PhotoUploadAuthorizerOptions = {},
): QuarantineUploadAuthorizer {
  const configuration = validateConfiguration(rawConfiguration);
  const now = options.now ?? (() => new Date());
  const host = `${configuration.bucketName}.${configuration.accountId}.r2.cloudflarestorage.com`;

  return {
    async authorizeUpload(rawCommand): Promise<QuarantineUploadAuthorization> {
      const command = validateCommand(rawCommand);
      const requestedAt = now();
      const { amzDate, dateStamp } = formatSigningDate(requestedAt);
      const expiresSeconds = Math.floor(
        (command.expiresAt.getTime() - requestedAt.getTime()) / 1_000,
      );
      if (expiresSeconds < 1 || expiresSeconds > maximumPresignSeconds) {
        throw new R2PhotoUploadAuthorizationError(
          'authorization_expired',
          'R2 photo upload authorization expiry is outside the permitted window.',
        );
      }

      const requiredHeaders: Record<string, string> = {
        'content-type': command.declaredMimeType,
      };
      for (const [key, value] of Object.entries(command.metadata)) {
        requiredHeaders[`x-amz-meta-${key}`] = value;
      }

      const signedHeaderEntries = [
        ['host', host] as const,
        ...Object.entries(requiredHeaders).map(
          ([key, value]) => [key.toLowerCase(), canonicalHeaderValue(value)] as const,
        ),
      ].sort(([left], [right]) => left.localeCompare(right));
      const signedHeaders = signedHeaderEntries.map(([key]) => key).join(';');
      const canonicalHeaders = signedHeaderEntries
        .map(([key, value]) => `${key}:${value}`)
        .join('\n');
      const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
      const query = canonicalQuery({
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
        'X-Amz-Credential': `${configuration.accessKeyId}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': expiresSeconds.toString(),
        'X-Amz-SignedHeaders': signedHeaders,
      });
      const canonicalUri = encodeObjectKey(command.objectKey);
      const canonicalRequest = [
        'PUT',
        canonicalUri,
        query,
        canonicalHeaders,
        '',
        signedHeaders,
        'UNSIGNED-PAYLOAD',
      ].join('\n');
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest),
      ].join('\n');

      try {
        const dateKey = await hmacSha256(
          textEncoder.encode(`AWS4${configuration.secretAccessKey}`),
          dateStamp,
        );
        const regionKey = await hmacSha256(dateKey, 'auto');
        const serviceKey = await hmacSha256(regionKey, 's3');
        const signingKey = await hmacSha256(serviceKey, 'aws4_request');
        const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));
        return {
          uploadUrl: `https://${host}${canonicalUri}?${query}&X-Amz-Signature=${signature}`,
          requiredHeaders,
        };
      } catch (error) {
        if (error instanceof R2PhotoUploadAuthorizationError) throw error;
        throw new R2PhotoUploadAuthorizationError(
          'authorization_failed',
          'R2 photo upload authorization could not be signed.',
          { cause: error },
        );
      }
    },
  };
}

export function createR2PhotoUploadAuthorizerFromEnvironment(
  environment: R2PhotoUploadAuthorizerEnvironment,
  options: R2PhotoUploadAuthorizerOptions = {},
): QuarantineUploadAuthorizer {
  const parsed = r2PhotoUploadAuthorizerEnvironmentSchema.safeParse({
    CPM_R2_ACCOUNT_ID: environment.CPM_R2_ACCOUNT_ID,
    CPM_R2_PHOTO_QUARANTINE_BUCKET: environment.CPM_R2_PHOTO_QUARANTINE_BUCKET,
    CPM_R2_ACCESS_KEY_ID: environment.CPM_R2_ACCESS_KEY_ID,
    CPM_R2_SECRET_ACCESS_KEY: environment.CPM_R2_SECRET_ACCESS_KEY,
  });
  if (!parsed.success) throw new R2PhotoUploadAuthorizerConfigurationError();
  return createR2PhotoUploadAuthorizer(
    {
      accountId: parsed.data.CPM_R2_ACCOUNT_ID,
      bucketName: parsed.data.CPM_R2_PHOTO_QUARANTINE_BUCKET,
      accessKeyId: parsed.data.CPM_R2_ACCESS_KEY_ID,
      secretAccessKey: parsed.data.CPM_R2_SECRET_ACCESS_KEY,
    },
    options,
  );
}
