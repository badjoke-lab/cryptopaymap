import {
  consumeFixedWindowRateLimit,
  durableObjectRateLimitResponseSchema,
} from '../src/submissions/durable-object-rate-limit-contract';
import {
  createDurableObjectSubmissionRateLimiter,
  type SubmissionRateLimitDurableObjectNamespace,
} from '../src/submissions/durable-object-rate-limit';

const first = consumeFixedWindowRateLimit(null, 1_000, { limit: 2, windowMs: 10_000 });
const second = consumeFixedWindowRateLimit(first.state, 2_000, {
  limit: 2,
  windowMs: 10_000,
});
const denied = consumeFixedWindowRateLimit(second.state, 3_000, {
  limit: 2,
  windowMs: 10_000,
});

if (
  first.response.outcome !== 'allow' ||
  second.response.outcome !== 'allow' ||
  denied.response.outcome !== 'deny'
) {
  throw new Error('Submission Durable Object fixed-window contract failed.');
}

durableObjectRateLimitResponseSchema.parse(denied.response);

const bucketKey = `rl_${'A'.repeat(43)}`;
const namespace: SubmissionRateLimitDurableObjectNamespace = {
  idFromName(name) {
    return { name };
  },
  get() {
    return {
      async fetch() {
        return new Response(JSON.stringify({ outcome: 'allow', remaining: 4 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    };
  },
};
const limiter = createDurableObjectSubmissionRateLimiter(namespace, {
  limit: 5,
  windowMs: 60_000,
});
const decision = await limiter.consume({
  requestId: '20000000-0000-4000-8000-000000000001',
  bucketKey,
  receivedAt: new Date('2026-07-11T00:00:00.000Z'),
});

if (decision.outcome !== 'allow' || decision.remaining !== 4) {
  throw new Error('Submission Durable Object rate-limit adapter contract failed.');
}

console.log('Submission Durable Object rate-limit checks passed.');
