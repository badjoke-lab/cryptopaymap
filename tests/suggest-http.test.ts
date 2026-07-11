import { describe, expect, it, vi } from 'vitest';
import {
  SubmissionAbuseControlError,
  type AbuseControlledSubmissionIntakeService,
} from '../src/submissions/abuse-controlled-intake';
import { SubmissionIntakeError } from '../src/submissions/intake-service';
import type { SubmissionRateLimitBucketDeriver } from '../src/submissions/rate-limit-bucket-environment';
import {
  createSuggestHttpHandler,
  suggestHttpMaximumBodyBytes,
  type SuggestHttpPagesContext,
  type SuggestHttpRuntime,
} from '../src/submissions/suggest-http';

const requestId = '20000000-0000-4000-8000-000000000001';
const opaqueBucket = `rl_${'A'.repeat(43)}`;

function validSuggestSubmission() {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType: 'suggest',
    targetType: null,
    targetId: null,
    relationship: 'customer',
    contact: null,
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'suggest-v1',
      suggestionKind: 'online_service',
      entity: {
        name: 'Example Hosting',
        legalName: null,
        websiteUrl: 'https://hosting.example/',
        countryCode: 'jp',
      },
      place: null,
      categories: [],
      paymentProposals: [
        {
          assetSlug: 'btc',
          networkSlug: 'bitcoin',
          routeType: 'direct_wallet',
          paymentMethod: 'onchain',
          processor: null,
          contractAddress: null,
          howToPay: 'Choose Bitcoin at checkout and pay the displayed invoice.',
          restrictions: null,
          isPrimary: true,
        },
      ],
      observedAt: '2026-07-10',
    },
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

function request(
  body: unknown = { challengeToken: 'turnstile-token', submission: validSuggestSubmission() },
) {
  return new Request('https://example.test/api/suggest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': requestId,
      'CF-Connecting-IP': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

function pagesContext(inputRequest: Request): SuggestHttpPagesContext<Record<string, unknown>> {
  return {
    request: inputRequest,
    env: {},
    params: {},
    data: {},
    waitUntil() {},
  };
}

interface RuntimeFixtureOptions {
  submitError?: Error;
  deriveError?: Error;
}

function runtimeFixture(options: RuntimeFixtureOptions = {}) {
  const deriveBucketKey = vi.fn(async (_edgeIdentity: string) => {
    if (options.deriveError) throw options.deriveError;
    return opaqueBucket;
  });
  const submit = vi.fn(async () => {
    if (options.submitError) throw options.submitError;
    return {
      state: 'committed' as const,
      publicId: 'CPM-S-2026-000123',
      statusSecret: 'cpmss_example-secret',
      submittedAt: '2026-07-11T00:00:00.000Z',
    };
  });
  const runtime: SuggestHttpRuntime = {
    bucketDeriver: { deriveBucketKey } satisfies SubmissionRateLimitBucketDeriver,
    intake: { submit } satisfies AbuseControlledSubmissionIntakeService,
  };
  return { runtime, deriveBucketKey, submit };
}

function handlerFor(fixture = runtimeFixture()) {
  const runtimeFromEnvironment = vi.fn(() => fixture.runtime);
  const handler = createSuggestHttpHandler({
    runtimeFromEnvironment,
    now: () => new Date('2026-07-11T00:00:00.000Z'),
  });
  return { handler, runtimeFromEnvironment, ...fixture };
}

describe('P5-02O public Suggest HTTP boundary', () => {
  it('returns one safe receipt and passes only ephemeral edge identity plus opaque bucket to intake', async () => {
    const fixture = handlerFor();
    const response = await fixture.handler(pagesContext(request()));

    expect(response.status).toBe(202);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({
      submissionReference: 'CPM-S-2026-000123',
      statusSecret: 'cpmss_example-secret',
      submittedAt: '2026-07-11T00:00:00.000Z',
    });
    expect(responseText).not.toContain('203.0.113.10');
    expect(fixture.deriveBucketKey).toHaveBeenCalledWith('203.0.113.10');
    expect(fixture.submit).toHaveBeenCalledWith({
      requestId,
      challengeToken: 'turnstile-token',
      rateLimitKey: opaqueBucket,
      remoteIp: '203.0.113.10',
      rawInput: expect.objectContaining({ submissionType: 'suggest' }),
      receivedAt: new Date('2026-07-11T00:00:00.000Z'),
    });
  });

  it('returns 429 with bounded Retry-After for rate-limit denial', async () => {
    const fixture = handlerFor(
      runtimeFixture({
        submitError: new SubmissionAbuseControlError(
          'rate_limited',
          'internal rate-limit detail',
          12,
        ),
      }),
    );
    const response = await fixture.handler(pagesContext(request()));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    await expect(response.json()).resolves.toEqual({ error: 'suggest_rate_limited' });
  });

  it.each([
    [
      'challenge rejection',
      new SubmissionAbuseControlError('challenge_rejected', 'provider detail'),
      400,
      'suggest_request_invalid',
    ],
    [
      'invalid intake',
      new SubmissionIntakeError('invalid_request', 'schema detail'),
      400,
      'suggest_request_invalid',
    ],
    [
      'idempotency conflict',
      new SubmissionIntakeError('idempotency_conflict', 'fingerprint detail'),
      409,
      'suggest_request_conflict',
    ],
    [
      'rate-limit provider unavailable',
      new SubmissionAbuseControlError('rate_limit_unavailable', 'provider detail'),
      503,
      'suggest_unavailable',
    ],
    [
      'challenge provider unavailable',
      new SubmissionAbuseControlError('challenge_unavailable', 'provider detail'),
      503,
      'suggest_unavailable',
    ],
    [
      'contact protection failure',
      new SubmissionIntakeError('contact_protection_failed', 'secret detail'),
      503,
      'suggest_unavailable',
    ],
    ['unknown failure', new Error('database detail'), 503, 'suggest_unavailable'],
  ])('maps %s to a bounded public response', async (_name, error, status, publicError) => {
    const fixture = handlerFor(runtimeFixture({ submitError: error }));
    const response = await fixture.handler(pagesContext(request()));

    expect(response.status).toBe(status);
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({ error: publicError });
    expect(responseText).not.toContain(error.message);
  });

  it('rejects unsupported media type before environment composition', async () => {
    const fixture = handlerFor();
    const input = request();
    const headers = new Headers(input.headers);
    headers.set('Content-Type', 'text/plain');
    const unsupported = new Request(input.url, {
      method: 'POST',
      headers,
      body: 'not json',
    });
    const response = await fixture.handler(pagesContext(unsupported));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: 'suggest_media_type_unsupported' });
    expect(fixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('rejects malformed UUID idempotency keys before environment composition', async () => {
    const fixture = handlerFor();
    const input = request();
    const headers = new Headers(input.headers);
    headers.set('Idempotency-Key', 'not-a-uuid');
    const invalid = new Request(input.url, {
      method: 'POST',
      headers,
      body: await input.text(),
    });
    const response = await fixture.handler(pagesContext(invalid));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'suggest_request_invalid' });
    expect(fixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('rejects malformed Suggest envelopes before environment composition', async () => {
    const fixture = handlerFor();
    const response = await fixture.handler(
      pagesContext(request({ challengeToken: 'turnstile-token', submission: { not: 'suggest' } })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'suggest_request_invalid' });
    expect(fixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('rejects bodies above the route byte limit without environment composition', async () => {
    const fixture = handlerFor();
    const oversized = new Request('https://example.test/api/suggest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': requestId,
        'CF-Connecting-IP': '203.0.113.10',
      },
      body: 'x'.repeat(suggestHttpMaximumBodyBytes + 1),
    });
    const response = await fixture.handler(pagesContext(oversized));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'suggest_request_too_large' });
    expect(fixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('fails closed when trusted Cloudflare edge identity is unavailable', async () => {
    const fixture = handlerFor();
    const input = request();
    const headers = new Headers(input.headers);
    headers.delete('CF-Connecting-IP');
    const missingEdgeIdentity = new Request(input.url, {
      method: 'POST',
      headers,
      body: await input.text(),
    });
    const response = await fixture.handler(pagesContext(missingEdgeIdentity));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'suggest_unavailable' });
    expect(fixture.deriveBucketKey).not.toHaveBeenCalled();
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it('fails closed when opaque bucket derivation fails', async () => {
    const fixture = handlerFor(runtimeFixture({ deriveError: new Error('key detail') }));
    const response = await fixture.handler(pagesContext(request()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'suggest_unavailable' });
    expect(fixture.submit).not.toHaveBeenCalled();
  });
});
