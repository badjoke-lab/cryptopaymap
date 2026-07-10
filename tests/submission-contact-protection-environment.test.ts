import { describe, expect, it } from 'vitest';
import {
  createSubmissionContactProtectorFromEnvironment,
  SubmissionContactProtectionConfigurationError,
  SubmissionContactProtectionError,
} from '../src/submissions/contact-protection-environment';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return Uint8Array.from(
    atob(normalized.padEnd(normalized.length + paddingLength, '=')),
    (character) => character.charCodeAt(0),
  );
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function environment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: encodeBase64Url(new Uint8Array(32).fill(11)),
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID: 'contact-2026-01',
    CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: encodeBase64Url(new Uint8Array(32).fill(29)),
    CPM_SUBMISSION_CONTACT_RETENTION_DAYS: '30',
    ...overrides,
  };
}

async function decryptEnvelope(encryptedEmail: string, keyBytes: Uint8Array): Promise<string> {
  const [version, keyId, ivEncoded, ciphertextEncoded] = encryptedEmail.split('.');
  expect(version).toBe('v1');
  expect(keyId).toBe('contact-2026-01');
  const key = await crypto.subtle.importKey(
    'raw',
    copyArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: copyArrayBuffer(decodeBase64Url(ivEncoded ?? '')),
      additionalData: new TextEncoder().encode(
        'cryptopaymap:submission-contact-email:v1:contact-2026-01',
      ),
    },
    key,
    copyArrayBuffer(decodeBase64Url(ciphertextEncoded ?? '')),
  );
  return new TextDecoder().decode(plaintext);
}

describe('P5-02J Submission contact protection', () => {
  it('encrypts the validated email and assigns configured retention', async () => {
    const receivedAt = new Date('2026-07-11T00:00:00.000Z');
    const protector = createSubmissionContactProtectorFromEnvironment(environment());
    const protectedContact = await protector.protectEmail('User@Example.com', receivedAt);

    expect(protectedContact.encryptedEmail).toMatch(
      /^v1\.contact-2026-01\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(protectedContact.emailHash).toMatch(/^[a-f0-9]{64}$/);
    expect(protectedContact.retentionUntil).toEqual(new Date('2026-08-10T00:00:00.000Z'));
    await expect(
      decryptEnvelope(protectedContact.encryptedEmail, new Uint8Array(32).fill(11)),
    ).resolves.toBe('User@Example.com');
  });

  it('uses randomized ciphertext for the same email', async () => {
    const protector = createSubmissionContactProtectorFromEnvironment(environment());
    const receivedAt = new Date('2026-07-11T00:00:00.000Z');
    const first = await protector.protectEmail('user@example.com', receivedAt);
    const second = await protector.protectEmail('user@example.com', receivedAt);

    expect(second.encryptedEmail).not.toBe(first.encryptedEmail);
    expect(second.emailHash).toBe(first.emailHash);
  });

  it('hashes normalized email identity deterministically', async () => {
    const protector = createSubmissionContactProtectorFromEnvironment(environment());
    const receivedAt = new Date('2026-07-11T00:00:00.000Z');
    const first = await protector.protectEmail('User@Example.COM', receivedAt);
    const second = await protector.protectEmail('user@example.com', receivedAt);

    expect(second.emailHash).toBe(first.emailHash);
  });

  it('changes email hashes when the HMAC key changes', async () => {
    const receivedAt = new Date('2026-07-11T00:00:00.000Z');
    const first = createSubmissionContactProtectorFromEnvironment(environment());
    const second = createSubmissionContactProtectorFromEnvironment(
      environment({
        CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: encodeBase64Url(new Uint8Array(32).fill(31)),
      }),
    );

    expect((await first.protectEmail('user@example.com', receivedAt)).emailHash).not.toBe(
      (await second.protectEmail('user@example.com', receivedAt)).emailHash,
    );
  });

  it.each([
    ['missing encryption key', { CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: undefined }],
    ['empty encryption key', { CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: '' }],
    [
      'short encryption key',
      {
        CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: encodeBase64Url(
          new Uint8Array(31).fill(11),
        ),
      },
    ],
    [
      'long encryption key',
      {
        CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: encodeBase64Url(
          new Uint8Array(33).fill(11),
        ),
      },
    ],
    [
      'short hash key',
      {
        CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: encodeBase64Url(new Uint8Array(31).fill(29)),
      },
    ],
    [
      'same encryption and hash key material',
      {
        CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: encodeBase64Url(new Uint8Array(32).fill(11)),
      },
    ],
    ['invalid key id', { CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID: 'contact key' }],
    ['zero retention', { CPM_SUBMISSION_CONTACT_RETENTION_DAYS: '0' }],
    ['excessive retention', { CPM_SUBMISSION_CONTACT_RETENTION_DAYS: '3651' }],
    ['non-integer retention', { CPM_SUBMISSION_CONTACT_RETENTION_DAYS: '30.5' }],
  ])('fails closed for %s', (_name, overrides) => {
    expect(() => createSubmissionContactProtectorFromEnvironment(environment(overrides))).toThrow(
      SubmissionContactProtectionConfigurationError,
    );
  });

  it('rejects padded or malformed key encoding', () => {
    const valid = String(environment().CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL);
    expect(() =>
      createSubmissionContactProtectorFromEnvironment(
        environment({ CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: `${valid}=` }),
      ),
    ).toThrow(SubmissionContactProtectionConfigurationError);
    expect(() =>
      createSubmissionContactProtectorFromEnvironment(
        environment({ CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: 'not+base64url' }),
      ),
    ).toThrow(SubmissionContactProtectionConfigurationError);
  });

  it('does not include secret material in configuration errors', () => {
    const secret = 'sensitive+invalid/value=';
    let caught: unknown;
    try {
      createSubmissionContactProtectorFromEnvironment(
        environment({ CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: secret }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SubmissionContactProtectionConfigurationError);
    expect(String(caught)).not.toContain(secret);
  });

  it('fails with a bounded operation error for invalid email or timestamp', async () => {
    const protector = createSubmissionContactProtectorFromEnvironment(environment());
    await expect(
      protector.protectEmail('not-an-email', new Date('2026-07-11T00:00:00.000Z')),
    ).rejects.toBeInstanceOf(SubmissionContactProtectionError);
    await expect(
      protector.protectEmail('user@example.com', new Date(Number.NaN)),
    ).rejects.toBeInstanceOf(SubmissionContactProtectionError);
  });

  it('accepts explicit environment records that contain unrelated server bindings', async () => {
    const protector = createSubmissionContactProtectorFromEnvironment(
      environment({ DATABASE_URL: 'postgresql://example.invalid/db' }),
    );
    await expect(
      protector.protectEmail('user@example.com', new Date('2026-07-11T00:00:00.000Z')),
    ).resolves.toMatchObject({ emailHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
});
