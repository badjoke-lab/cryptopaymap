import { describe, expect, it, vi } from 'vitest';
import { createAbuseControlledSubmissionIntakeService } from '../src/submissions/abuse-controlled-intake';
import type { SubmissionContactProtector } from '../src/submissions/contact-protection';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createReportSubmissionPrivateIntakeService } from '../src/submissions/report-intake-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const paymentRequestId = '20000000-0000-4000-8000-000000000001';
const problemRequestId = '20000000-0000-4000-8000-000000000002';
const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '30000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-13T00:00:00.000Z');
const hmacKey = new Uint8Array(32).fill(9);

function commonEnvelope<Payload>(
  submissionType: 'payment_report' | 'problem_report',
  originalPayload: Payload,
) {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType,
    targetType: 'location',
    targetId,
    relationship: null,
    contact: {
      email: 'reporter@example.test',
      contactAllowed: true,
    },
    evidenceLinks: [
      {
        url: 'https://merchant.example/payment-policy',
        observedAt: '2026-07-12',
        summary: 'Public information for reviewer comparison.',
      },
    ],
    originalPayload,
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

function validPaymentReport() {
  return commonEnvelope('payment_report', {
    schemaVersion: 'payment-report-v1',
    result: 'successful',
    paymentDate: '2026-07-12',
    payment: {
      assetSlug: 'btc',
      networkSlug: 'bitcoin',
      routeType: 'direct_wallet',
      paymentMethod: 'wallet_qr',
      processor: null,
      context: 'qr_code',
      observedSteps: 'The cashier displayed a Bitcoin QR code after confirming the order.',
    },
    privateTransactionUrl: 'https://explorer.example/tx/private-review-reference',
    notes: 'The payment completed during the observed checkout.',
  });
}

function validProblemReport() {
  return commonEnvelope('problem_report', {
    schemaVersion: 'problem-report-v1',
    reportType: 'wrong_network',
    observedAt: '2026-07-12',
    explanation: 'The public record names the wrong network for the listed USDT option.',
    proposedCorrection: {
      kind: 'network',
      networkSlug: 'base',
    },
    duplicateTarget: null,
    privateEvidenceUrl: 'https://merchant.example/private/network-proof',
  });
}

function contactProtector(protectEmail = vi.fn()): SubmissionContactProtector {
  return {
    async protectEmail(email, received) {
      protectEmail(email, received);
      return {
        encryptedEmail: 'ciphertext-envelope',
        emailHash: 'd'.repeat(64),
        retentionUntil: null,
      };
    },
  };
}

function reportFoundation(protector = contactProtector()) {
  const persistence = createInMemorySubmissionPersistenceBackend();
  let generated = 0;
  const intake = createReportSubmissionPrivateIntakeService({
    persistence,
    statusSecrets: createHmacSubmissionStatusSecretProvider(hmacKey),
    contactProtector: protector,
    generateSubmissionId: () => {
      generated += 1;
      return generated === 1 ? submissionId : '10000000-0000-4000-8000-000000000002';
    },
  });
  return { persistence, intake };
}

describe('P5-03B report private intake integration', () => {
  it('atomically stores a payment report with private original and review-safe normalized payloads', async () => {
    const { persistence, intake } = reportFoundation();

    const receipt = await intake.submit(paymentRequestId, validPaymentReport(), receivedAt);
    const stored = persistence.snapshot()[0];

    expect(receipt.state).toBe('committed');
    expect(stored).toMatchObject({
      submissionType: 'payment_report',
      targetType: 'location',
      targetId,
      relationship: null,
      workflowStatus: 'received',
      originalPayload: {
        originalPayload: validPaymentReport().originalPayload,
        evidenceLinks: validPaymentReport().evidenceLinks,
        acknowledgements: validPaymentReport().acknowledgements,
      },
      normalizedPayload: {
        reportKind: 'payment_report',
        targetType: 'location',
        targetId,
        result: 'successful',
        paymentDate: '2026-07-12',
        payment: {
          assetSlug: 'btc',
          networkSlug: 'bitcoin',
          routeType: 'direct_wallet',
          paymentMethod: 'wallet_qr',
          processor: null,
        },
        restrictedEvidence: { privateTransactionUrlPresent: true },
      },
    });
    const normalized = JSON.stringify(stored?.normalizedPayload);
    expect(normalized).not.toContain('reporter@example.test');
    expect(normalized).not.toContain('ciphertext-envelope');
    expect(normalized).not.toContain('private-review-reference');
  });

  it('atomically stores a problem report with structured correction signals', async () => {
    const { persistence, intake } = reportFoundation();

    const receipt = await intake.submit(problemRequestId, validProblemReport(), receivedAt);
    const stored = persistence.snapshot()[0];

    expect(receipt.state).toBe('committed');
    expect(stored).toMatchObject({
      submissionType: 'problem_report',
      targetType: 'location',
      targetId,
      workflowStatus: 'received',
      normalizedPayload: {
        reportKind: 'problem_report',
        reportType: 'wrong_network',
        proposedCorrection: {
          kind: 'network',
          networkSlug: 'base',
        },
        restrictedEvidence: { privateEvidenceUrlPresent: true },
      },
    });
    const normalized = JSON.stringify(stored?.normalizedPayload);
    expect(normalized).not.toContain('reporter@example.test');
    expect(normalized).not.toContain('/private/network-proof');
  });

  it('protects optional contact separately from both persisted payloads', async () => {
    const protectEmail = vi.fn();
    const { persistence, intake } = reportFoundation(contactProtector(protectEmail));

    await intake.submit(paymentRequestId, validPaymentReport(), receivedAt);
    const stored = persistence.snapshot()[0];

    expect(protectEmail).toHaveBeenCalledWith('reporter@example.test', receivedAt);
    expect(stored?.contact).toMatchObject({
      encryptedEmail: 'ciphertext-envelope',
      emailHash: 'd'.repeat(64),
      contactAllowed: true,
    });
    expect(JSON.stringify(stored?.originalPayload)).not.toContain('reporter@example.test');
    expect(JSON.stringify(stored?.normalizedPayload)).not.toContain('reporter@example.test');
  });

  it('rejects invalid type-specific report input before contact protection or persistence', async () => {
    const protectEmail = vi.fn();
    const { persistence, intake } = reportFoundation(contactProtector(protectEmail));
    const invalid = {
      ...validPaymentReport(),
      originalPayload: {
        ...validPaymentReport().originalPayload,
        payment: {
          ...validPaymentReport().originalPayload.payment,
          routeType: 'processor_checkout',
          processor: null,
        },
      },
    };

    await expect(intake.submit(paymentRequestId, invalid, receivedAt)).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(protectEmail).not.toHaveBeenCalled();
    expect(persistence.snapshot()).toHaveLength(0);
  });

  it('replays identical payment report intake without adding another private row', async () => {
    const { persistence, intake } = reportFoundation();

    const committed = await intake.submit(paymentRequestId, validPaymentReport(), receivedAt);
    const replayed = await intake.submit(paymentRequestId, validPaymentReport(), receivedAt);

    expect(replayed).toEqual({ ...committed, state: 'replayed' });
    expect(persistence.snapshot()).toHaveLength(1);
    expect(persistence.snapshot()[0]?.normalizedPayload).not.toBeNull();
  });

  it('replays identical problem report intake without adding another private row', async () => {
    const { persistence, intake } = reportFoundation();

    const committed = await intake.submit(problemRequestId, validProblemReport(), receivedAt);
    const replayed = await intake.submit(problemRequestId, validProblemReport(), receivedAt);

    expect(replayed).toEqual({ ...committed, state: 'replayed' });
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('rejects changed report content under the same request UUID', async () => {
    const { persistence, intake } = reportFoundation();
    await intake.submit(problemRequestId, validProblemReport(), receivedAt);
    const changed = {
      ...validProblemReport(),
      originalPayload: {
        ...validProblemReport().originalPayload,
        explanation: 'A different explanation under the same request UUID.',
      },
    };

    await expect(intake.submit(problemRequestId, changed, receivedAt)).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('keeps payment and problem report request UUIDs independently idempotent', async () => {
    const { persistence, intake } = reportFoundation();

    await intake.submit(paymentRequestId, validPaymentReport(), receivedAt);
    await intake.submit(problemRequestId, validProblemReport(), receivedAt);

    expect(persistence.snapshot()).toHaveLength(2);
    expect(persistence.snapshot().map((row) => row.submissionType)).toEqual([
      'payment_report',
      'problem_report',
    ]);
  });

  it('runs abuse controls before report parsing and private persistence', async () => {
    const events: string[] = [];
    const persistence = createInMemorySubmissionPersistenceBackend();
    const reportIntake = createReportSubmissionPrivateIntakeService({
      persistence,
      statusSecrets: createHmacSubmissionStatusSecretProvider(hmacKey),
      contactProtector: contactProtector(),
      generateSubmissionId: () => submissionId,
    });
    const controlled = createAbuseControlledSubmissionIntakeService({
      rateLimiter: {
        async consume() {
          events.push('rate-limit');
          return { outcome: 'allow', remaining: 4 };
        },
      },
      challengeVerifier: {
        async verify() {
          events.push('challenge');
          return { outcome: 'allow', reasonCode: 'challenge_verified' };
        },
      },
      intake: {
        async submit(...args) {
          events.push('report-intake');
          return reportIntake.submit(...args);
        },
      },
    });

    await controlled.submit({
      requestId: paymentRequestId,
      challengeToken: 'turnstile-token',
      rateLimitKey: 'rl_abcdefghijklmnop',
      remoteIp: null,
      rawInput: validPaymentReport(),
      receivedAt,
    });

    expect(events).toEqual(['rate-limit', 'challenge', 'report-intake']);
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('does not create canonical, Claim, Evidence, priority, visibility, or publication state', async () => {
    const { persistence, intake } = reportFoundation();
    await intake.submit(problemRequestId, validProblemReport(), receivedAt);
    const stored = persistence.snapshot()[0];
    const serialized = JSON.stringify(stored);

    expect(stored?.workflowStatus).toBe('received');
    expect(serialized).not.toContain('accepted_evidence');
    expect(serialized).not.toContain('claim_status');
    expect(serialized).not.toContain('temporarily_hidden');
    expect(serialized).not.toContain('canonical_update');
    expect(serialized).not.toContain('published');
  });
});
