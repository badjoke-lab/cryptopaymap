import { uploadAuthorizedPhotoFiles } from '../src/submissions/photo-browser-orchestration';
import { createInMemoryPhotoUploadReservationPersistence } from '../src/submissions/in-memory-photo-upload-reservations';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createPhotoPrivateIntakeService } from '../src/submissions/photo-intake-service';
import { createPhotoUploadAuthorizationService } from '../src/submissions/photo-upload-authorization';
import { createR2PhotoUploadAuthorizer } from '../src/submissions/r2-photo-upload-authorizer';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const now = new Date('2026-07-15T12:30:00.000Z');
const requestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const submissionId = '40000000-0000-4000-8000-000000000001';
const declaredMimeType = 'image/jpeg' as const;
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

const reservationPersistence = createInMemoryPhotoUploadReservationPersistence();
const authorizer = createR2PhotoUploadAuthorizer(
  {
    accountId: '0123456789abcdef0123456789abcdef',
    bucketName: 'cpm-photo-quarantine',
    accessKeyId: 'CFACCESSKEY1234567890',
    secretAccessKey: 'synthetic-secret-access-key-0123456789abcdef',
  },
  { now: () => now },
);
const authorizationService = createPhotoUploadAuthorizationService({
  persistence: reservationPersistence,
  authorizer,
});
const authorization = await authorizationService.authorize(
  {
    schemaVersion: 'photo-upload-authorization-v1',
    intakeRequestId: requestId,
    targetType: 'location',
    targetId,
    media: [
      {
        purpose: 'public_gallery_candidate',
        declaredMimeType,
        declaredByteSize: bytes.byteLength,
      },
    ],
  },
  now,
);

let uploadedObject:
  | {
      urlHost: string;
      objectPath: string;
      byteSize: number;
      contentType: string | null;
      reservationId: string | null;
    }
  | undefined;

await uploadAuthorizedPhotoFiles(
  authorization,
  [
    {
      body: new Blob([bytes], { type: declaredMimeType }),
      declaredMimeType,
      declaredByteSize: bytes.byteLength,
    },
  ],
  {
    fetcher: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const headers = new Headers(init?.headers);
      if (url.protocol !== 'https:' || !url.host.endsWith('.r2.cloudflarestorage.com')) {
        throw new Error('Synthetic upload did not target the bounded R2 S3 endpoint.');
      }
      if (init?.method !== 'PUT') throw new Error('Synthetic upload did not use PUT.');
      if (headers.get('content-type') !== declaredMimeType) {
        throw new Error('Synthetic upload content type was not bound.');
      }
      const body = init?.body;
      if (!(body instanceof Blob) || body.size !== bytes.byteLength) {
        throw new Error('Synthetic upload body was not the exact bounded Blob.');
      }
      uploadedObject = {
        urlHost: url.host,
        objectPath: url.pathname,
        byteSize: body.size,
        contentType: headers.get('content-type'),
        reservationId: headers.get('x-amz-meta-cpm-reservation-id'),
      };
      return new Response(null, { status: 200 });
    },
  },
);

const reservation = reservationPersistence.list()[0];
const upload = authorization.uploads[0];
if (reservation === undefined || upload === undefined || uploadedObject === undefined) {
  throw new Error('Synthetic upload did not produce one private reservation and object receipt.');
}
if (
  uploadedObject.objectPath !== `/quarantine/photos/v1/${reservation.id}` ||
  uploadedObject.reservationId !== reservation.id
) {
  throw new Error('Synthetic upload did not bind the deterministic private object identity.');
}

const submissionPersistence = createInMemorySubmissionPersistenceBackend();
submissionPersistence.seedQuarantineReservation({
  id: reservation.id,
  intakeRequestId: reservation.intakeRequestId,
  purpose: reservation.purpose,
  expiresAt: new Date(reservation.expiresAt),
});
const privateIntake = createPhotoPrivateIntakeService({
  persistence: submissionPersistence,
  statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
  contactProtector: {
    async protectEmail() {
      throw new Error('Synthetic audit must not process contact data.');
    },
  },
  generateSubmissionId: () => submissionId,
});
const privateReceipt = await privateIntake.submit(
  requestId,
  {
    schemaVersion: 'submission-common-v1',
    submissionType: 'photos',
    targetType: 'location',
    targetId,
    relationship: 'customer',
    contact: null,
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'photo-media-v1',
      media: [
        {
          quarantineUploadId: upload.quarantineUploadId,
          purpose: 'public_gallery_candidate',
          role: 'exterior',
          declaredMimeType,
          declaredByteSize: bytes.byteLength,
          capturedAt: null,
          description: 'Synthetic private upload audit.',
          suggestedAltText: null,
          photographerPresent: true,
          rights: {
            rightsStatus: 'submitted_with_permission',
            rightsHolderPresent: true,
            permissionReferencePresent: false,
            licenseName: null,
            licenseUrl: null,
            publicDisplayPermission: true,
          },
        },
      ],
      submitterNote: null,
    },
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  },
  new Date(now.getTime() + 1_000),
);

const consumedReservation = submissionPersistence.reservationSnapshot()[0];
if (
  privateReceipt.state !== 'committed' ||
  privateReceipt.publicId !== 'CPM-S-2026-000001' ||
  consumedReservation?.consumedBySubmissionId !== submissionId ||
  consumedReservation?.consumedAt?.toISOString() !== '2026-07-15T12:30:01.000Z'
) {
  throw new Error('Synthetic private intake did not atomically consume the upload reservation.');
}

const safeAuditReceipt = {
  result: 'passed',
  operation: 'configured-r2-put-and-private-intake',
  objectScope: 'private-quarantine',
  uploadedBytes: uploadedObject.byteSize,
  submissionReference: privateReceipt.publicId,
  reservationConsumed: true,
  automaticProcessing: false,
  mediaApproved: false,
  publicObjectCreated: false,
};
const serialized = JSON.stringify(safeAuditReceipt);
for (const forbidden of [
  'CFACCESSKEY1234567890',
  'synthetic-secret-access-key',
  'X-Amz-Signature',
  privateReceipt.statusSecret,
  requestId,
  reservation.id,
]) {
  if (serialized.includes(forbidden)) {
    throw new Error('Synthetic audit receipt leaked private signing or Submission material.');
  }
}

console.log('Photos configured R2 direct-upload and private-intake audit passed.');
