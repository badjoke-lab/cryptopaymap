import { z } from 'zod';
import type { SubmissionChallengeVerifier } from './challenge-verification';
import type {
  SubmissionPrivateIntakeReceipt,
  SubmissionPrivateIntakeService,
} from './intake-service';
import type { SubmissionRateLimiter } from './rate-limit';

const requestSchema = z
  .object({
    requestId: z.uuid(),
    challengeToken: z.string().min(1).max(2_048),
    rateLimitKey: z.string().regex(/^rl_[A-Za-z0-9_-]{16,128}$/),
    remoteIp: z.string().min(1).max(64).nullable(),
    rawInput: z.unknown(),
    receivedAt: z.date(),
  })
  .strict();

export class SubmissionAbuseControlError extends Error {
  constructor(
    readonly code:
      | 'abuse_request_invalid'
      | 'rate_limited'
      | 'rate_limit_unavailable'
      | 'challenge_rejected'
      | 'challenge_unavailable',
    message: string,
    readonly retryAfterSeconds: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionAbuseControlError';
  }
}

export interface AbuseControlledSubmissionIntakeRequest {
  requestId: string;
  challengeToken: string;
  rateLimitKey: string;
  remoteIp: string | null;
  rawInput: unknown;
  receivedAt?: Date;
}

export interface AbuseControlledSubmissionIntakeService {
  submit(request: AbuseControlledSubmissionIntakeRequest): Promise<SubmissionPrivateIntakeReceipt>;
}

export interface AbuseControlledSubmissionIntakeDependencies {
  rateLimiter: SubmissionRateLimiter;
  challengeVerifier: SubmissionChallengeVerifier;
  intake: SubmissionPrivateIntakeService;
}

export function createAbuseControlledSubmissionIntakeService(
  dependencies: AbuseControlledSubmissionIntakeDependencies,
): AbuseControlledSubmissionIntakeService {
  return {
    async submit(rawRequest) {
      const receivedAt = rawRequest.receivedAt ?? new Date();
      const parsed = requestSchema.safeParse({ ...rawRequest, receivedAt });
      if (!parsed.success || Number.isNaN(parsed.data.receivedAt.getTime())) {
        throw new SubmissionAbuseControlError(
          'abuse_request_invalid',
          'Submission abuse-control request failed validation.',
        );
      }

      const rateLimit = await dependencies.rateLimiter.consume({
        requestId: parsed.data.requestId,
        bucketKey: parsed.data.rateLimitKey,
        receivedAt: parsed.data.receivedAt,
      });
      if (rateLimit.outcome === 'deny') {
        throw new SubmissionAbuseControlError(
          'rate_limited',
          'Submission intake rate limit was exceeded.',
          rateLimit.retryAfterSeconds,
        );
      }
      if (rateLimit.outcome === 'unavailable') {
        throw new SubmissionAbuseControlError(
          'rate_limit_unavailable',
          'Submission rate-limit decision is unavailable.',
        );
      }

      const challenge = await dependencies.challengeVerifier.verify({
        requestId: parsed.data.requestId,
        token: parsed.data.challengeToken,
        remoteIp: parsed.data.remoteIp,
      });
      if (challenge.outcome === 'deny') {
        throw new SubmissionAbuseControlError(
          'challenge_rejected',
          'Submission challenge verification was rejected.',
        );
      }
      if (challenge.outcome === 'unavailable') {
        throw new SubmissionAbuseControlError(
          'challenge_unavailable',
          'Submission challenge verification is unavailable.',
        );
      }

      return dependencies.intake.submit(
        parsed.data.requestId,
        parsed.data.rawInput,
        parsed.data.receivedAt,
      );
    },
  };
}
