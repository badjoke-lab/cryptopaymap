import { describe, expect, it } from 'vitest';
import {
  createSubmissionStatusSecretProviderFromEnvironment,
  SubmissionStatusSecretConfigurationError,
} from '../src/submissions/status-secret-environment';

const requestId = '20000000-0000-4000-8000-000000000001';
const differentRequestId = '20000000-0000-4000-8000-000000000002';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function environment(keyBytes = new Uint8Array(32).fill(7)): Record<string, unknown> {
  return { CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: encodeBase64Url(keyBytes) };
}

describe('P5-02I Submission status-secret environment binding', () => {
  it('creates the existing provider from an explicit environment record', async () => {
    const explicitEnvironment = environment();
    const provider = createSubmissionStatusSecretProviderFromEnvironment(explicitEnvironment);
    await expect(provider.issueForRequest(requestId)).resolves.toMatchObject({
      secret: expect.stringMatching(/^cpmss_[A-Za-z0-9_-]{43}$/),
      tokenHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });

  it.each([
    ['missing', {}],
    ['empty', { CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: '' }],
    ['malformed alphabet', { CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: 'not+base64url' }],
    ['invalid encoded length', { CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: 'A' }],
    ['padded', { CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: `${'A'.repeat(43)}=` }],
    ['too short', environment(new Uint8Array(31).fill(7))],
  ])('fails closed for %s configuration', (_name, configuredEnvironment) => {
    expect(() =>
      createSubmissionStatusSecretProviderFromEnvironment(configuredEnvironment),
    ).toThrow(SubmissionStatusSecretConfigurationError);
  });

  it('accepts exactly 32 decoded key bytes', async () => {
    const provider = createSubmissionStatusSecretProviderFromEnvironment(
      environment(new Uint8Array(32).fill(1)),
    );
    await expect(provider.issueForRequest(requestId)).resolves.toBeDefined();
  });

  it('reproduces the same secret for the same key and request UUID', async () => {
    const firstProvider = createSubmissionStatusSecretProviderFromEnvironment(environment());
    const secondProvider = createSubmissionStatusSecretProviderFromEnvironment(environment());
    expect(await firstProvider.issueForRequest(requestId)).toEqual(
      await secondProvider.issueForRequest(requestId),
    );
  });

  it('separates different request UUIDs under the same key', async () => {
    const provider = createSubmissionStatusSecretProviderFromEnvironment(environment());
    const first = await provider.issueForRequest(requestId);
    const second = await provider.issueForRequest(differentRequestId);
    expect(second.secret).not.toBe(first.secret);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });

  it('does not include configured secret material in errors', () => {
    const configuredSecret = 'sensitive+invalid/value=';
    let caught: unknown;
    try {
      createSubmissionStatusSecretProviderFromEnvironment({
        CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: configuredSecret,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SubmissionStatusSecretConfigurationError);
    expect(String(caught)).not.toContain(configuredSecret);
  });
});
