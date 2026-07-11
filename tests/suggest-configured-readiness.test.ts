import { describe, expect, it, vi } from 'vitest';
import {
  SuggestConfiguredReadinessError,
  verifySuggestConfiguredReadiness,
} from '../src/submissions/suggest-configured-readiness';

function namespaceWithResponse(response: Response) {
  return {
    idFromName(name: string) {
      return { name };
    },
    get() {
      return {
        async fetch(request: Request) {
          expect(request.method).toBe('GET');
          expect(new URL(request.url).pathname).toBe('/health');
          return response.clone();
        },
      };
    },
  };
}

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:pass@example.test/cryptopaymap',
  CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM',
  CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
  CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID: 'contact-v1',
  CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
  CPM_SUBMISSION_CONTACT_RETENTION_DAYS: '180',
  CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL:
    'BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ',
  CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS: '5',
  CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: '600',
  CPM_TURNSTILE_SECRET_KEY: 'server-secret',
  PUBLIC_TURNSTILE_SITE_KEY: 'public-site-key',
  CPM_TURNSTILE_EXPECTED_HOSTNAME: 'review.example.test',
  CPM_TURNSTILE_EXPECTED_ACTION: 'submission_intake',
  CPM_SUGGEST_READINESS_TOKEN: 'R'.repeat(48),
  SUBMISSION_RATE_LIMIT_BUCKETS: namespaceWithResponse(
    new Response(JSON.stringify({ status: 'ready' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
};

describe('P5-02Q configured Suggest readiness', () => {
  it('checks complete runtime composition, database connectivity, and DO worker health', async () => {
    const probeDatabase = vi.fn(async () => {});

    await expect(
      verifySuggestConfiguredReadiness(validEnvironment, { probeDatabase }),
    ).resolves.toBeUndefined();
    expect(probeDatabase).toHaveBeenCalledWith(validEnvironment.DATABASE_URL);
  });

  it('fails closed when the database probe fails', async () => {
    await expect(
      verifySuggestConfiguredReadiness(validEnvironment, {
        probeDatabase: async () => {
          throw new Error('database detail');
        },
      }),
    ).rejects.toThrow(SuggestConfiguredReadinessError);
  });

  it('fails closed when the DO worker health response is malformed', async () => {
    await expect(
      verifySuggestConfiguredReadiness(
        {
          ...validEnvironment,
          SUBMISSION_RATE_LIMIT_BUCKETS: namespaceWithResponse(
            new Response(JSON.stringify({ status: 'wrong' }), { status: 200 }),
          ),
        },
        { probeDatabase: async () => {} },
      ),
    ).rejects.toThrow('Suggest configured environment is unavailable.');
  });

  it('fails closed when any required route configuration is missing', async () => {
    await expect(
      verifySuggestConfiguredReadiness(
        {
          ...validEnvironment,
          CPM_TURNSTILE_SECRET_KEY: undefined,
        },
        { probeDatabase: async () => {} },
      ),
    ).rejects.toThrow(SuggestConfiguredReadinessError);
  });
});
