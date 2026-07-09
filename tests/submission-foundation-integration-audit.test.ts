import { describe, expect, it } from 'vitest';
import { createAbuseControlledSubmissionIntakeService } from '../src/submissions/abuse-controlled-intake';
import type { SubmissionContactProtector } from '../src/submissions/contact-protection';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createSubmissionPrivateIntakeService } from '../src/submissions/intake-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const requestId = '20000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-09T12:00:00.000Z');
const rateLimitKey = 'rl_abcdefghijklmnop';

function rawIntake() {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType: 'suggest',
    targetType: null,
    targetId: null,
    relationship: 'customer',
    contact: {
      email: 'person@example.test',
      contactAllowed: true,
    },
    evidenceLinks: [
      {
        url: 'https://merchant.example/payments',
        observedAt: '2026-07-01',
        summary: 'Official payment information.',
      },
    ],
    originalPayload: { name: 'Example Merchant', asset: 'BTC' },
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

function contactProtector(): SubmissionContactProtector {
  return {
    async protectEmail() {
      return {
        encryptedEmail: 'ciphertext-envelope',
        emailHash: 'c'.repeat(64),
        retentionUntil: null,
      };
    },
  };
}

function foundation() {
  const persistence = createInMemorySubmissionPersistenceBackend();
  const privateIntake = createSubmissionPrivateIntakeService({
    persistence,
    statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
    contactProtector: contactProtector(),
    generateSubmissionId: () => '10000000-0000-4000-8000-000000000001',
  });
  const abuseControlled = createAbuseControlledSubmissionIntakeService({
    rateLimiter: {
      async consume() {
        return { outcome: 'allow', remaining: 4 };
      },
    },
    challengeVerifier: {
      async verify() {
        return { outcome: 'allow', reasonCode: 'challenge_verified' };
      },
    },
    intake: privateIntake,
  });
  return { persistence, abuseControlled };
}

function abuseRequest(rawInput: unknown = rawIntake()) {
  return {
    requestId,
    challengeToken: 'turnstile-token',
    rateLimitKey,
    remoteIp: '203.0.113.10',
    rawInput,
    receivedAt,
  };
}

describe('P5-01 A-D Submission foundation integration audit', () => {
  it('commits once and replays the same safe receipt through the full abuse-controlled path', async () => {
    const { persistence, abuseControlled } = foundation();

    const committed = await abuseControlled.submit(abuseRequest());
    const replayed = await abuseControlled.submit(abuseRequest());

    expect(committed.state).toBe('committed');
    expect(replayed).toEqual({ ...committed, state: 'replayed' });
    expect(persistence.snapshot()).toHaveLength(1);

    const serializedReceipt = JSON.stringify(committed);
    expect(serializedReceipt).not.toContain('person@example.test');
    expect(serializedReceipt).not.toContain('ciphertext-envelope');
    expect(serializedReceipt).not.toContain('requestFingerprint');
    expect(serializedReceipt).not.toContain('statusTokenHash');
    expect(serializedReceipt).not.toContain('remoteIp');
    expect(serializedReceipt).not.toContain('rateLimitKey');
  });

  it('rejects changed content under the same request identity without creating another Submission', async () => {
    const { persistence, abuseControlled } = foundation();
    await abuseControlled.submit(abuseRequest());

    await expect(
      abuseControlled.submit(
        abuseRequest({
          ...rawIntake(),
          originalPayload: { name: 'Changed Merchant', asset: 'BTC' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('does not persist when rate limiting denies before challenge and private intake', async () => {
    const persistence = createInMemorySubmissionPersistenceBackend();
    const privateIntake = createSubmissionPrivateIntakeService({
      persistence,
      statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
      contactProtector: contactProtector(),
    });
    const abuseControlled = createAbuseControlledSubmissionIntakeService({
      rateLimiter: {
        async consume() {
          return { outcome: 'deny', retryAfterSeconds: 60 };
        },
      },
      challengeVerifier: {
        async verify() {
          throw new Error('challenge must not run');
        },
      },
      intake: privateIntake,
    });

    await expect(abuseControlled.submit(abuseRequest())).rejects.toMatchObject({
      code: 'rate_limited',
    });
    expect(persistence.snapshot()).toHaveLength(0);
  });

  it('does not persist when challenge verification denies after rate-limit allow', async () => {
    const persistence = createInMemorySubmissionPersistenceBackend();
    const privateIntake = createSubmissionPrivateIntakeService({
      persistence,
      statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
      contactProtector: contactProtector(),
    });
    const abuseControlled = createAbuseControlledSubmissionIntakeService({
      rateLimiter: {
        async consume() {
          return { outcome: 'allow', remaining: 4 };
        },
      },
      challengeVerifier: {
        async verify() {
          return { outcome: 'deny', reasonCode: 'challenge_failed' };
        },
      },
      intake: privateIntake,
    });

    await expect(abuseControlled.submit(abuseRequest())).rejects.toMatchObject({
      code: 'challenge_rejected',
    });
    expect(persistence.snapshot()).toHaveLength(0);
  });
});
