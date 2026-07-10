import { describe, expect, it, vi } from 'vitest';
import { createAbuseControlledSubmissionIntakeService } from '../src/submissions/abuse-controlled-intake';
import type { SubmissionContactProtector } from '../src/submissions/contact-protection';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createSubmissionPrivateIntakeService } from '../src/submissions/intake-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';
import { createSuggestSubmissionPrivateIntakeService } from '../src/submissions/suggest-intake-service';

const requestId = '20000000-0000-4000-8000-000000000001';
const submissionId = '10000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-10T00:00:00.000Z');
const hmacKey = new Uint8Array(32).fill(7);

function validSuggest() {
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
      schemaVersion: 'suggest-v1',
      suggestionKind: 'physical_place',
      entity: {
        name: 'Example Coffee',
        legalName: null,
        websiteUrl: 'https://coffee.example/',
        countryCode: 'jp',
      },
      place: {
        branchName: 'Shibuya',
        addressLine: '1-2-3 Jingumae',
        locality: 'Shibuya',
        region: 'Tokyo',
        postalCode: '150-0001',
        countryCode: 'jp',
        latitude: null,
        longitude: null,
        websiteUrl: null,
        phone: null,
        description: null,
        openingHours: null,
        amenities: ['wifi', 'wifi'],
        socialLinks: [],
      },
      categories: [],
      paymentProposals: [
        {
          assetSlug: 'usdt',
          networkSlug: null,
          routeType: null,
          paymentMethod: null,
          processor: null,
          contractAddress: null,
          howToPay: 'The merchant says USDT is accepted; network is not confirmed.',
          restrictions: null,
          isPrimary: false,
        },
      ],
      observedAt: '2026-07-01',
    },
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

function contactProtector(protectEmail = vi.fn()) : SubmissionContactProtector {
  return {
    async protectEmail(email, received) {
      protectEmail(email, received);
      return {
        encryptedEmail: 'ciphertext-envelope',
        emailHash: 'c'.repeat(64),
        retentionUntil: null,
      };
    },
  };
}

function specializedFoundation(protector = contactProtector()) {
  const persistence = createInMemorySubmissionPersistenceBackend();
  const intake = createSuggestSubmissionPrivateIntakeService({
    persistence,
    statusSecrets: createHmacSubmissionStatusSecretProvider(hmacKey),
    contactProtector: protector,
    generateSubmissionId: () => submissionId,
  });
  return { persistence, intake };
}

describe('P5-02B Suggest private intake integration', () => {
  it('strictly parses Suggest input and atomically stores original plus review-safe normalized payload', async () => {
    const { persistence, intake } = specializedFoundation();

    const receipt = await intake.submit(requestId, validSuggest(), receivedAt);
    const stored = persistence.snapshot()[0];

    expect(receipt.state).toBe('committed');
    expect(stored).toMatchObject({
      workflowStatus: 'received',
      originalPayload: {
        originalPayload: validSuggest().originalPayload,
        evidenceLinks: validSuggest().evidenceLinks,
        acknowledgements: validSuggest().acknowledgements,
      },
      normalizedPayload: {
        suggestionKind: 'physical_place',
        entityType: 'merchant',
        entity: {
          name: 'Example Coffee',
          countryCode: 'JP',
        },
        place: {
          countryCode: 'JP',
          amenities: ['wifi'],
          latitude: null,
          longitude: null,
        },
        categories: [],
        paymentProposals: [
          {
            assetSlug: 'usdt',
            networkSlug: null,
            routeType: null,
            paymentMethod: null,
          },
        ],
        relationship: 'customer',
      },
    });
    expect(JSON.stringify(stored?.normalizedPayload)).not.toContain('person@example.test');
    expect(JSON.stringify(stored?.normalizedPayload)).not.toContain('ciphertext-envelope');
  });

  it('rejects type-specific invalid Suggest before contact protection or persistence', async () => {
    const protectEmail = vi.fn();
    const { persistence, intake } = specializedFoundation(contactProtector(protectEmail));
    const invalid = {
      ...validSuggest(),
      originalPayload: {
        ...validSuggest().originalPayload,
        suggestionKind: 'online_service',
        place: null,
        entity: {
          ...validSuggest().originalPayload.entity,
          websiteUrl: null,
        },
      },
    };

    await expect(intake.submit(requestId, invalid, receivedAt)).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(protectEmail).not.toHaveBeenCalled();
    expect(persistence.snapshot()).toHaveLength(0);
  });

  it('replays identical Suggest intake without creating another normalized payload row', async () => {
    const { persistence, intake } = specializedFoundation();

    const committed = await intake.submit(requestId, validSuggest(), receivedAt);
    const replayed = await intake.submit(requestId, validSuggest(), receivedAt);

    expect(replayed).toEqual({ ...committed, state: 'replayed' });
    expect(persistence.snapshot()).toHaveLength(1);
    expect(persistence.snapshot()[0]?.normalizedPayload).not.toBeNull();
  });

  it('rejects changed Suggest content under the same request UUID', async () => {
    const { persistence, intake } = specializedFoundation();
    await intake.submit(requestId, validSuggest(), receivedAt);

    const changed = {
      ...validSuggest(),
      originalPayload: {
        ...validSuggest().originalPayload,
        entity: {
          ...validSuggest().originalPayload.entity,
          name: 'Different Coffee',
        },
      },
    };

    await expect(intake.submit(requestId, changed, receivedAt)).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('runs abuse controls before Suggest parsing and private persistence', async () => {
    const events: string[] = [];
    const persistence = createInMemorySubmissionPersistenceBackend();
    const suggestIntake = createSuggestSubmissionPrivateIntakeService({
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
          events.push('suggest-intake');
          return suggestIntake.submit(...args);
        },
      },
    });

    await controlled.submit({
      requestId,
      challengeToken: 'turnstile-token',
      rateLimitKey: 'rl_abcdefghijklmnop',
      remoteIp: null,
      rawInput: validSuggest(),
      receivedAt,
    });

    expect(events).toEqual(['rate-limit', 'challenge', 'suggest-intake']);
    expect(persistence.snapshot()).toHaveLength(1);
    expect(persistence.snapshot()[0]?.normalizedPayload).not.toBeNull();
  });

  it('keeps the generic P5-01 intake path backward compatible with no normalized payload', async () => {
    const persistence = createInMemorySubmissionPersistenceBackend();
    const intake = createSubmissionPrivateIntakeService({
      persistence,
      statusSecrets: createHmacSubmissionStatusSecretProvider(hmacKey),
      contactProtector: contactProtector(),
      generateSubmissionId: () => submissionId,
    });

    await intake.submit(
      requestId,
      {
        schemaVersion: 'submission-common-v1',
        submissionType: 'suggest',
        targetType: null,
        targetId: null,
        relationship: 'customer',
        contact: null,
        evidenceLinks: [],
        originalPayload: { name: 'Generic fixture' },
        acknowledgements: {
          privacyNoticeAccepted: true,
          submissionTermsAccepted: true,
        },
      },
      receivedAt,
    );

    expect(persistence.snapshot()[0]?.normalizedPayload).toBeNull();
  });
});
