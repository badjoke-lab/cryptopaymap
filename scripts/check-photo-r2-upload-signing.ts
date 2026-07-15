import {
  buildPhotoDirectUploadAuditResult,
  photoDirectUploadAuditResultSchema,
} from '../src/submissions/photo-direct-upload-audit';
import { createR2PhotoQuarantineUploadAuthorizer } from '../src/submissions/r2-photo-upload-authorizer';
import { createR2PhotoQuarantineUploadAuthorizerFromEnvironment } from '../src/submissions/r2-photo-upload-environment';
import { photoQuarantineObjectKey } from '../src/submissions/photo-upload-authorization';

const requestedAt = new Date('2026-07-15T13:00:00.000Z');
const reservationId = '10000000-0000-4000-8000-000000000001';
const environment = {
  CPM_PHOTO_R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  CPM_PHOTO_R2_ACCESS_KEY_ID: 'ABCDEFGHIJKLMNOP',
  CPM_PHOTO_R2_SECRET_ACCESS_KEY: 's'.repeat(40),
  CPM_PHOTO_R2_QUARANTINE_BUCKET: 'cpm-photo-quarantine',
};
const authorizer = createR2PhotoQuarantineUploadAuthorizerFromEnvironment(environment, {
  now: () => requestedAt,
});
const authorization = await authorizer.authorizeUpload({
  objectKey: photoQuarantineObjectKey(reservationId),
  expiresAt: new Date('2026-07-15T13:10:00.000Z'),
  declaredMimeType: 'image/jpeg',
  metadata: {
    'cpm-schema-version': 'photo-upload-v1',
    'cpm-reservation-id': reservationId,
  },
});

if (!authorization.uploadUrl.startsWith('https://')) {
  throw new Error('R2 photo authorization did not produce an HTTPS URL.');
}
if (authorization.requiredHeaders['x-amz-content-sha256'] !== 'UNSIGNED-PAYLOAD') {
  throw new Error('R2 photo authorization did not bind the unsigned payload header.');
}

const audit = buildPhotoDirectUploadAuditResult({
  clientConfigurationHttpStatus: 200,
  clientConfigurationMatches: true,
  photosPageHttpStatus: 200,
  photosPageHeadersMatch: true,
  authorizationHttpStatus: 200,
  authorizationReceiptValid: true,
  authorizationPrivateScopeMatches: true,
  corsPreflightHttpStatus: 204,
  corsPolicyMatches: true,
  directPutHttpStatus: 200,
  objectHeadHttpStatus: 200,
  storedObjectMatches: true,
  privateIntakeHttpStatus: 202,
  privateIntakeReceiptValid: true,
  databaseProjectionMatches: true,
  automaticMediaAbsent: true,
  publicArtifactsUnchanged: {
    '/data/manifest.json': true,
    '/version.json': true,
  },
  cleanupDeleteHttpStatus: 204,
  cleanupHeadHttpStatus: 404,
  cleanupConfirmed: true,
});
photoDirectUploadAuditResultSchema.parse(audit.result);

for (const executable of [
  createR2PhotoQuarantineUploadAuthorizer,
  createR2PhotoQuarantineUploadAuthorizerFromEnvironment,
  buildPhotoDirectUploadAuditResult,
]) {
  if (typeof executable !== 'function') {
    throw new Error('P5-05I R2 upload signing boundary is not executable.');
  }
}

console.log('P5-05I R2 upload signing and audit schemas passed.');
