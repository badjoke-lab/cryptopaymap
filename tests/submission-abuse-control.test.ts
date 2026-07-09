import { describe, expect, it, vi } from 'vitest';
import {
  createAbuseControlledSubmissionIntakeService,
  SubmissionAbuseControlError,
} from '../src/submissions/abuse-controlled-intake';
import type { SubmissionChallengeVerifier } from '../src/submissions/challenge-verification';
import type { SubmissionPrivateIntakeService } from '../src/submissions/intake-service';
import {
  createInMemorySubmissionRateLimiter,
  type SubmissionRateLimiter,
} from '../src/submissions/rate-limit';
import { createTurnstileSiteverifyVerifier } from '../src/submissions/turnstile-siteverify';

const requestId = '20000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-09T12:00:00.000Z');
const rateLimitKey = 'rl_abcdefghijklmnop';

function request() {
  return {
    requestId,
    challengeToken: 'turnstile-token',
    rateLimitKey,
    remoteIp: '203.0.113.10',
    rawInput: { submissionType: 'suggest' },
    receivedAt,
  };
}

function receipt() {
  return {
    state: 'committed' as const,
    publicId: 'CPM-S-2026-000001',
    statusSecret: `cpmss_${'A'.repeat(43)}`,
    submittedAt: receivedAt.toISOString(),
  };
}

function allowRateLimiter(events?: string[]): SubmissionRateLimiter {
  return {
    async consume() {
      events?.push('rate-limit');
      return { outcome: 'allow', remaining: 4 };
    },
  };
}

function allowChallenge(events?: string[]): SubmissionChallengeVerifier {
  return {
    async verify() {
      events?.push('challenge');
      return { outcome: 'allow', reasonCode: 'challenge_verified' };
    },
  };
}

function intakeService(events?: string[]): SubmissionPrivateIntakeService {
  return {
    async submit() {
      events?.push('intake');
      return receipt();
    },
  };
}

describe('P5-01D abuse-controlled submission intake', () => {
  it('runs rate limit, challenge verification, and private intake in that order', async () => {
    const events: string[] = [];
    const service = createAbuseControlledSubmissionIntakeService({
      rateLimiter: allowRateLimiter(events),
      challengeVerifier: allowChallenge(events),
      intake: intakeService(events),
    });

    await expect(service.submit(request())).resolves.toEqual(receipt());
    expect(events).toEqual(['rate-limit', 'challenge', 'intake']);
  });

  it('stops before challenge validation and intake when rate limited', async () => {
    const challenge = vi.fn(async () => ({
      outcome: 'allow' as const,
      reasonCode: 'challenge_verified',
    }));
    const submit = vi.fn(async () => receipt());
    const service = createAbuseControlledSubmissionIntakeService({
      rateLimiter: {
        async consume() {
          return { outcome: 'deny', retryAfterSeconds: 42 };
        },
      },
      challengeVerifier: { verify: challenge },
      intake: { submit },
    });

    const error = await service.submit(request()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SubmissionAbuseControlError);
    expect(error).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 42 });
    expect(challenge).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('fails closed when rate-limit decision is unavailable', async () => {
    const challenge = vi.fn();
    const submit = vi.fn();
    const service = createAbuseControlledSubmissionIntakeService({
      rateLimiter: {
        async consume() {
          return { outcome: 'unavailable', reasonCode: 'provider_down' };
        },
      },
      challengeVerifier: { verify: challenge },
      intake: { submit },
    });

    await expect(service.submit(request())).rejects.toMatchObject({
      code: 'rate_limit_unavailable',
    });
    expect(challenge).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects challenge deny and unavailable decisions before private intake', async () => {
    for (const decision of [
      { outcome: 'deny' as const, reasonCode: 'challenge_failed' },
      { outcome: 'unavailable' as const, reasonCode: 'challenge_network_error' },
    ]) {
      const submit = vi.fn();
      const service = createAbuseControlledSubmissionIntakeService({
        rateLimiter: allowRateLimiter(),
        challengeVerifier: {
          async verify() {
            return decision;
          },
        },
        intake: { submit },
      });

      await expect(service.submit(request())).rejects.toMatchObject({
        code: decision.outcome === 'deny' ? 'challenge_rejected' : 'challenge_unavailable',
      });
      expect(submit).not.toHaveBeenCalled();
    }
  });

  it('rejects non-opaque rate-limit keys before providers are called', async () => {
    const consume = vi.fn();
    const verify = vi.fn();
    const submit = vi.fn();
    const service = createAbuseControlledSubmissionIntakeService({
      rateLimiter: { consume },
      challengeVerifier: { verify },
      intake: { submit },
    });

    await expect(
      service.submit({ ...request(), rateLimitKey: '203.0.113.10' }),
    ).rejects.toMatchObject({ code: 'abuse_request_invalid' });
    expect(consume).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('enforces the in-memory fixed-window rate limit and resets after the window', async () => {
    const limiter = createInMemorySubmissionRateLimiter({ limit: 2, windowMs: 60_000 });

    await expect(
      limiter.consume({ requestId, bucketKey: rateLimitKey, receivedAt }),
    ).resolves.toEqual({ outcome: 'allow', remaining: 1 });
    await expect(
      limiter.consume({ requestId, bucketKey: rateLimitKey, receivedAt }),
    ).resolves.toEqual({ outcome: 'allow', remaining: 0 });
    await expect(
      limiter.consume({ requestId, bucketKey: rateLimitKey, receivedAt }),
    ).resolves.toMatchObject({ outcome: 'deny', retryAfterSeconds: 60 });
    await expect(
      limiter.consume({
        requestId,
        bucketKey: rateLimitKey,
        receivedAt: new Date(receivedAt.getTime() + 60_000),
      }),
    ).resolves.toEqual({ outcome: 'allow', remaining: 1 });
  });
});

describe('Cloudflare Turnstile Siteverify adapter', () => {
  it('sends server validation with request UUID idempotency key and normalizes success', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        secret: 'server-secret',
        response: 'turnstile-token',
        idempotency_key: requestId,
        remoteip: '203.0.113.10',
      });
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      return new Response(
        JSON.stringify({
          success: true,
          hostname: 'review.example.test',
          action: 'submission_intake',
          'error-codes': [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const verifier = createTurnstileSiteverifyVerifier({
      secretKey: 'server-secret',
      expectedHostname: 'review.example.test',
      expectedAction: 'submission_intake',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      verifier.verify({ requestId, token: 'turnstile-token', remoteIp: '203.0.113.10' }),
    ).resolves.toEqual({ outcome: 'allow', reasonCode: 'challenge_verified' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('denies successful provider responses with hostname or action mismatch', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          success: true,
          hostname: 'wrong.example.test',
          action: 'wrong_action',
        }),
        { status: 200 },
      );
    const verifier = createTurnstileSiteverifyVerifier({
      secretKey: 'server-secret',
      expectedHostname: 'review.example.test',
      expectedAction: 'submission_intake',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      verifier.verify({ requestId, token: 'turnstile-token', remoteIp: null }),
    ).resolves.toEqual({ outcome: 'deny', reasonCode: 'challenge_hostname_mismatch' });
  });

  it('classifies provider internal error and network failure as unavailable', async () => {
    const internalErrorVerifier = createTurnstileSiteverifyVerifier({
      secretKey: 'server-secret',
      expectedHostname: 'review.example.test',
      expectedAction: 'submission_intake',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ success: false, 'error-codes': ['internal-error'] }), {
          status: 200,
        })) as typeof fetch,
    });
    await expect(
      internalErrorVerifier.verify({ requestId, token: 'turnstile-token', remoteIp: null }),
    ).resolves.toEqual({
      outcome: 'unavailable',
      reasonCode: 'challenge_provider_internal_error',
    });

    const networkVerifier = createTurnstileSiteverifyVerifier({
      secretKey: 'server-secret',
      expectedHostname: 'review.example.test',
      expectedAction: 'submission_intake',
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as typeof fetch,
    });
    await expect(
      networkVerifier.verify({ requestId, token: 'turnstile-token', remoteIp: null }),
    ).resolves.toEqual({ outcome: 'unavailable', reasonCode: 'challenge_network_error' });
  });

  it('rejects oversized tokens before calling Siteverify', async () => {
    const fetchImpl = vi.fn();
    const verifier = createTurnstileSiteverifyVerifier({
      secretKey: 'server-secret',
      expectedHostname: 'review.example.test',
      expectedAction: 'submission_intake',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      verifier.verify({ requestId, token: 'x'.repeat(2_049), remoteIp: null }),
    ).resolves.toEqual({ outcome: 'deny', reasonCode: 'challenge_request_invalid' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
