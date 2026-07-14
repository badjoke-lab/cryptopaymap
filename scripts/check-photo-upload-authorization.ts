import { createInMemoryPhotoUploadReservationPersistence } from '../src/submissions/in-memory-photo-upload-reservations';
import {
  createPhotoUploadAuthorizationService,
  photoQuarantineObjectKey,
  photoUploadAuthorizationRequestSchema,
} from '../src/submissions/photo-upload-authorization';
import './check-photo-object-validation';

const parsed = photoUploadAuthorizationRequestSchema.parse({
  schemaVersion: 'photo-upload-authorization-v1',
  intakeRequestId: '10000000-0000-4000-8000-000000000001',
  targetType: 'location',
  targetId: '20000000-0000-4000-8000-000000000001',
  media: [
    {
      purpose: 'public_gallery_candidate',
      declaredMimeType: 'image/jpeg',
      declaredByteSize: 1_000,
    },
  ],
});

if (parsed.media.length !== 1) {
  throw new Error('Photo upload authorization request schema is not executable.');
}
if (!photoQuarantineObjectKey('30000000-0000-4000-8000-000000000001').startsWith('quarantine/')) {
  throw new Error('Photo quarantine object keys are not private-scoped.');
}
if (typeof createPhotoUploadAuthorizationService !== 'function') {
  throw new Error('Photo upload authorization service is not executable.');
}
if (typeof createInMemoryPhotoUploadReservationPersistence !== 'function') {
  throw new Error('Photo upload reservation persistence is not executable.');
}

console.log('Photo upload authorization schema and service checks passed.');
