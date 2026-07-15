import { describe, expect, it } from 'vitest';
import {
  createR2PhotoQuarantineUploadAuthorizer,
  R2PhotoUploadAuthorizerError,
} from '../src/submissions/r2-photo-upload-authorizer';
import { photoQuarantineObjectKey } from '../src/submissions/photo-upload-authorization';

const requestedAt = new Date('2026-07-15T13:00:00.000Z');
const expiresAt = new Date('2026-07-15T13:10:00.000Z');
const reservationId = '10000000-0000-4000-8000-000000000001';
const intakeRequestId = '20000000-0000-4000-8000-000000000001';
const targetId = '30000000-0000-4000-8000-000000000001';
const configuration = {
  accountId: '0123456789abcdef0123456789abcdef',
  accessKeyId: 'ABCDEFGHIJKLMNOP',
  secretAccessKey: 's'.repeat(40),
  quarantineBucket: 'cpm-photo-quarantine',
};

function command() {
  return {
    objectKey: photoQuarantineObjectKey(reservationId),
    expiresAt,
    declaredMimeType: 'image/jpeg' as const,
    metadata: {
      'cpm-schema-version': 'photo-upload-v1',
      'cpm-reservation-id': reservationId,
      'cpm-intake-request-id': intakeRequestId,
      'cpm-target-type': 'location',
      'cpm-target-id': targetId,
      'cpm-purpose': 'public_gallery_candidate',
      'cpm-declared-byte-size': '1234',
    },
  };
}

describe('P5-05I R2 photo upload signer', () => {
  it('creates a deterministic short-lived browser-compatible private PUT authorization', async () => {
    const authorizer = createR2PhotoQuarantineUploadAuthorizer(configuration, {
      now: () => requestedAt,
    });
    const first = await authorizer.authorizeUpload(command());
    const second = await authorizer.authorizeUpload(command());

    expect(second).toEqual(first);
    const url = new URL(first.uploadUrl);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/cpm-photo-quarantine/quarantine/photos/v1/${reservationId}`);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20260715T130000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'ABCDEFGHIJKLMNOP/20260715/auto/s3/aws4_request',
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('x-amz-content-sha256');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('x-amz-meta-cpm-reservation-id');

    expect(first.requiredHeaders).toEqual({
      'content-type': 'image/jpeg',
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-meta-cpm-schema-version': 'photo-upload-v1',
      'x-amz-meta-cpm-reservation-id': reservationId,
      'x-amz-meta-cpm-intake-request-id': intakeRequestId,
      'x-amz-meta-cpm-target-type': 'location',
      'x-amz-meta-cpm-target-id': targetId,
      'x-amz-meta-cpm-purpose': 'public_gallery_candidate',
      'x-amz-meta-cpm-declared-byte-size': '1234',
    });

    expect(first.uploadUrl).not.toContain(configuration.secretAccessKey);
    expect(first.uploadUrl).not.toContain(targetId);
    expect(first.uploadUrl).not.toContain(intakeRequestId);
  });

  it('binds content type and private metadata into the signature', async () => {
    const authorizer = createR2PhotoQuarantineUploadAuthorizer(configuration, {
      now: () => requestedAt,
    });
    const baseline = await authorizer.authorizeUpload(command());
    const changedMime = await authorizer.authorizeUpload({
      ...command(),
      declaredMimeType: 'image/png',
    });
    const changedMetadata = await authorizer.authorizeUpload({
      ...command(),
      metadata: { ...command().metadata, 'cpm-declared-byte-size': '1235' },
    });

    expect(new URL(changedMime.uploadUrl).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(baseline.uploadUrl).searchParams.get('X-Amz-Signature'),
    );
    expect(new URL(changedMetadata.uploadUrl).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(baseline.uploadUrl).searchParams.get('X-Amz-Signature'),
    );
  });

  it('rejects arbitrary keys, unsafe metadata, expired commands, and excessive TTL', async () => {
    const authorizer = createR2PhotoQuarantineUploadAuthorizer(configuration, {
      now: () => requestedAt,
    });

    await expect(
      authorizer.authorizeUpload({ ...command(), objectKey: 'public/photos/not-allowed' }),
    ).rejects.toMatchObject({ code: 'invalid_command' });
    await expect(
      authorizer.authorizeUpload({
        ...command(),
        metadata: { 'unsafe name': 'value' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_command' });
    await expect(
      authorizer.authorizeUpload({
        ...command(),
        expiresAt: new Date('2026-07-15T12:59:59.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'invalid_command' });
    await expect(
      authorizer.authorizeUpload({
        ...command(),
        expiresAt: new Date('2026-07-15T13:15:01.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'invalid_command' });
  });

  it('fails closed on invalid configuration without exposing credential material', () => {
    let error: unknown;
    try {
      createR2PhotoQuarantineUploadAuthorizer({
        ...configuration,
        accountId: 'not-an-account',
        secretAccessKey: 'private-secret-value-that-must-not-leak',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(R2PhotoUploadAuthorizerError);
    expect(error).toMatchObject({ code: 'invalid_configuration' });
    expect(String(error)).not.toContain('private-secret-value-that-must-not-leak');
    expect(String(error)).not.toContain('not-an-account');
  });
});
