import { describe, expect, it } from 'vitest';
import {
  createR2PhotoUploadAuthorizer,
  createR2PhotoUploadAuthorizerFromEnvironment,
  R2PhotoUploadAuthorizationError,
  R2PhotoUploadAuthorizerConfigurationError,
} from '../src/submissions/r2-photo-upload-authorizer';

const now = new Date('2026-07-15T12:30:00.000Z');
const configuration = {
  accountId: '0123456789abcdef0123456789abcdef',
  bucketName: 'cpm-photo-quarantine',
  accessKeyId: 'CFACCESSKEY1234567890',
  secretAccessKey: 'synthetic-secret-access-key-0123456789abcdef',
};
const reservationId = '30000000-0000-8000-8000-000000000001';

function command(expiresAt = new Date(now.getTime() + 10 * 60 * 1_000)) {
  return {
    objectKey: `quarantine/photos/v1/${reservationId}`,
    expiresAt,
    declaredMimeType: 'image/jpeg' as const,
    metadata: {
      'cpm-schema-version': 'photo-upload-v1',
      'cpm-reservation-id': reservationId,
      'cpm-intake-request-id': '10000000-0000-4000-8000-000000000001',
      'cpm-target-type': 'location',
      'cpm-target-id': '20000000-0000-4000-8000-000000000001',
      'cpm-purpose': 'public_gallery_candidate',
      'cpm-declared-byte-size': '1234',
    },
  };
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams.entries()]
    .filter(([key]) => key !== 'X-Amz-Signature')
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  return hex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  );
}

async function hmac(keyBytes: Uint8Array, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  );
}

async function verifySignature(
  uploadUrl: string,
  requiredHeaders: Record<string, string>,
  secretAccessKey: string,
): Promise<boolean> {
  const url = new URL(uploadUrl);
  const amzDate = url.searchParams.get('X-Amz-Date');
  const credential = url.searchParams.get('X-Amz-Credential');
  const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders');
  const actualSignature = url.searchParams.get('X-Amz-Signature');
  if (amzDate === null || credential === null || signedHeaders === null || actualSignature === null) {
    return false;
  }
  const credentialScope = credential.split('/').slice(1).join('/');
  const dateStamp = credentialScope.split('/')[0];
  if (dateStamp === undefined) return false;

  const headerValues = new Map<string, string>([
    ['host', url.host],
    ...Object.entries(requiredHeaders).map(
      ([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const,
    ),
  ]);
  const canonicalHeaders = signedHeaders
    .split(';')
    .map((header) => `${header}:${headerValues.get(header) ?? ''}`)
    .join('\n');
  const request = [
    'PUT',
    url.pathname,
    canonicalQuery(url),
    canonicalHeaders,
    '',
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256(request),
  ].join('\n');
  const encoder = new TextEncoder();
  const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const regionKey = await hmac(dateKey, 'auto');
  const serviceKey = await hmac(regionKey, 's3');
  const signingKey = await hmac(serviceKey, 'aws4_request');
  return hex(await hmac(signingKey, stringToSign)) === actualSignature;
}

describe('P5-05I configured R2 photo upload authorizer', () => {
  it('signs one exact private PUT with content type and private metadata', async () => {
    const authorizer = createR2PhotoUploadAuthorizer(configuration, { now: () => now });
    const authorization = await authorizer.authorizeUpload(command());
    const url = new URL(authorization.uploadUrl);

    expect(url.protocol).toBe('https:');
    expect(url.host).toBe(
      'cpm-photo-quarantine.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
    );
    expect(url.pathname).toBe(`/quarantine/photos/v1/${reservationId}`);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Content-Sha256')).toBe('UNSIGNED-PAYLOAD');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'CFACCESSKEY1234567890/20260715/auto/s3/aws4_request',
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      [
        'content-type',
        'host',
        'x-amz-meta-cpm-declared-byte-size',
        'x-amz-meta-cpm-intake-request-id',
        'x-amz-meta-cpm-purpose',
        'x-amz-meta-cpm-reservation-id',
        'x-amz-meta-cpm-schema-version',
        'x-amz-meta-cpm-target-id',
        'x-amz-meta-cpm-target-type',
      ].join(';'),
    );
    expect(authorization.requiredHeaders).toEqual({
      'content-type': 'image/jpeg',
      'x-amz-meta-cpm-schema-version': 'photo-upload-v1',
      'x-amz-meta-cpm-reservation-id': reservationId,
      'x-amz-meta-cpm-intake-request-id': '10000000-0000-4000-8000-000000000001',
      'x-amz-meta-cpm-target-type': 'location',
      'x-amz-meta-cpm-target-id': '20000000-0000-4000-8000-000000000001',
      'x-amz-meta-cpm-purpose': 'public_gallery_candidate',
      'x-amz-meta-cpm-declared-byte-size': '1234',
    });
    expect(
      await verifySignature(
        authorization.uploadUrl,
        authorization.requiredHeaders,
        configuration.secretAccessKey,
      ),
    ).toBe(true);
    expect(authorization.uploadUrl).not.toContain(configuration.secretAccessKey);
  });

  it('fails signature verification when the private object path is changed', async () => {
    const authorization = await createR2PhotoUploadAuthorizer(configuration, {
      now: () => now,
    }).authorizeUpload(command());
    const tampered = new URL(authorization.uploadUrl);
    tampered.pathname = `/quarantine/photos/v1/30000000-0000-8000-8000-000000000002`;

    expect(
      await verifySignature(
        tampered.toString(),
        authorization.requiredHeaders,
        configuration.secretAccessKey,
      ),
    ).toBe(false);
  });

  it('rejects non-quarantine keys and expiry outside the bounded window', async () => {
    const authorizer = createR2PhotoUploadAuthorizer(configuration, { now: () => now });
    await expect(
      authorizer.authorizeUpload({ ...command(), objectKey: 'public/photos/example.jpg' }),
    ).rejects.toMatchObject<R2PhotoUploadAuthorizationError>({ code: 'invalid_command' });
    await expect(
      authorizer.authorizeUpload(command(new Date(now.getTime() + 16 * 60 * 1_000))),
    ).rejects.toMatchObject<R2PhotoUploadAuthorizationError>({ code: 'authorization_expired' });
    await expect(
      authorizer.authorizeUpload(command(new Date(now.getTime() - 1_000))),
    ).rejects.toMatchObject<R2PhotoUploadAuthorizationError>({ code: 'authorization_expired' });
  });

  it('reads only strict server-side R2 configuration', async () => {
    const configured = createR2PhotoUploadAuthorizerFromEnvironment(
      {
        CPM_R2_ACCOUNT_ID: configuration.accountId,
        CPM_R2_PHOTO_QUARANTINE_BUCKET: configuration.bucketName,
        CPM_R2_ACCESS_KEY_ID: configuration.accessKeyId,
        CPM_R2_SECRET_ACCESS_KEY: configuration.secretAccessKey,
      },
      { now: () => now },
    );
    await expect(configured.authorizeUpload(command())).resolves.toMatchObject({
      requiredHeaders: { 'content-type': 'image/jpeg' },
    });

    expect(() =>
      createR2PhotoUploadAuthorizerFromEnvironment({
        CPM_R2_ACCOUNT_ID: configuration.accountId,
        CPM_R2_PHOTO_QUARANTINE_BUCKET: configuration.bucketName,
        CPM_R2_ACCESS_KEY_ID: configuration.accessKeyId,
      }),
    ).toThrow(R2PhotoUploadAuthorizerConfigurationError);
  });
});
