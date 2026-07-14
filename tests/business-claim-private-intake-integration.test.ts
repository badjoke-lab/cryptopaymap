import { describe, expect, it, vi } from 'vitest';
import { createAbuseControlledSubmissionIntakeService } from '../src/submissions/abuse-controlled-intake';
import { createBusinessClaimPrivateIntakeService } from '../src/submissions/business-claim-intake-service';
import type { SubmissionContactProtector } from '../src/submissions/contact-protection';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const requestId = '20000000-0000-4000-8000-000000000001';
const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '30000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-13T00:00:00.000Z');
const hmacKey = new Uint8Array(32).fill(11);

function validBusinessClaim() {
  return {
    schemaVersion: 'submission-common-v1' as const,
    submissionType: 'claim' as const,
    targetType: 'entity' as const,
    targetId,
    relationship: 'owner_or_authorized_representative' as const,
    contact: {
      email: 'representative@merchant.example',
      contactAllowed: true,
    },
    evidenceLinks: [
      {
        url: 'https://merchant.example/about',
        observedAt: '2026-07-13',
        summary: 'Public business identity page for reviewer comparison.',
      },
    ],
    originalPayload: {
      schemaVersion: 'business-claim-v1' as const,
      claimantRole: 'authorized_representative' as const,
      requestedScopes: ['representative_relationship', 'entity_profile'] as const,
      verification: {
        method: 'official_domain_email' as const,
        officialDomain: 'merchant.example',
        officialWebsiteUrl: 'https://merchant.example',
        officialSocialUrl: null,
        assistedVerifierReference: 'assisted-case-123',
        privateProofUrl: 'https://evidence.example/private-authority-proof',
      },
      proposedChanges: {
        entity: {
          changedFields: ['name', 'legalName', 'websiteUrl', 'countryCode'] as const,
          name: 'Merchant Example',
          legalName: 'Merchant Example Incorporated',
          websiteUrl: 'https://merchant.example',
          countryCode: 'JP',
        },
        location: null,
        paymentProposals: null,
      },
      authorityStatement: 'I am authorized to verify and maintain this business profile.',
    },
    acknowledgements: {
      privacyNoticeAccepted: true as const,
      submissionTermsAccepted: true as const,
    },
  };
}

function contactProtector(protectEmail = vi.fn()): SubmissionContactProtector {
  return {
    async protectEmail(email, received) {
      protectEmail(email, received);
      return {
        encryptedEmail: 'encrypted-claim-contact',
        emailHash: 'e'.repeat(64),
        retentionUntil: null,
      };
    },
  };
}

function claimFoundation(protector = contactProtector()) {
  const persistence = createInMemorySubmissionPersistenceBackend();
  const intake = createBusinessClaimPrivateIntakeService({
    persistence,
    statusSecrets: createHmacSubmissionStatusSecretProvider(hmacKey),
    contactProtector: protector,
    generateSubmissionId: () => submissionId,
  });
  return { persistence, intake };
}

describe('P5-04B business claim private intake integration', () => {
  it('stores private Claim material and a review-safe normalized projection', async () => {
    const { persistence, intake } = claimFoundation();
    const claim = validBusinessClaim();

    const receipt = await intake.submit(requestId, claim, receivedAt);
    const stored = persistence.snapshot()[0];

    expect(receipt.state).toBe('committed');
    expect(stored).toMatchObject({
      workflowStatus: 'received',
      originalPayload: {
        originalPayload: claim.originalPayload,
        evidenceLinks: claim.evidenceLinks,
        acknowledgements: claim.acknowledgements,
      },
      normalizedPayload: {
        targetType: 'entity',
        targetId,
        claimantRole: 'authorized_representative',
        requestedScopes: ['representative_relationship', 'entity_profile'],
        verification: {
          method: 'official_domain_email',
          officialDomain: 'merchant.example',
          protectedContactPresent: true,
          officialWebsiteUrl: 'https://merchant.example',
          assistedVerifierReferencePresent: true,
          privateProofPresent: true,
        },
      },
    });

    const privatePayload = JSON.stringify(stored?.originalPayload);
    const normalized = JSON.stringify(stored?.normalizedPayload);
    expect(privatePayload).not.toContain('representative@merchant.example');
    expect(normalized).not.toContain('representative@merchant.example');
    expect(normalized).not.toContain('private-authority-proof');
    expect(normalized).not.toContain('encrypted-claim-contact');
    expect(normalized).not.toContain('assisted-case-123');
    expect(normalized).not.toContain('privateProofUrl');
  });

  it('protects Claim contact outside original and normalized payloads', async () => {
    const protectEmail = vi.fn();
    const { persistence, intake } = claimFoundation(contactProtector(protectEmail));

    await intake.submit(requestId, validBusinessClaim(), receivedAt);
    const stored = persistence.snapshot()[0];

    expect(protectEmail).toHaveBeenCalledWith('representative@merchant.example', receivedAt);
    expect(stored?.contact).toMatchObject({
      encryptedEmail: 'encrypted-claim-contact',
      emailHash: 'e'.repeat(64),
      contactAllowed: true,
    });
    expect(JSON.stringify(stored?.originalPayload)).not.toContain(
      'representative@merchant.example',
    );
    expect(JSON.stringify(stored?.normalizedPayload)).not.toContain(
      'representative@merchant.example',
    );
  });

  it('rejects an official-domain email mismatch before contact protection or persistence', async () => {
    const protectEmail = vi.fn();
    const { persistence, intake } = claimFoundation(contactProtector(protectEmail));
    const invalid = validBusinessClaim();
    invalid.contact.email = 'person@unrelated.example';

    await expect(intake.submit(requestId, invalid, receivedAt)).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(protectEmail).not.toHaveBeenCalled();
    expect(persistence.snapshot()).toHaveLength(0);
  });

  it('rejects official-domain verification without permitted follow-up contact', async () => {
    const protectEmail = vi.fn();
    const { persistence, intake } = claimFoundation(contactProtector(protectEmail));
    const invalid = validBusinessClaim();
    invalid.contact.contactAllowed = false;

    await expect(intake.submit(requestId, invalid, receivedAt)).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(protectEmail).not.toHaveBeenCalled();
    expect(persistence.snapshot()).toHaveLength(0);
  });

  it('replays identical Claim intake without adding another private row', async () => {
    const { persistence, intake } = claimFoundation();

    const committed = await intake.submit(requestId, validBusinessClaim(), receivedAt);
    const replayed = await intake.submit(requestId, validBusinessClaim(), receivedAt);

    expect(replayed).toEqual({ ...committed, state: 'replayed' });
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('rejects changed Claim content under the same request UUID', async () => {
    const { persistence, intake } = claimFoundation();
    await intake.submit(requestId, validBusinessClaim(), receivedAt);
    const changed = validBusinessClaim();
    changed.originalPayload.authorityStatement =
      'A different authority statement under the same request UUID.';

    await expect(intake.submit(requestId, changed, receivedAt)).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('runs abuse controls before Claim parsing and private persistence', async () => {
    const events: string[] = [];
    const persistence = createInMemorySubmissionPersistenceBackend();
    const claimIntake = createBusinessClaimPrivateIntakeService({
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
          events.push('claim-intake');
          return claimIntake.submit(...args);
        },
      },
    });

    await controlled.submit({
      requestId,
      challengeToken: 'turnstile-token',
      rateLimitKey: 'rl_abcdefghijklmnop',
      remoteIp: null,
      rawInput: validBusinessClaim(),
      receivedAt,
    });

    expect(events).toEqual(['rate-limit', 'challenge', 'claim-intake']);
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it('does not create verified authority, editing rights, canonical, export, or publication state', async () => {
    const { persistence, intake } = claimFoundation();
    await intake.submit(requestId, validBusinessClaim(), receivedAt);
    const stored = persistence.snapshot()[0];
    const serialized = JSON.stringify(stored);

    expect(stored?.workflowStatus).toBe('received');
    expect(serialized).not.toContain('relationship_verified');
    expect(serialized).not.toContain('editing_granted');
    expect(serialized).not.toContain('canonical_update');
    expect(serialized).not.toContain('exported');
    expect(serialized).not.toContain('published');
  });
});
