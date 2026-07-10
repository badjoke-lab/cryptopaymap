import { describe, expect, it } from 'vitest';
import {
  consumeFixedWindowRateLimit,
  type FixedWindowRateLimitState,
} from '../src/submissions/durable-object-rate-limit-contract';
import {
  createDurableObjectSubmissionRateLimiter,
  type SubmissionRateLimitDurableObjectNamespace,
} from '../src/submissions/durable-object-rate-limit';

const requestId = '20000000-0000-4000-8000-000000000001';
const bucketKey = `rl_${'A'.repeat(43)}`;
const options = { limit: 2, windowMs: 10_000 };

describe('P5-02M Durable Object fixed-window contract', () => {
  it('allows until the configured limit, then denies with Retry-After seconds', () => {
    const first = consumeFixedWindowRateLimit(null, 1_000, options);
    expect(first).toEqual({
      state: { windowStartedAtMs: 1_000, requestCount: 1 },
      response: { outcome: 'allow', remaining: 1 },
    });

    const second = consumeFixedWindowRateLimit(first.state, 2_000, options);
    expect(second).toEqual({
      state: { windowStartedAtMs: 1_000, requestCount: 2 },
      response: { outcome: 'allow', remaining: 0 },
    });

    const denied = consumeFixedWindowRateLimit(second.state, 3_000, options);
    expect(denied).toEqual({
      state: second.state,
      response: { outcome: 'deny', retryAfterSeconds: 8 },
    });
  });

  it('resets after the fixed window expires', () => {
    const current: FixedWindowRateLimitState = {
      windowStartedAtMs: 1_000,
      requestCount: 2,
    };
    expect(consumeFixedWindowRateLimit(current, 11_000, options)).toEqual({
      state: { windowStartedAtMs: 11_000, requestCount: 1 },
      response: { outcome: 'allow', remaining: 1 },
    });
  });

  it('fails safe from stale or invalid persisted state by starting a fresh window', () => {
    expect(
      consumeFixedWindowRateLimit(
        { windowStartedAtMs: 5_000, requestCount: 2 },
        4_000,
        options,
      ),
    ).toEqual({
      state: { windowStartedAtMs: 4_000, requestCount: 1 },
      response: { outcome: 'allow', remaining: 1 },
    });
    expect(
      consumeFixedWindowRateLimit(
        { windowStartedAtMs: Number.NaN, requestCount: 0 },
        4_000,
        options,
      ),
    ).toEqual({
      state: { windowStartedAtMs: 4_000, requestCount: 1 },
      response: { outcome: 'allow', remaining: 1 },
    });
  });
});

interface FakeNamespaceOptions {
  response?: Response;
  error?: Error;
}

function fakeNamespace(options: FakeNamespaceOptions = {}) {
  const calls: { bucketName: string | null; request: Request | null } = {
    bucketName: null,
    request: null,
  };
  const namespace: SubmissionRateLimitDurableObjectNamespace = {
    idFromName(name) {
      calls.bucketName = name;
      return { name };
    },
    get() {
      return {
        async fetch(request) {
          calls.request = request;
          if (options.error) throw options.error;
          return (
            options.response ??
            new Response(JSON.stringify({ outcome: 'allow', remaining: 4 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        },
      };
    },
  };
  return { namespace, calls };
}

function rateLimitRequest() {
  return {
    requestId,
    bucketKey,
    receivedAt: new Date('2026-07-11T00:00:00.000Z'),
  };
}

describe('P5-02M Durable Object SubmissionRateLimiter adapter', () => {
  it('uses the opaque bucket key as Durable Object identity and maps allow decisions', async () => {
    const { namespace, calls } = fakeNamespace();
    const limiter = createDurableObjectSubmissionRateLimiter(namespace, {
      limit: 5,
      windowMs: 60_000,
    });

    await expect(limiter.consume(rateLimitRequest())).resolves.toEqual({
      outcome: 'allow',
      remaining: 4,
    });
    expect(calls.bucketName).toBe(bucketKey);
    expect(calls.request).not.toBeNull();
    await expect(calls.request?.json()).resolves.toEqual({ limit: 5, windowMs: 60_000 });
  });

  it('maps deny decisions without leaking provider detail', async () => {
    const { namespace } = fakeNamespace({
      response: new Response(JSON.stringify({ outcome: 'deny', retryAfterSeconds: 12 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });
    const limiter = createDurableObjectSubmissionRateLimiter(namespace, options);

    await expect(limiter.consume(rateLimitRequest())).resolves.toEqual({
      outcome: 'deny',
      retryAfterSeconds: 12,
    });
  });

  it.each([
    ['non-OK response', fakeNamespace({ response: new Response('unavailable', { status: 503 }) })],
    [
      'malformed response',
      fakeNamespace({
        response: new Response(JSON.stringify({ outcome: 'allow', remaining: -1 }), { status: 200 }),
      }),
    ],
    ['provider exception', fakeNamespace({ error: new Error('provider detail') })],
  ])('fails closed for %s', async (_name, fixture) => {
    const limiter = createDurableObjectSubmissionRateLimiter(fixture.namespace, options);
    await expect(limiter.consume(rateLimitRequest())).resolves.toEqual({
      outcome: 'unavailable',
      reasonCode: 'distributed_provider_unavailable',
    });
  });

  it('rejects invalid request identity before provider access', async () => {
    const { namespace, calls } = fakeNamespace();
    const limiter = createDurableObjectSubmissionRateLimiter(namespace, options);

    await expect(
      limiter.consume({
        requestId: 'not-a-uuid',
        bucketKey: '203.0.113.42',
        receivedAt: new Date(Number.NaN),
      }),
    ).resolves.toEqual({ outcome: 'unavailable', reasonCode: 'invalid_request' });
    expect(calls.bucketName).toBeNull();
  });
});
