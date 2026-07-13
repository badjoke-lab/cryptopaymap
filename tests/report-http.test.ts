import { describe, expect, it, vi } from 'vitest';
import {
  SubmissionAbuseControlError,
  type AbuseControlledSubmissionIntakeService,
} from '../src/submissions/abuse-controlled-intake';
import { SubmissionIntakeError } from '../src/submissions/intake-service';
import type { SubmissionRateLimitBucketDeriver } from '../src/submissions/rate-limit-bucket-environment';
import {
  createReportHttpHandler,
  reportHttpMaximumBodyBytes,
  type ReportHttpPagesContext,
  type ReportHttpRuntime,
} from '../src/submissions/report-http';

const requestId = '20000000-0000-4000-8000-000000000001';
const targetId = '10000000-0000-4000-8000-000000000001';
const opaqueBucket = `rl_${'A'.repeat(43)}`;

function validReportSubmission() {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType: 'payment_report',
    targetType: 'entity',
    targetId,
    relationship: null,
    contact: null,
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'payment-report-v1',
      result: 'successful',
      paymentDate: '2026-07-13',
      payment: {
        assetSlug: 'btc',
        networkSlug: 'bitcoin',
        routeType: 'direct_wallet',
        paymentMethod: 'onchain',
        processor: null,
        context: 'qr_code',
        observedSteps: 'The payment was confirmed at the counter.',
      },
      privateTransactionUrl: null,
      notes: null,
    },
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

function request(
  body: unknown = { challengeToken: 'turnstile-token', submission: validReportSubmission() },
) {
  return new Request('https://example.test/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': requestId,
      'CF-Connecting-IP': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

function pagesContext(inputRequest: Request): ReportHttpPagesContext<Record<string, unknown>> {
  return {
    request: inputRequest,
    env: {},
    params: {},
    data: {},
    waitUntil() {},
  };
}

function runtimeFixture(submitError?: Error) {
  const deriveBucketKey = vi.fn(async () => opaqueBucket);
  const submit = vi.fn(async () => {
    if (submitError) throw submitError;
    return {
      state: 'committed' as const,
      publicId: 'CPM-S-2026-000123',
      statusSecret: 'cpmss_example-secret',
      submittedAt: '2026-07-13T00:00:00.000Z',
    };
  });
  const runtime: ReportHttpRuntime = {
    bucketDeriver: { deriveBucketKey } satisfies SubmissionRateLimitBucketDeriver,
    intake: { submit } satisfies AbuseControlledSubmissionIntakeService,
  };
  return { runtime, deriveBucketKey, submit };
}

function handlerFor(submitError?: Error) {
  const fixture = runtimeFixture(submitError);
  const runtimeFromEnvironment = vi.fn(() => fixture.runtime);
  const handler = createReportHttpHandler({
    runtimeFromEnvironment,
    now: () => new Date('2026-07-13T00:00:00.000Z'),
  });
  return { handler, runtimeFromEnvironment, ...fixture };
}

describe('P5-03H public report HTTP boundary', () => {
  it('returns a safe private receipt and passes only ephemeral edge identity plus opaque bucket', async () => {
    const fixture = handlerFor();
    const response = await fixture.handler(pagesContext(request()));

    expect(response.status).toBe(202);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({
      submissionReference: 'CPM-S-2026-000123',
      statusSecret: 'cpmss_example-secret',
      submittedAt: '2026-07-13T00:00:00.000Z',
    });
    expect(responseText).not.toContain('203.0.113.10');
    expect(fixture.deriveBucketKey).toHaveBeenCalledWith('203.0.113.10');
    expect(fixture.submit).toHaveBeenCalledWith({
      requestId,
      challengeToken: 'turnstile-token',
      rateLimitKey: opaqueBucket,
      remoteIp: '203.0.113.10',
      rawInput: expect.objectContaining({ submissionType: 'payment_report' }),
      receivedAt: new Date('2026-07-13T00:00:00.000Z'),
    });
  });

  it('maps rate-limit and idempotency failures to bounded public errors', async () => {
    const limited = await handlerFor(
      new SubmissionAbuseControlError('rate_limited', 'internal detail', 12),
    ).handler(pagesContext(request()));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('12');
    await expect(limited.json()).resolves.toEqual({ error: 'report_rate_limited' });

    const conflict = await handlerFor(
      new SubmissionIntakeError('idempotency_conflict', 'internal detail'),
    ).handler(pagesContext(request()));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({ error: 'report_request_conflict' });
  });

  it('rejects unsupported media type before runtime composition', async () => {
    const fixture = handlerFor();
    const input = request();
    const headers = new Headers(input.headers);
    headers.set('Content-Type', 'text/plain');
    const response = await fixture.handler(
      pagesContext(new Request(input.url, { method: 'POST', headers, body: 'not json' })),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: 'report_media_type_unsupported' });
    expect(fixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('rejects malformed idempotency and report envelopes before runtime composition', async () => {
    const fixture = handlerFor();
    const invalidKey = request();
    const headers = new Headers(invalidKey.headers);
    headers.set('Idempotency-Key', 'not-a-uuid');
    const invalidKeyResponse = await fixture.handler(
      pagesContext(
        new Request(invalidKey.url, {
          method: 'POST',
          headers,
          body: await invalidKey.text(),
        }),
      ),
    );
    expect(invalidKeyResponse.status).toBe(400);

    const invalidBodyResponse = await fixture.handler(
      pagesContext(request({ challengeToken: 'turnstile-token', submission: { not: 'report' } })),
    );
    expect(invalidBodyResponse.status).toBe(400);
    expect(fixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('rejects bodies over the route limit before runtime composition', async () => {
    const fixture = handlerFor();
    const response = await fixture.handler(
      pagesContext(
        new Request('https://example.test/api/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestId,
            'CF-Connecting-IP': '203.0.113.10',
          },
          body: 'x'.repeat(reportHttpMaximumBodyBytes + 1),
        }),
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'report_request_too_large' });
    expect(fixture.runtimeFromEnvironment).not.toHaveBeenCalled();
  });

  it('fails closed without trusted Cloudflare edge identity', async () => {
    const fixture = handlerFor();
    const input = request();
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
    await expect(response.json()).resolves.toEqual({ error: 'report_unavailable' });
    expect(fixture.submit).not.toHaveBeenCalled();
  });
});
