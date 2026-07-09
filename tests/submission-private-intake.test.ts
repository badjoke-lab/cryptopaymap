import { describe, expect, it, vi } from 'vitest';
import type { SubmissionContactProtector } from '../src/submissions/contact-protection';
import { commonSubmissionIntakeSchema } from '../src/submissions/contract';
import {
  canonicalSubmissionIntakeString,
  fingerprintSubmissionIntake,
} from '../src/submissions/fingerprint';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import {
  createSubmissionPrivateIntakeService,
  SubmissionIntakeError,
} from '../src/submissions/intake-service';
import {
  SubmissionPersistenceError,
  type SubmissionPersistenceBackend,
} from '../src/submissions/persistence';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const requestId = '20000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-09T12:00:00.000Z');
const hmacKey = new Uint8Array(32).fill(7);

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
    originalPayload: {
      name: 'Example Merchant',
      payment: {
        network: 'bitcoin',
        asset: 'BTC',
      },
    },
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
        retentionUntil: new Date('2026-10-07T12:00:00.000Z'),
      };
    },
  };
}

function service(
  persistence = createInMemorySubmissionPersistenceBackend(),
  protector = contactProtector(),
) {
  return {
    persistence,
    intake: createSubmissionPrivateIntakeService({
      persistence,
      statusSecrets: createHmacSubmissionStatusSecretProvider(hmacKey),
      contactProtector: protector,
      generateSubmissionId: () => '10000000-0000-4000-8000-000000000001',
    }),
  };
}

describe('P5-01C idempotent private intake service', () => {
  it('commits one private submission and replays the same public reference and secret', async () => {
    const { persistence, intake } = service();

    const committed = await intake.submit(requestId, rawIntake(), receivedAt);
    const replayed = await intake.submit(requestId, rawIntake(), receivedAt);

    expect(committed.state).toBe('committed');
    expect(replayed).toEqual({ ...committed, state: 'replayed' });
    expect(persistence.snapshot()).toHaveLength(1);
    expect(persistence.snapshot()[0]).toMatchObject({
      publicId: committed.publicId,
      workflowStatus: 'received',
      contact: {
        encryptedEmail: 'ciphertext-envelope',
        emailHash: 'c'.repeat(64),
        contactAllowed: true,
      },
      originalPayload: {
        originalPayload: rawIntake().originalPayload,
        evidenceLinks: rawIntake().evidenceLinks,
        acknowledgements: rawIntake().acknowledgements,
      },
    });
    expect(JSON.stringify(persistence.snapshot())).not.toContain('person@example.test');
    expect(JSON.stringify(persistence.snapshot())).not.toContain(committed.statusSecret);
  });

  it('rejects changed content that reuses an existing request ID', async () => {
    const { persistence, intake } = service();
    await intake.submit(requestId, rawIntake(), receivedAt);

    await expect(
      intake.submit(
        requestId,
        {
          ...rawIntake(),
          originalPayload: { name: 'Different Merchant' },
        },
        receivedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('canonicalizes object-key order before fingerprinting', async () => {
    const first = commonSubmissionIntakeSchema.parse(rawIntake());
    const second = commonSubmissionIntakeSchema.parse({
      ...rawIntake(),
      originalPayload: {
        payment: {
          asset: 'BTC',
          network: 'bitcoin',
        },
        name: 'Example Merchant',
      },
    });

    expect(canonicalSubmissionIntakeString(first)).toBe(canonicalSubmissionIntakeString(second));
    await expect(fingerprintSubmissionIntake(first)).resolves.toBe(
      await fingerprintSubmissionIntake(second),
    );
  });

  it('derives deterministic request-bound secrets from the HMAC provider', async () => {
    const provider = createHmacSubmissionStatusSecretProvider(hmacKey);
    const repeated = await provider.issueForRequest(requestId);
    const first = await provider.issueForRequest(requestId);
    const different = await provider.issueForRequest('20000000-0000-4000-8000-000000000002');

    expect(repeated).toEqual(first);
    expect(different.secret).not.toBe(first.secret);
    expect(different.tokenHash).not.toBe(first.tokenHash);
    expect(() => createHmacSubmissionStatusSecretProvider(new Uint8Array(31))).toThrow(
      'at least 32 bytes',
    );
  });

  it('fails before persistence when contact protection fails', async () => {
    const persistence = createInMemorySubmissionPersistenceBackend();
    const failedProtector: SubmissionContactProtector = {
      async protectEmail() {
        throw new Error('encryption provider unavailable');
      },
    };
    const { intake } = service(persistence, failedProtector);

    await expect(intake.submit(requestId, rawIntake(), receivedAt)).rejects.toMatchObject({
      code: 'contact_protection_failed',
    });
    expect(persistence.snapshot()).toHaveLength(0);
  });

  it('rejects invalid requests before contact protection or persistence', async () => {
    const persistence = createInMemorySubmissionPersistenceBackend();
    const protectEmail = vi.fn(async () => ({
      encryptedEmail: 'ciphertext-envelope',
      emailHash: 'c'.repeat(64),
      retentionUntil: null,
    }));
    const { intake } = service(persistence, { protectEmail });

    await expect(
      intake.submit('not-a-uuid', { ...rawIntake(), extra: true }, receivedAt),
    ).rejects.toBeInstanceOf(SubmissionIntakeError);
    expect(protectEmail).not.toHaveBeenCalled();
    expect(persistence.snapshot()).toHaveLength(0);
  });

  it('recovers a matching concurrent create conflict as an idempotent replay', async () => {
    const statusSecrets = createHmacSubmissionStatusSecretProvider(hmacKey);
    const parsed = commonSubmissionIntakeSchema.parse(rawIntake());
    const fingerprint = await fingerprintSubmissionIntake(parsed);
    const issued = await statusSecrets.issueForRequest(requestId);
    let reads = 0;

    const persistence: SubmissionPersistenceBackend = {
      async allocatePublicReference() {
        return 'CPM-S-2026-000007';
      },
      async readByIntakeRequestId() {
        reads += 1;
        if (reads === 1) return null;
        return {
          submissionId: '10000000-0000-4000-8000-000000000009',
          publicId: 'CPM-S-2026-000006',
          requestFingerprint: fingerprint,
          workflowStatus: 'received',
          statusTokenHash: issued.tokenHash,
          submittedAt: receivedAt.toISOString(),
        };
      },
      async createSubmission() {
        throw new SubmissionPersistenceError('conflict', 'concurrent insert');
      },
      async transitionSubmission() {
        throw new Error('not used');
      },
    };
    const intake = createSubmissionPrivateIntakeService({
      persistence,
      statusSecrets,
      contactProtector: contactProtector(),
      generateSubmissionId: () => '10000000-0000-4000-8000-000000000001',
    });

    await expect(intake.submit(requestId, rawIntake(), receivedAt)).resolves.toEqual({
      state: 'replayed',
      publicId: 'CPM-S-2026-000006',
      statusSecret: issued.secret,
      submittedAt: receivedAt.toISOString(),
    });
  });

  it('fails closed when deterministic replay secret does not match stored hash state', async () => {
    const statusSecrets = createHmacSubmissionStatusSecretProvider(hmacKey);
    const parsed = commonSubmissionIntakeSchema.parse(rawIntake());
    const fingerprint = await fingerprintSubmissionIntake(parsed);
    const persistence: SubmissionPersistenceBackend = {
      async allocatePublicReference() {
        return 'CPM-S-2026-000001';
      },
      async readByIntakeRequestId() {
        return {
          submissionId: '10000000-0000-4000-8000-000000000001',
          publicId: 'CPM-S-2026-000001',
          requestFingerprint: fingerprint,
          workflowStatus: 'received',
          statusTokenHash: `sha256:${'f'.repeat(64)}`,
          submittedAt: receivedAt.toISOString(),
        };
      },
      async createSubmission() {
        throw new Error('not used');
      },
      async transitionSubmission() {
        throw new Error('not used');
      },
    };
    const intake = createSubmissionPrivateIntakeService({
      persistence,
      statusSecrets,
      contactProtector: contactProtector(),
    });

    await expect(intake.submit(requestId, rawIntake(), receivedAt)).rejects.toMatchObject({
      code: 'replay_integrity_failure',
    });
  });
});
