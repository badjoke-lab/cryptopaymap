import { describe, expect, it, vi } from 'vitest';
import {
  SubmissionAbuseControlError,
  type AbuseControlledSubmissionIntakeService,
} from '../src/submissions/abuse-controlled-intake';
import { SubmissionIntakeError } from '../src/submissions/intake-service';
import {
  createPhotoPrivateIntakeHttpHandler,
  createPhotoUploadAuthorizationHttpHandler,
  photoHttpMaximumBodyBytes,
  type PhotoHttpPagesContext,
  type PhotoPrivateIntakeHttpRuntime,
  type PhotoUploadAuthorizationHttpRuntime,
} from '../src/submissions/photo-http';
import {
  PhotoUploadAuthorizationError,
  type PhotoUploadAuthorizationReceipt,
} from '../src/submissions/photo-upload-authorization';

const requestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const quarantineUploadId = '30000000-0000-4000-8000-000000000001';
const opaqueBucket = `rl_${'A'.repeat(43)}`;
const now = new Date('2026-07-15T07:00:00.000Z');

function validAuthorization() {
  return {
    schemaVersion: 'photo-upload-authorization-v1',
    intakeRequestId: requestId,
    targetType: 'location',
    targetId,
    media: [
      {
        purpose: 'public_gallery_candidate',
        declaredMimeType: 'image/jpeg',
        declaredByteSize: 1_234,
      },
    ],
  };
}

function validPhotoSubmission() {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType: 'photos',
    targetType: 'location',
    targetId,
    relationship: 'customer',
    contact: { email: 'submitter@example.com', contactAllowed: true },
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'photo-media-v1',
      media: [
        {
          quarantineUploadId,
          purpose: 'public_gallery_candidate',
          role: 'exterior',
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 1_234,
          capturedAt: null,
          description: 'Storefront exterior.',
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
  };
}

function jsonRequest(url: string, body: unknown, idempotencyKey = requestId): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': idempotencyKey,
      'CF-Connecting-IP': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

function authorizationRequest(
  idempotencyKey = requestId,
  body: unknown = {
    challengeToken: 'turnstile-token',
    authorization: validAuthorization(),
  },
): Request {
  return jsonRequest('https://example.test/api/photos/upload-authorizations', body, idempotencyKey);
}

function intakeRequest(
  body: unknown = {
    challengeToken: 'turnstile-token',
    submission: validPhotoSubmission(),
  },
): Request {
  return jsonRequest('https://example.test/api/photos', body);
}

function pagesContext(request: Request): PhotoHttpPagesContext<Record<string, unknown>> {
  return {
    request,
    env: {},
    params: {},
    data: {},
    waitUntil() {},
  };
}

const authorizationReceipt: PhotoUploadAuthorizationReceipt = {
  schemaVersion: 'photo-upload-authorization-receipt-v1',
  state: 'committed',
  intakeRequestId: requestId,
  expiresAt: '2026-07-15T07:10:00.000Z',
  uploads: [
    {
      quarantineUploadId,
      method: 'PUT',
      uploadUrl: 'https://uploads.example.test/private-signed-upload',
      requiredHeaders: {
        'content-type': 'image/jpeg',
        'x-amz-meta-cpm-reservation-id': quarantineUploadId,
      },
      declaredByteSize: 1_234,
    },
  ],
};

function uploadFixture(options?: {
  rateLimitOutcome?: 'allow' | 'deny' | 'unavailable';
  challengeOutcome?: 'allow' | 'deny' | 'unavailable';
  authorizationError?: Error;
}) {
  const order: string[] = [];
  const deriveBucketKey = vi.fn(async () => opaqueBucket);
  const consume = vi.fn(async () => {
    order.push('rate-limit');
    if (options?.rateLimitOutcome === 'deny') {
      return { outcome: 'deny' as const, retryAfterSeconds: 17 };
    }
    if (options?.rateLimitOutcome === 'unavailable') {
      return { outcome: 'unavailable' as const, reasonCode: 'synthetic' };
    }
    return { outcome: 'allow' as const, remaining: 4 };
  });
  const verify = vi.fn(async () => {
    order.push('challenge');
    if (options?.challengeOutcome === 'deny') {
      return { outcome: 'deny' as const, reasonCode: 'synthetic' };
    }
    if (options?.challengeOutcome === 'unavailable') {
      return { outcome: 'unavailable' as const, reasonCode: 'synthetic' };
    }
    return { outcome: 'allow' as const, reasonCode: 'ok' };
  });
  const authorize = vi.fn(async () => {
    order.push('authorize');
    if (options?.authorizationError !== undefined) throw options.authorizationError;
    return structuredClone(authorizationReceipt);
  });
  const runtime: PhotoUploadAuthorizationHttpRuntime = {
    bucketDeriver: { deriveBucketKey },
    rateLimiter: { consume },
    challengeVerifier: { verify },
    uploadAuthorizations: { authorize },
  };
  const runtimeFromEnvironment = vi.fn(() => runtime);
  const handler = createPhotoUploadAuthorizationHttpHandler({
    runtimeFromEnvironment,
    now: () => now,
  });
  return { handler, runtimeFromEnvironment, order, deriveBucketKey, consume, verify, authorize };
}

function intakeFixture(submitError?: Error) {
  const deriveBucketKey = vi.fn(async () => opaqueBucket);
  const submit = vi.fn(async () => {
    if (submitError !== undefined) throw submitError;
    return {
      state: 'committed' as const,
      publicId: 'CPM-S-2026-000123',
      statusSecret: 'cpmss_private-status-secret',
      submittedAt: now.toISOString(),
    };
  });
  const runtime: PhotoPrivateIntakeHttpRuntime = {
    bucketDeriver: { deriveBucketKey },
    intake: { submit } satisfies AbuseControlledSubmissionIntakeService,
  };
  const runtimeFromEnvironment = vi.fn(() => runtime);
  const handler = createPhotoPrivateIntakeHttpHandler({
    runtimeFromEnvironment,
    now: () => now,
  });
  return { handler, runtimeFromEnvironment, deriveBucketKey, submit };
}

describe('P5-05G public Photos HTTP boundaries', () => {
  it('authorizes a private upload only after edge, rate-limit, and challenge checks', async () => {
    const fixture = uploadFixture();
    const response = await fixture.handler(pagesContext(authorizationRequest()));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual(authorizationReceipt);
    expect(responseText).not.toContain('203.0.113.10');
    expect(fixture.order).toEqual(['rate-limit', 'challenge', 'authorize']);
    expect(fixture.deriveBucketKey).toHaveBeenCalledWith('203.0.113.10');
    expect(fixture.consume).toHaveBeenCalledWith({
      requestId,
      bucketKey: opaqueBucket,
      receivedAt: now,
    });
    expect(fixture.verify).toHaveBeenCalledWith({
      requestId,
      token: 'turnstile-token',
      remoteIp: '203.0.113.10',
    });
    expect(fixture.authorize).toHaveBeenCalledWith(validAuthorization(), now);
  });

  it('requires the header identity to match the authorization intake identity', async () => {
    const fixture = uploadFixture();
    const response = await fixture.handler(
      pagesContext(authorizationRequest('10000000-0000-4000-8000-000000000002')),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'photo_request_invalid' });
    expect(fixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('maps upload abuse and reservation failures to bounded public errors', async () => {
    const limited = uploadFixture({ rateLimitOutcome: 'deny' });
    const limitedResponse = await limited.handler(pagesContext(authorizationRequest()));
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get('Retry-After')).toBe('17');
    expect(limited.verify).not.toHaveBeenCalled();
    expect(limited.authorize).not.toHaveBeenCalled();

    const challenged = uploadFixture({ challengeOutcome: 'deny' });
    const challengeResponse = await challenged.handler(pagesContext(authorizationRequest()));
    expect(challengeResponse.status).toBe(400);
    expect(challenged.authorize).not.toHaveBeenCalled();

    const conflicted = uploadFixture({
      authorizationError: new PhotoUploadAuthorizationError(
        'idempotency_conflict',
        'private reservation detail',
      ),
    });
    const conflictResponse = await conflicted.handler(pagesContext(authorizationRequest()));
    const conflictText = await conflictResponse.text();
    expect(conflictResponse.status).toBe(409);
    expect(JSON.parse(conflictText)).toEqual({ error: 'photo_request_conflict' });
    expect(conflictText).not.toContain('private reservation detail');
  });

  it('returns only the private Submission receipt from intake', async () => {
    const fixture = intakeFixture();
    const response = await fixture.handler(pagesContext(intakeRequest()));

    expect(response.status).toBe(202);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({
      submissionReference: 'CPM-S-2026-000123',
      statusSecret: 'cpmss_private-status-secret',
      submittedAt: now.toISOString(),
    });
    expect(responseText).not.toContain('submitter@example.com');
    expect(responseText).not.toContain(quarantineUploadId);
    expect(responseText).not.toContain('203.0.113.10');
    expect(fixture.deriveBucketKey).toHaveBeenCalledWith('203.0.113.10');
    expect(fixture.submit).toHaveBeenCalledWith({
      requestId,
      challengeToken: 'turnstile-token',
      rateLimitKey: opaqueBucket,
      remoteIp: '203.0.113.10',
      rawInput: validPhotoSubmission(),
      receivedAt: now,
    });
  });

  it('maps intake rate-limit and idempotency failures without private detail', async () => {
    const limited = await intakeFixture(
      new SubmissionAbuseControlError('rate_limited', 'private rate detail', 11),
    ).handler(pagesContext(intakeRequest()));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('11');
    await expect(limited.json()).resolves.toEqual({ error: 'photo_rate_limited' });

    const conflict = await intakeFixture(
      new SubmissionIntakeError('idempotency_conflict', 'private submission detail'),
    ).handler(pagesContext(intakeRequest()));
    const conflictText = await conflict.text();
    expect(conflict.status).toBe(409);
    expect(JSON.parse(conflictText)).toEqual({ error: 'photo_request_conflict' });
    expect(conflictText).not.toContain('private submission detail');
  });

  it('rejects unsupported media, oversized bodies, and undeclared storage fields early', async () => {
    const unsupportedFixture = intakeFixture();
    const unsupported = intakeRequest();
    const unsupportedHeaders = new Headers(unsupported.headers);
    unsupportedHeaders.set('Content-Type', 'text/plain');
    const unsupportedResponse = await unsupportedFixture.handler(
      pagesContext(
        new Request(unsupported.url, {
          method: 'POST',
          headers: unsupportedHeaders,
          body: 'not json',
        }),
      ),
    );
    expect(unsupportedResponse.status).toBe(415);
    expect(unsupportedFixture.runtimeFromEnvironment).not.toHaveBeenCalled();

    const oversizedFixture = uploadFixture();
    const oversizedResponse = await oversizedFixture.handler(
      pagesContext(
        new Request('https://example.test/api/photos/upload-authorizations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestId,
            'CF-Connecting-IP': '203.0.113.10',
          },
          body: 'x'.repeat(photoHttpMaximumBodyBytes + 1),
        }),
      ),
    );
    expect(oversizedResponse.status).toBe(413);
    expect(oversizedFixture.runtimeFromEnvironment).not.toHaveBeenCalled();

    const leakedFixture = uploadFixture();
    const leakedResponse = await leakedFixture.handler(
      pagesContext(
        authorizationRequest(requestId, {
          challengeToken: 'turnstile-token',
          authorization: {
            ...validAuthorization(),
            storageKey: 'quarantine/photos/private-secret',
          },
        }),
      ),
    );
    expect(leakedResponse.status).toBe(400);
    expect(leakedFixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('fails closed without trusted Cloudflare edge identity', async () => {
    const fixture = intakeFixture();
    const input = intakeRequest();
    const headers = new Headers(input.headers);
    headers.delete('CF-Connecting-IP');
    const response = await fixture.handler(
      pagesContext(
        new Request(input.url, {
          method: 'POST',
          headers,
          body: await input.text(),
        }),
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'photo_unavailable' });
    expect(fixture.submit).not.toHaveBeenCalled();
  });
});
