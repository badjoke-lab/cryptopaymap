import { z } from 'zod';
import type {
  SubmissionChallengeVerificationDecision,
  SubmissionChallengeVerifier,
} from './challenge-verification';

const defaultEndpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const siteverifyResponseSchema = z
  .object({
    success: z.boolean(),
    challenge_ts: z.string().optional(),
    hostname: z.string().optional(),
    'error-codes': z.array(z.string()).optional(),
    action: z.string().optional(),
    cdata: z.string().optional(),
  })
  .passthrough();

const verificationRequestSchema = z
  .object({
    requestId: z.uuid(),
    token: z.string().min(1).max(2_048),
    remoteIp: z.string().min(1).max(64).nullable(),
  })
  .strict();

export interface TurnstileSiteverifyOptions {
  secretKey: string;
  expectedHostname: string;
  expectedAction: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function unavailable(reasonCode: string): SubmissionChallengeVerificationDecision {
  return { outcome: 'unavailable', reasonCode };
}

export function createTurnstileSiteverifyVerifier(
  options: TurnstileSiteverifyOptions,
): SubmissionChallengeVerifier {
  if (options.secretKey.trim().length === 0) {
    throw new Error('Turnstile secret key must not be empty.');
  }
  if (options.expectedHostname.trim().length === 0) {
    throw new Error('Turnstile expected hostname must not be empty.');
  }
  if (options.expectedAction.trim().length === 0) {
    throw new Error('Turnstile expected action must not be empty.');
  }

  const endpoint = z.url().parse(options.endpoint ?? defaultEndpoint);
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000) {
    throw new Error('Turnstile timeout must be an integer between 500 and 30000 ms.');
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async verify(rawRequest) {
      const request = verificationRequestSchema.safeParse(rawRequest);
      if (!request.success) {
        return { outcome: 'deny', reasonCode: 'challenge_request_invalid' };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body: Record<string, string> = {
          secret: options.secretKey,
          response: request.data.token,
          idempotency_key: request.data.requestId,
        };
        if (request.data.remoteIp !== null) body.remoteip = request.data.remoteIp;

        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) return unavailable('challenge_http_error');

        let parsedJson: unknown;
        try {
          parsedJson = await response.json();
        } catch {
          return unavailable('challenge_response_invalid_json');
        }
        const parsed = siteverifyResponseSchema.safeParse(parsedJson);
        if (!parsed.success) return unavailable('challenge_response_invalid_shape');

        if (!parsed.data.success) {
          const errorCodes = parsed.data['error-codes'] ?? [];
          if (errorCodes.includes('internal-error')) {
            return unavailable('challenge_provider_internal_error');
          }
          return { outcome: 'deny', reasonCode: 'challenge_failed' };
        }

        if (parsed.data.hostname !== options.expectedHostname) {
          return { outcome: 'deny', reasonCode: 'challenge_hostname_mismatch' };
        }
        if (parsed.data.action !== options.expectedAction) {
          return { outcome: 'deny', reasonCode: 'challenge_action_mismatch' };
        }

        return { outcome: 'allow', reasonCode: 'challenge_verified' };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return unavailable('challenge_timeout');
        }
        return unavailable('challenge_network_error');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
