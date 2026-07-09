export interface SubmissionRateLimitRequest {
  requestId: string;
  bucketKey: string;
  receivedAt: Date;
}

export type SubmissionRateLimitDecision =
  | {
      outcome: 'allow';
      remaining: number | null;
    }
  | {
      outcome: 'deny';
      retryAfterSeconds: number;
    }
  | {
      outcome: 'unavailable';
      reasonCode: string;
    };

export interface SubmissionRateLimiter {
  consume(request: SubmissionRateLimitRequest): Promise<SubmissionRateLimitDecision>;
}

export interface InMemorySubmissionRateLimiterOptions {
  limit: number;
  windowMs: number;
}

interface BucketState {
  windowStartedAt: number;
  count: number;
}

export function createInMemorySubmissionRateLimiter(
  options: InMemorySubmissionRateLimiterOptions,
): SubmissionRateLimiter {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error('Submission rate limit must be a positive integer.');
  }
  if (!Number.isInteger(options.windowMs) || options.windowMs < 1_000) {
    throw new Error('Submission rate-limit window must be at least 1000 ms.');
  }

  const buckets = new Map<string, BucketState>();

  return {
    async consume(request) {
      const now = request.receivedAt.getTime();
      if (!Number.isFinite(now)) {
        return { outcome: 'unavailable', reasonCode: 'invalid_time' };
      }
      const current = buckets.get(request.bucketKey);
      if (current === undefined || now - current.windowStartedAt >= options.windowMs) {
        buckets.set(request.bucketKey, { windowStartedAt: now, count: 1 });
        return { outcome: 'allow', remaining: options.limit - 1 };
      }

      if (current.count >= options.limit) {
        const retryAfterMs = Math.max(1, options.windowMs - (now - current.windowStartedAt));
        return {
          outcome: 'deny',
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
        };
      }

      current.count += 1;
      return { outcome: 'allow', remaining: options.limit - current.count };
    },
  };
}
