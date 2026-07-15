import { describe, expect, it, vi } from 'vitest';
import {
  buildPhotoAuthorizationRequest,
  buildPhotoSubmissionIntake,
  createPhotoBrowserMediaValues,
  emptyPhotoBrowserFormValues,
} from '../src/submissions/photo-browser-contract';
import {
  authorizeAndUploadPhotos,
  PhotoBrowserRequestError,
  submitUploadedPhotos,
} from '../src/submissions/photo-browser-orchestration';

const requestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const clientId = '30000000-0000-4000-8000-000000000001';
const reservationId = '40000000-0000-4000-8000-000000000001';

function values() {
  const result = emptyPhotoBrowserFormValues('entity', targetId);
  result.privacyNoticeAccepted = true;
  result.submissionTermsAccepted = true;
  const media = createPhotoBrowserMediaValues(clientId, 'image/png', 4);
  media.role = 'payment_sign';
  media.rightsHolderPresent = true;
  media.publicDisplayPermission = true;
  result.media = [media];
  return result;
}

function authorizationReceipt() {
  return {
    schemaVersion: 'photo-upload-authorization-receipt-v1',
    state: 'committed',
    intakeRequestId: requestId,
    expiresAt: '2026-07-15T12:00:00.000Z',
    uploads: [
      {
        quarantineUploadId: reservationId,
        method: 'PUT',
        uploadUrl: 'https://account.r2.cloudflarestorage.com/private-object',
        requiredHeaders: {
          'content-type': 'image/png',
          'x-amz-meta-cpm-reservation-id': reservationId,
        },
        declaredByteSize: 4,
      },
    ],
  };
}

describe('P5-05H direct upload orchestration', () => {
  it('requests authorization, sends exact PUT instructions, and submits only opaque IDs', async () => {
    const formValues = values();
    const authorization = buildPhotoAuthorizationRequest(requestId, formValues);
    const bytes = new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'image/png' });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authorizationReceipt()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            submissionReference: 'CPM-S-2026-000123',
            statusSecret: 'cpmss_private-example',
            submittedAt: '2026-07-15T11:00:00.000Z',
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const uploadReceipt = await authorizeAndUploadPhotos(
      requestId,
      'authorization-turnstile-token',
      authorization,
      [{ body: bytes, declaredMimeType: 'image/png', declaredByteSize: 4 }],
      { fetcher },
    );
    const submission = buildPhotoSubmissionIntake(formValues, [reservationId]);
    const receipt = await submitUploadedPhotos(
      requestId,
      'intake-turnstile-token',
      submission,
      { fetcher },
    );

    expect(receipt.submissionReference).toBe('CPM-S-2026-000123');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/photos/upload-authorizations');
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://account.r2.cloudflarestorage.com/private-object',
    );
    expect(fetcher.mock.calls[1]?.[1]).toEqual({
      method: 'PUT',
      headers: authorizationReceipt().uploads[0]!.requiredHeaders,
      body: bytes,
    });
    expect(fetcher.mock.calls[2]?.[0]).toBe('/api/photos');

    const finalBody = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body));
    expect(finalBody.challengeToken).toBe('intake-turnstile-token');
    expect(finalBody.submission.originalPayload.media[0].quarantineUploadId).toBe(reservationId);
    expect(JSON.stringify(finalBody)).not.toContain('cloudflarestorage.com');
    expect(JSON.stringify(finalBody)).not.toContain('x-amz-meta');
  });

  it('fails closed when direct upload metadata does not match the local file', async () => {
    const formValues = values();
    const authorization = buildPhotoAuthorizationRequest(requestId, formValues);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify(authorizationReceipt()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      authorizeAndUploadPhotos(
        requestId,
        'challenge',
        authorization,
        [
          {
            body: new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' }),
            declaredMimeType: 'image/png',
            declaredByteSize: 4,
          },
        ],
        { fetcher },
      ),
    ).rejects.toMatchObject({ code: 'photo_request_invalid' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('maps bounded server errors without exposing response internals', async () => {
    const formValues = values();
    const authorization = buildPhotoAuthorizationRequest(requestId, formValues);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: 'photo_rate_limited', detail: 'private detail' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '12' },
      }),
    );

    await expect(
      authorizeAndUploadPhotos(
        requestId,
        'challenge',
        authorization,
        [
          {
            body: new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'image/png' }),
            declaredMimeType: 'image/png',
            declaredByteSize: 4,
          },
        ],
        { fetcher },
      ),
    ).rejects.toEqual(new PhotoBrowserRequestError('photo_rate_limited', 429, 12));
  });
});
