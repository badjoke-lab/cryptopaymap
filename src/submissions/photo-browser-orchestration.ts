import { z } from 'zod';
import {
  photoBrowserPrivateReceiptSchema,
  photoBrowserUploadAuthorizationReceiptSchema,
  type PhotoBrowserAuthorizationRequest,
  type PhotoBrowserPrivateReceipt,
  type PhotoBrowserUploadAuthorizationReceipt,
} from './photo-browser-contract';
import { photosSubmissionIntakeSchema, type PhotosSubmissionIntake } from './photo-media-contract';

const publicErrorSchema = z
  .object({
    error: z.string().min(1).max(128),
  })
  .strict();

export class PhotoBrowserRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null,
  ) {
    super('The Photos request failed.');
    this.name = 'PhotoBrowserRequestError';
  }
}

export interface PhotoDirectUploadSource {
  body: Blob;
  declaredMimeType: PhotoBrowserAuthorizationRequest['media'][number]['declaredMimeType'];
  declaredByteSize: number;
}

export interface PhotoBrowserRequestOptions {
  fetcher?: typeof fetch;
}

function retryAfter(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (raw === null || !/^[0-9]+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 86_400) : null;
}

async function readPublicError(response: Response): Promise<PhotoBrowserRequestError> {
  try {
    const parsed = publicErrorSchema.safeParse(await response.json());
    return new PhotoBrowserRequestError(
      parsed.success ? parsed.data.error : 'photo_unavailable',
      response.status,
      retryAfter(response),
    );
  } catch {
    return new PhotoBrowserRequestError('photo_unavailable', response.status, retryAfter(response));
  }
}

export async function requestPhotoUploadAuthorizations(
  requestId: string,
  challengeToken: string,
  authorization: PhotoBrowserAuthorizationRequest,
  options: PhotoBrowserRequestOptions = {},
): Promise<PhotoBrowserUploadAuthorizationReceipt> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher('/api/photos/upload-authorizations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': requestId,
    },
    body: JSON.stringify({ challengeToken, authorization }),
  });
  if (!response.ok) throw await readPublicError(response);

  try {
    const receipt = photoBrowserUploadAuthorizationReceiptSchema.parse(await response.json());
    if (receipt.intakeRequestId !== requestId) {
      throw new Error('Upload authorization identity mismatch.');
    }
    return receipt;
  } catch {
    throw new PhotoBrowserRequestError('photo_unavailable', 503, null);
  }
}

export async function uploadAuthorizedPhotoFiles(
  receipt: PhotoBrowserUploadAuthorizationReceipt,
  sources: PhotoDirectUploadSource[],
  options: PhotoBrowserRequestOptions = {},
): Promise<void> {
  if (receipt.uploads.length !== sources.length) {
    throw new PhotoBrowserRequestError('photo_unavailable', 503, null);
  }
  const fetcher = options.fetcher ?? fetch;

  for (const [index, upload] of receipt.uploads.entries()) {
    const source = sources[index];
    if (
      source === undefined ||
      source.declaredByteSize !== upload.declaredByteSize ||
      source.body.size !== source.declaredByteSize ||
      upload.requiredHeaders['content-type'] !== source.declaredMimeType
    ) {
      throw new PhotoBrowserRequestError('photo_request_invalid', 400, null);
    }

    let response: Response;
    try {
      response = await fetcher(upload.uploadUrl, {
        method: upload.method,
        headers: upload.requiredHeaders,
        body: source.body,
      });
    } catch {
      throw new PhotoBrowserRequestError('photo_upload_failed', 0, null);
    }
    if (!response.ok) {
      throw new PhotoBrowserRequestError('photo_upload_failed', response.status, null);
    }
  }
}

export async function authorizeAndUploadPhotos(
  requestId: string,
  challengeToken: string,
  authorization: PhotoBrowserAuthorizationRequest,
  sources: PhotoDirectUploadSource[],
  options: PhotoBrowserRequestOptions = {},
): Promise<PhotoBrowserUploadAuthorizationReceipt> {
  const receipt = await requestPhotoUploadAuthorizations(
    requestId,
    challengeToken,
    authorization,
    options,
  );
  await uploadAuthorizedPhotoFiles(receipt, sources, options);
  return receipt;
}

export async function submitUploadedPhotos(
  requestId: string,
  challengeToken: string,
  rawSubmission: PhotosSubmissionIntake,
  options: PhotoBrowserRequestOptions = {},
): Promise<PhotoBrowserPrivateReceipt> {
  const fetcher = options.fetcher ?? fetch;
  const submission = photosSubmissionIntakeSchema.parse(rawSubmission);
  const response = await fetcher('/api/photos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': requestId,
    },
    body: JSON.stringify({ challengeToken, submission }),
  });
  if (!response.ok) throw await readPublicError(response);

  try {
    return photoBrowserPrivateReceiptSchema.parse(await response.json());
  } catch {
    throw new PhotoBrowserRequestError('photo_unavailable', 503, null);
  }
}
