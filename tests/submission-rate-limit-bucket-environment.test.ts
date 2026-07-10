import { describe, expect, it } from 'vitest';
import {
  createSubmissionRateLimitBucketDeriverFromEnvironment,
  SubmissionRateLimitBucketConfigurationError,
  SubmissionRateLimitBucketDerivationError,
} from '../src/submissions/rate-limit-bucket-environment';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function environment(keyBytes = new Uint8Array(32).fill(17)): Record<string, unknown> {
  return {
    CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: encodeBase64Url(keyBytes),
  };
}

describe('P5-02K opaque Submission rate-limit bucket derivation', () => {
  it('derives an opaque bucket key accepted by the abuse-control contract', async () => {
    const rawIdentity = '203.0.113.42';
    const deriver = createSubmissionRateLimitBucketDeriverFromEnvironment(environment());
    const bucketKey = await deriver.deriveBucketKey(rawIdentity);

    expect(bucketKey).toMatch(/^rl_[A-Za-z0-9_-]{16,128}$/);
    expect(bucketKey).not.toContain(rawIdentity);
  });

  it('is deterministic for the same configured key and edge identity', async () => {
    const first = createSubmissionRateLimitBucketDeriverFromEnvironment(environment());
    const second = createSubmissionRateLimitBucketDeriverFromEnvironment(environment());

    await expect(first.deriveBucketKey('2001:db8::1')).resolves.toBe(
      await second.deriveBucketKey('2001:db8::1'),
    );
  });

  it('separates different edge identities', async () => {
    const deriver = createSubmissionRateLimitBucketDeriverFromEnvironment(environment());
    expect(await deriver.deriveBucketKey('203.0.113.1')).not.toBe(
      await deriver.deriveBucketKey('203.0.113.2'),
    );
  });

  it('separates configured HMAC keys', async () => {
    const first = createSubmissionRateLimitBucketDeriverFromEnvironment(environment());
    const second = createSubmissionRateLimitBucketDeriverFromEnvironment(
      environment(new Uint8Array(32).fill(19)),
    );
    expect(await first.deriveBucketKey('203.0.113.42')).not.toBe(
      await second.deriveBucketKey('203.0.113.42'),
    );
  });

  it.each([
    ['missing', {}],
    ['empty', { CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: '' }],
    ['malformed', { CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: 'not+base64url' }],
    ['padded', { CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: `${'A'.repeat(43)}=` }],
    ['too short', environment(new Uint8Array(31).fill(17))],
  ])('fails closed for %s configuration', (_name, configuredEnvironment) => {
    expect(() =>
      createSubmissionRateLimitBucketDeriverFromEnvironment(configuredEnvironment),
    ).toThrow(SubmissionRateLimitBucketConfigurationError);
  });

  it('accepts exactly 32 decoded key bytes', async () => {
    const deriver = createSubmissionRateLimitBucketDeriverFromEnvironment(
      environment(new Uint8Array(32).fill(1)),
    );
    await expect(deriver.deriveBucketKey('203.0.113.42')).resolves.toMatch(/^rl_/);
  });

  it('does not include configured secret material in errors', () => {
    const secret = 'sensitive+invalid/value=';
    let caught: unknown;
    try {
      createSubmissionRateLimitBucketDeriverFromEnvironment({
        CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: secret,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SubmissionRateLimitBucketConfigurationError);
    expect(String(caught)).not.toContain(secret);
  });

  it.each(['', 'x'.repeat(65)])('rejects invalid edge identity input', async (edgeIdentity) => {
    const deriver = createSubmissionRateLimitBucketDeriverFromEnvironment(environment());
    await expect(deriver.deriveBucketKey(edgeIdentity)).rejects.toBeInstanceOf(
      SubmissionRateLimitBucketDerivationError,
    );
  });

  it('accepts explicit environment records with unrelated server bindings', async () => {
    const deriver = createSubmissionRateLimitBucketDeriverFromEnvironment({
      ...environment(),
      DATABASE_URL: 'postgresql://example.invalid/db',
    });
    await expect(deriver.deriveBucketKey('203.0.113.42')).resolves.toMatch(/^rl_/);
  });
});
