import { describe, expect, it } from 'vitest';
import {
  hashSubmissionStatusSecret,
  issueSubmissionStatusSecret,
  submissionStatusSecretSchema,
  verifySubmissionStatusSecret,
} from '../src/submissions/status-secret';

describe('submission status secret boundary', () => {
  it('issues a high-entropy secret and stores only a one-way hash representation', async () => {
    const entropy = Uint8Array.from({ length: 32 }, (_, index) => index);
    const issued = await issueSubmissionStatusSecret(entropy);

    expect(submissionStatusSecretSchema.parse(issued.secret)).toBe(issued.secret);
    expect(issued.tokenHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(issued.tokenHash).not.toContain(issued.secret);
    await expect(verifySubmissionStatusSecret(issued.secret, issued.tokenHash)).resolves.toBe(true);
  });

  it('is deterministic for a supplied entropy fixture but rejects a different secret', async () => {
    const first = await issueSubmissionStatusSecret(new Uint8Array(32).fill(7));
    const repeated = await issueSubmissionStatusSecret(new Uint8Array(32).fill(7));
    const different = await issueSubmissionStatusSecret(new Uint8Array(32).fill(8));

    expect(repeated).toEqual(first);
    expect(different.secret).not.toBe(first.secret);
    expect(different.tokenHash).not.toBe(first.tokenHash);
    await expect(verifySubmissionStatusSecret(different.secret, first.tokenHash)).resolves.toBe(
      false,
    );
  });

  it('rejects malformed secrets and hashes without throwing from the verification boundary', async () => {
    await expect(
      verifySubmissionStatusSecret('bad-secret', `sha256:${'a'.repeat(64)}`),
    ).resolves.toBe(false);
    await expect(verifySubmissionStatusSecret('bad-secret', 'bad-hash')).resolves.toBe(false);
  });

  it('requires exactly 32 bytes of entropy for deterministic issuance', async () => {
    await expect(issueSubmissionStatusSecret(new Uint8Array(31))).rejects.toThrow(
      'exactly 32 bytes',
    );
    await expect(issueSubmissionStatusSecret(new Uint8Array(33))).rejects.toThrow(
      'exactly 32 bytes',
    );
  });

  it('hashes a valid secret into the stored representation', async () => {
    const issued = await issueSubmissionStatusSecret(new Uint8Array(32).fill(1));
    await expect(hashSubmissionStatusSecret(issued.secret)).resolves.toBe(issued.tokenHash);
  });
});
