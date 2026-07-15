import {
  buildPhotoAuthorizationRequest,
  buildPhotoSubmissionIntake,
  createPhotoBrowserMediaValues,
  emptyPhotoBrowserFormValues,
  photoBrowserPrivateReceiptSchema,
  photoBrowserUploadAuthorizationReceiptSchema,
} from '../src/submissions/photo-browser-contract';
import {
  authorizeAndUploadPhotos,
  submitUploadedPhotos,
} from '../src/submissions/photo-browser-orchestration';
import { photoClientConfigurationSchema } from '../src/submissions/photo-client-config';

const requestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const clientId = '30000000-0000-4000-8000-000000000001';
const reservationId = '40000000-0000-4000-8000-000000000001';
const values = emptyPhotoBrowserFormValues('location', targetId);
values.privacyNoticeAccepted = true;
values.submissionTermsAccepted = true;
const media = createPhotoBrowserMediaValues(clientId, 'image/jpeg', 1_024);
media.role = 'exterior';
media.rightsHolderPresent = true;
media.publicDisplayPermission = true;
values.media = [media];

buildPhotoAuthorizationRequest(requestId, values);
buildPhotoSubmissionIntake(values, [reservationId]);
photoClientConfigurationSchema.parse({
  siteKey: '1x00000000000000000000AA',
  action: 'cpm_submission',
});
photoBrowserUploadAuthorizationReceiptSchema.parse({
  schemaVersion: 'photo-upload-authorization-receipt-v1',
  state: 'committed',
  intakeRequestId: requestId,
  expiresAt: '2026-07-15T12:00:00.000Z',
  uploads: [
    {
      quarantineUploadId: reservationId,
      method: 'PUT',
      uploadUrl: 'https://account.r2.cloudflarestorage.com/private-object',
      requiredHeaders: { 'content-type': 'image/jpeg' },
      declaredByteSize: 1_024,
    },
  ],
});
photoBrowserPrivateReceiptSchema.parse({
  submissionReference: 'CPM-S-2026-000123',
  statusSecret: 'cpmss_private-example',
  submittedAt: '2026-07-15T11:00:00.000Z',
});

for (const executable of [authorizeAndUploadPhotos, submitUploadedPhotos]) {
  if (typeof executable !== 'function') {
    throw new Error('Photos browser upload orchestration is not executable.');
  }
}

console.log('P5-05H Photos browser contracts and orchestration are valid.');
