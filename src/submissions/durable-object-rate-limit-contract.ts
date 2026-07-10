import { z } from 'zod';

export const durableObjectRateLimitOptionsSchema = z
  .object({
    limit: z.int().min(1).max(10_000),
    windowMs: z.int().min(1_000).max(86_400_000),
  })
  .strict();

export const durableObjectRateLimitResponseSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('allow'), remaining: z.int().min(0) }).strict(),
  z.object({ outcome: z.literal('deny'), retryAfterSeconds: z.int().min(1) }).strict(),
]);

export type DurableObjectRateLimitOptions = z.infer<typeof durableObjectRateLimitOptionsSchema>;
export type DurableObjectRateLimitResponse = z.infer<typeof durableObjectRateLimitResponseSchema>;

export interface FixedWindowRateLimitState {
  windowStartedAtMs: number;
  requestCount: number;
}

export interface FixedWindowRateLimitTransition {
  state: FixedWindowRateLimitState;
  response: DurableObjectRateLimitResponse;
}

export function consumeFixedWindowRateLimit(
  current: FixedWindowRateLimitState | null,
  nowMs: number,
  options: DurableObjectRateLimitOptions,
): FixedWindowRateLimitTransition {
  const parsedOptions = durableObjectRateLimitOptionsSchema.parse(options);
  if (!Number.isFinite(nowMs)) throw new Error('Rate-limit clock is invalid.');

  if (current === null) {
    return {
      state: { windowStartedAtMs: nowMs, requestCount: 1 },
      response: { outcome: 'allow', remaining: parsedOptions.limit - 1 },
    };
  }

  if (
    !Number.isFinite(current.windowStartedAtMs) ||
    !Number.isInteger(current.requestCount) ||
    current.requestCount < 1 ||
    nowMs < current.windowStartedAtMs
  ) {
    throw new Error('Rate-limit state is invalid.');
  }

  if (nowMs - current.windowStartedAtMs >= parsedOptions.windowMs) {
    return {
      state: { windowStartedAtMs: nowMs, requestCount: 1 },
      response: { outcome: 'allow', remaining: parsedOptions.limit - 1 },
    };
  }

  if (current.requestCount >= parsedOptions.limit) {
    const retryAfterMs = Math.max(
      1,
      parsedOptions.windowMs - (nowMs - current.windowStartedAtMs),
    );
    return {
      state: current,
      response: {
        outcome: 'deny',
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
      },
    };
  }

  const requestCount = current.requestCount + 1;
  return {
    state: { windowStartedAtMs: current.windowStartedAtMs, requestCount },
    response: { outcome: 'allow', remaining: parsedOptions.limit - requestCount },
  };
}
