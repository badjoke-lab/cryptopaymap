import { z } from 'zod';
import {
  durableObjectRateLimitOptionsSchema,
  durableObjectRateLimitResponseSchema,
  type DurableObjectRateLimitOptions,
} from './durable-object-rate-limit-contract';
import type { SubmissionRateLimiter } from './rate-limit';

const requestIdSchema = z.uuid();
const bucketKeySchema = z.string().regex(/^rl_[A-Za-z0-9_-]{16,128}$/);

export type SubmissionRateLimitDurableObjectId = object;

export interface SubmissionRateLimitDurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface SubmissionRateLimitDurableObjectNamespace {
  idFromName(name: string): SubmissionRateLimitDurableObjectId;
  get(id: SubmissionRateLimitDurableObjectId): SubmissionRateLimitDurableObjectStub;
}

export function createDurableObjectSubmissionRateLimiter(
  namespace: SubmissionRateLimitDurableObjectNamespace,
  options: DurableObjectRateLimitOptions,
): SubmissionRateLimiter {
  const parsedOptions = durableObjectRateLimitOptionsSchema.parse(options);

  return {
    async consume(request) {
      if (
        !requestIdSchema.safeParse(request.requestId).success ||
        !bucketKeySchema.safeParse(request.bucketKey).success ||
        !(request.receivedAt instanceof Date) ||
        Number.isNaN(request.receivedAt.getTime())
      ) {
        return { outcome: 'unavailable', reasonCode: 'invalid_request' };
      }

      try {
        const id = namespace.idFromName(request.bucketKey);
        const stub = namespace.get(id);
        const response = await stub.fetch(
          new Request('https://submission-rate-limit.internal/consume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(parsedOptions),
          }),
        );
        if (!response.ok) {
          return { outcome: 'unavailable', reasonCode: 'distributed_provider_unavailable' };
        }

        const parsedDecision = durableObjectRateLimitResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsedDecision.success) {
          return { outcome: 'unavailable', reasonCode: 'distributed_provider_unavailable' };
        }
        return parsedDecision.data;
      } catch {
        return { outcome: 'unavailable', reasonCode: 'distributed_provider_unavailable' };
      }
    },
  };
}
