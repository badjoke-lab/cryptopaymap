import { describe, expect, it } from 'vitest';
import {
  createR2PhotoQuarantineUploadAuthorizerFromEnvironment,
  R2PhotoUploadEnvironmentConfigurationError,
} from '../src/submissions/r2-photo-upload-environment';
import { photoQuarantineObjectKey } from '../src/submissions/photo-upload-authorization';

const requestedAt = new Date('2026-07-15T13:00:00.000Z');
const reservationId = '10000000-0000-4000-8000-000000000001';
const environment = {
  CPM_PHOTO_R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  CPM_PHOTO_R2_ACCESS_KEY_ID: 'ABCDEFGHIJKLMNOP',
  CPM_PHOTO_R2_SECRET_ACCESS_KEY: 's'.repeat(40),
  CPM_PHOTO_R2_QUARANTINE_BUCKET: 'cpm-photo-quarantine',
};

describe('P5-05I R2 photo upload environment binding', () => {
  it('creates a configured private authorizer without exposing environment values', async () => {
    const authorizer = createR2PhotoQuarantineUploadAuthorizerFromEnvironment(environment, {
      now: () => requestedAt,
    });
    const authorization = await authorizer.authorizeUpload({
      objectKey: photoQuarantineObjectKey(reservationId),
      expiresAt: new Date('2026-07-15T13:10:00.000Z'),
      declaredMimeType: 'image/webp',
      metadata: {
        'cpm-schema-version': 'photo-upload-v1',
        'cpm-reservation-id': reservationId,
      },
    });

    expect(new URL(authorization.uploadUrl).protocol).toBe('https:');
    expect(authorization.requiredHeaders['content-type']).toBe('image/webp');
    expect(authorization.uploadUrl).not.toContain(environment.CPM_PHOTO_R2_SECRET_ACCESS_KEY);
  });

  it('maps missing and malformed values to one generic configuration failure', () => {
    for (const invalid of [
      {},
      { ...environment, CPM_PHOTO_R2_ACCOUNT_ID: 'invalid' },
      { ...environment, CPM_PHOTO_R2_SECRET_ACCESS_KEY: 'short' },
      { ...environment, CPM_PHOTO_R2_QUARANTINE_BUCKET: 'Invalid Bucket' },
    ]) {
      let error: unknown;
      try {
        createR2PhotoQuarantineUploadAuthorizerFromEnvironment(invalid);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(R2PhotoUploadEnvironmentConfigurationError);
      expect(String(error)).not.toContain('short');
      expect(String(error)).not.toContain('Invalid Bucket');
      expect(String(error)).not.toContain(environment.CPM_PHOTO_R2_SECRET_ACCESS_KEY);
    }
  });
});
