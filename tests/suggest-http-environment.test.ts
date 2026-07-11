import { describe, expect, it } from 'vitest';
import {
  createSuggestHttpRuntimeFromEnvironment,
  SuggestHttpEnvironmentConfigurationError,
} from '../src/submissions/suggest-http-environment';

const durableObjectNamespace = {
  idFromName(name: string) {
    return { name };
  },
  get() {
    return {
      async fetch() {
        return new Response(JSON.stringify({ outcome: 'allow', remaining: 4 }), { status: 200 });
      },
    };
  },
};

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:pass@example.test/cryptopaymap',
  CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: 'C'.repeat(43),
  CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: 'A'.repeat(43),
  CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID: 'contact-v1',
  CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: 'B'.repeat(43),
  CPM_SUBMISSION_CONTACT_RETENTION_DAYS: '180',
  CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: 'D'.repeat(43),
  CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS: '5',
  CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: '600',
  CPM_TURNSTILE_SECRET_KEY: 'server-secret',
  PUBLIC_TURNSTILE_SITE_KEY: 'public-site-key',
  CPM_TURNSTILE_EXPECTED_HOSTNAME: 'review.example.test',
  CPM_TURNSTILE_EXPECTED_ACTION: 'submission_intake',
  SUBMISSION_RATE_LIMIT_BUCKETS: durableObjectNamespace,
};

describe('P5-02O Suggest HTTP environment composition', () => {
  it('composes the existing bucket deriver and abuse-controlled Suggest intake contracts', async () => {
    const runtime = createSuggestHttpRuntimeFromEnvironment(validEnvironment);

    await expect(runtime.bucketDeriver.deriveBucketKey('203.0.113.10')).resolves.toMatch(
      /^rl_[A-Za-z0-9_-]{43}$/,
    );
    expect(runtime.intake).toHaveProperty('submit');
  });

  it.each([
    ['missing database URL', { ...validEnvironment, DATABASE_URL: undefined }],
    [
      'missing Durable Object binding',
      { ...validEnvironment, SUBMISSION_RATE_LIMIT_BUCKETS: undefined },
    ],
    [
      'invalid request limit',
      { ...validEnvironment, CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS: '0' },
    ],
    [
      'invalid rate-limit window',
      { ...validEnvironment, CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: '86401' },
    ],
    [
      'missing Turnstile secret',
      { ...validEnvironment, CPM_TURNSTILE_SECRET_KEY: undefined },
    ],
    [
      'invalid contact encryption key',
      { ...validEnvironment, CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: 'invalid' },
    ],
  ])('fails closed for %s with one generic configuration error', (_name, environment) => {
    expect(() => createSuggestHttpRuntimeFromEnvironment(environment)).toThrow(
      SuggestHttpEnvironmentConfigurationError,
    );
    expect(() => createSuggestHttpRuntimeFromEnvironment(environment)).toThrow(
      'Suggest HTTP environment configuration is unavailable.',
    );
  });

  it('does not disclose configured secrets through composition errors', () => {
    const secret = 'do-not-disclose-turnstile-secret';
    try {
      createSuggestHttpRuntimeFromEnvironment({
        ...validEnvironment,
        CPM_TURNSTILE_SECRET_KEY: secret,
        CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: 'not-a-number',
      });
      throw new Error('Expected Suggest HTTP environment failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(SuggestHttpEnvironmentConfigurationError);
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain('not-a-number');
    }
  });
});
