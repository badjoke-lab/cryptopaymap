import { describe, expect, it, vi } from 'vitest';
import {
  createSubmissionTurnstileConfigurationFromEnvironment,
  SubmissionTurnstileConfigurationError,
} from '../src/submissions/turnstile-environment';

const requestId = '20000000-0000-4000-8000-000000000001';
const validEnvironment = {
  CPM_TURNSTILE_SECRET_KEY: 'server-secret',
  PUBLIC_TURNSTILE_SITE_KEY: 'public-site-key',
  CPM_TURNSTILE_EXPECTED_HOSTNAME: 'review.example.test',
  CPM_TURNSTILE_EXPECTED_ACTION: 'submission_intake',
};

describe('P5-02N/P5-02R Turnstile environment binding', () => {
  it('binds server verification and returns only client-safe widget configuration', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        secret: 'server-secret',
        response: 'turnstile-token',
        idempotency_key: requestId,
        remoteip: '203.0.113.10',
      });
      return new Response(
        JSON.stringify({
          success: true,
          hostname: 'review.example.test',
          action: 'submission_intake',
        }),
        { status: 200 },
      );
    });
    const configuration = createSubmissionTurnstileConfigurationFromEnvironment(validEnvironment, {
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(configuration.client).toEqual({
      siteKey: 'public-site-key',
      action: 'submission_intake',
    });
    expect(configuration.expectedHostname).toBe('review.example.test');
    expect(configuration).not.toHaveProperty('secretKey');
    await expect(
      configuration.verifier.verify({
        requestId,
        token: 'turnstile-token',
        remoteIp: '203.0.113.10',
      }),
    ).resolves.toEqual({ outcome: 'allow', reasonCode: 'challenge_verified' });
  });

  it('separates the browser action from strict Siteverify metadata when configured', async () => {
    const configuration = createSubmissionTurnstileConfigurationFromEnvironment(
      {
        CPM_TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        CPM_TURNSTILE_EXPECTED_HOSTNAME: 'localhost',
        CPM_TURNSTILE_EXPECTED_ACTION: 'test',
        PUBLIC_TURNSTILE_ACTION: 'submission_intake',
      },
      {
        fetchImpl: (async () =>
          new Response(
            JSON.stringify({
              success: true,
              hostname: 'localhost',
              action: 'test',
            }),
            { status: 200 },
          )) as typeof fetch,
      },
    );

    expect(configuration.client).toEqual({
      siteKey: '1x00000000000000000000AA',
      action: 'submission_intake',
    });
    expect(configuration.expectedHostname).toBe('localhost');
    await expect(
      configuration.verifier.verify({
        requestId,
        token: 'XXXX.DUMMY.TOKEN.XXXX',
        remoteIp: '203.0.113.10',
      }),
    ).resolves.toEqual({ outcome: 'allow', reasonCode: 'challenge_verified' });
  });

  it('preserves exact hostname mismatch denial through the existing verifier', async () => {
    const configuration = createSubmissionTurnstileConfigurationFromEnvironment(validEnvironment, {
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            success: true,
            hostname: 'wrong.example.test',
            action: 'submission_intake',
          }),
          { status: 200 },
        )) as typeof fetch,
    });

    await expect(
      configuration.verifier.verify({ requestId, token: 'turnstile-token', remoteIp: null }),
    ).resolves.toEqual({ outcome: 'deny', reasonCode: 'challenge_hostname_mismatch' });
  });

  it('preserves exact action mismatch denial through the existing verifier', async () => {
    const configuration = createSubmissionTurnstileConfigurationFromEnvironment(validEnvironment, {
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            success: true,
            hostname: 'review.example.test',
            action: 'different_action',
          }),
          { status: 200 },
        )) as typeof fetch,
    });

    await expect(
      configuration.verifier.verify({ requestId, token: 'turnstile-token', remoteIp: null }),
    ).resolves.toEqual({ outcome: 'deny', reasonCode: 'challenge_action_mismatch' });
  });

  it.each([
    ['missing secret', { ...validEnvironment, CPM_TURNSTILE_SECRET_KEY: undefined }],
    ['site key with whitespace', { ...validEnvironment, PUBLIC_TURNSTILE_SITE_KEY: 'not valid' }],
    [
      'hostname with scheme',
      { ...validEnvironment, CPM_TURNSTILE_EXPECTED_HOSTNAME: 'https://review.example.test' },
    ],
    [
      'hostname with uppercase',
      { ...validEnvironment, CPM_TURNSTILE_EXPECTED_HOSTNAME: 'Review.example.test' },
    ],
    [
      'action longer than 32 characters',
      { ...validEnvironment, CPM_TURNSTILE_EXPECTED_ACTION: 'x'.repeat(33) },
    ],
    [
      'action with unsupported characters',
      { ...validEnvironment, CPM_TURNSTILE_EXPECTED_ACTION: 'submission intake' },
    ],
    [
      'browser action with unsupported characters',
      { ...validEnvironment, PUBLIC_TURNSTILE_ACTION: 'submission intake' },
    ],
  ])('rejects %s with one generic configuration error', (_name, environment) => {
    expect(() => createSubmissionTurnstileConfigurationFromEnvironment(environment)).toThrow(
      SubmissionTurnstileConfigurationError,
    );
    expect(() => createSubmissionTurnstileConfigurationFromEnvironment(environment)).toThrow(
      'Submission Turnstile configuration is unavailable.',
    );
  });

  it('does not disclose configured values through configuration errors', () => {
    const secret = 'do-not-disclose-this-secret';
    try {
      createSubmissionTurnstileConfigurationFromEnvironment({
        ...validEnvironment,
        CPM_TURNSTILE_SECRET_KEY: secret,
        CPM_TURNSTILE_EXPECTED_ACTION: 'invalid action',
      });
      throw new Error('Expected Turnstile configuration failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(SubmissionTurnstileConfigurationError);
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain('invalid action');
    }
  });
});
