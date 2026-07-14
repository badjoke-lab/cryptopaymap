import { describe, expect, it } from 'vitest';
import {
  authorizeBusinessClaimVerificationPreparation,
  readBusinessClaimVerificationAuthorizationPolicy,
  type BusinessClaimVerificationPreparationContext,
} from '../src/admin/submissions/business-claim-authorization';
import {
  businessClaimVerificationPreparationReceiptSchema,
  prepareBusinessClaimVerificationRequest,
  type BusinessClaimVerificationPreparationBackend,
  type BusinessClaimVerificationPreparationCommitCommand,
  type BusinessClaimVerificationPreparationEventRecord,
  type BusinessClaimVerificationPreparationState,
} from '../src/admin/submissions/business-claim-verification-preparation';
import { parseBusinessClaimVerificationRequestEventPayload } from '../src/submissions/business-claim-verification-request-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-14T06:00:00.000Z';
const preparedAt = new Date('2026-07-14T06:30:00.000Z');
const context: BusinessClaimVerificationPreparationContext = {
  actorId: 'cloudflare-access:verification-reviewer',
  actorType: 'human',
  capabilities: ['submission:claim-verification:prepare'],
};

function projection(
  verification: Record<string, unknown> = {
    method: 'official_domain_email',
    officialDomain: 'merchant.example',
    protectedContactPresent: true,
    officialWebsiteUrl: null,
    officialSocialUrl: null,
    assistedVerifierReferencePresent: false,
    privateProofPresent: false,
  },
) {
  return {
    targetType: 'entity',
    targetId: entityId,
    claimantRole: 'owner',
    requestedScopes: ['representative_relationship', 'entity_profile'],
    verification,
    proposedChanges: {
      entity: {
        changedFields: ['name'],
        name: 'Example Merchant',
        legalName: null,
        websiteUrl: null,
        countryCode: null,
      },
      location: null,
      paymentProposals: null,
    },
    authorityStatement: 'I am authorized to represent this business.',
    evidenceLinks: [],
  };
}

function backend(initialState: BusinessClaimVerificationPreparationState) {
  const events = new Map<string, BusinessClaimVerificationPreparationEventRecord>();
  const commits: BusinessClaimVerificationPreparationCommitCommand[] = [];
  const service: BusinessClaimVerificationPreparationBackend = {
    async readState() {
      return initialState;
    },
    async readPreparationEvent(eventId) {
      return events.get(eventId) ?? null;
    },
    async commitPreparation(command) {
      commits.push(command);
      events.set(command.eventId, {
        eventId: command.eventId,
        submissionId: command.submissionId,
        fromStatus: null,
        toStatus: 'in_review',
        action: 'claim_verification_request_prepared',
        reasonCode: command.method,
        actorId: command.actorId,
        internalNote: command.internalNote,
        createdAt: command.preparedAt.toISOString(),
      });
    },
  };
  return { service, events, commits };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'business-claim-verification-preparation-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt,
    expectedMethod: 'official_domain_email',
    expiresInHours: 72,
    ...overrides,
  };
}

describe('P5-04E Business Claim verification preparation', () => {
  it('prepares and replays a bounded verification request without protected values', async () => {
    const fixture = backend({
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'in_review',
      updatedAt: expectedUpdatedAt,
      normalizedProjection: projection(),
    });

    const receipt = await prepareBusinessClaimVerificationRequest(
      context,
      fixture.service,
      submissionId,
      request(),
      preparedAt,
    );
    expect(receipt).toEqual({
      state: 'committed',
      submissionId,
      preparationId: requestId,
      targetType: 'entity',
      targetId: entityId,
      method: 'official_domain_email',
      protectedMaterial: {
        protectedContactPresent: true,
        privateProofPresent: false,
        assistedVerifierReferencePresent: false,
      },
      expiresAt: '2026-07-17T06:30:00.000Z',
      preparedAt: preparedAt.toISOString(),
    });
    expect(fixture.commits).toHaveLength(1);

    const eventPayload = parseBusinessClaimVerificationRequestEventPayload(
      fixture.commits[0]?.internalNote ?? null,
    );
    expect(eventPayload).toMatchObject({
      preparationId: requestId,
      expectedUpdatedAt,
      officialDomain: 'merchant.example',
      protectedContactPresent: true,
    });
    expect(JSON.stringify(receipt)).not.toContain('merchant.example');
    expect(JSON.stringify(receipt)).not.toContain('@');

    const replay = await prepareBusinessClaimVerificationRequest(
      context,
      fixture.service,
      submissionId,
      request(),
      preparedAt,
    );
    expect(replay.state).toBe('replayed');
    expect(fixture.commits).toHaveLength(1);
  });

  it('requires exact Claim state, method, and method-specific protected prerequisites', async () => {
    const stale = backend({
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'triage',
      updatedAt: expectedUpdatedAt,
      normalizedProjection: projection(),
    });
    await expect(
      prepareBusinessClaimVerificationRequest(
        context,
        stale.service,
        submissionId,
        request(),
        preparedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    const methodMismatch = backend({
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'in_review',
      updatedAt: expectedUpdatedAt,
      normalizedProjection: projection({
        method: 'dns_txt',
        officialDomain: 'merchant.example',
        protectedContactPresent: false,
        officialWebsiteUrl: null,
        officialSocialUrl: null,
        assistedVerifierReferencePresent: false,
        privateProofPresent: false,
      }),
    });
    await expect(
      prepareBusinessClaimVerificationRequest(
        context,
        methodMismatch.service,
        submissionId,
        request(),
        preparedAt,
      ),
    ).rejects.toMatchObject({ code: 'method_mismatch' });

    const missingContact = backend({
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'in_review',
      updatedAt: expectedUpdatedAt,
      normalizedProjection: projection({
        method: 'official_domain_email',
        officialDomain: 'merchant.example',
        protectedContactPresent: false,
        officialWebsiteUrl: null,
        officialSocialUrl: null,
        assistedVerifierReferencePresent: false,
        privateProofPresent: false,
      }),
    });
    await expect(
      prepareBusinessClaimVerificationRequest(
        context,
        missingContact.service,
        submissionId,
        request(),
        preparedAt,
      ),
    ).rejects.toMatchObject({ code: 'prerequisite_missing' });
  });

  it('rejects unauthorized callers, changed replay content, and protected output fields', async () => {
    const fixture = backend({
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'in_review',
      updatedAt: expectedUpdatedAt,
      normalizedProjection: projection(),
    });
    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as BusinessClaimVerificationPreparationContext;
    await expect(
      prepareBusinessClaimVerificationRequest(
        unauthorized,
        fixture.service,
        submissionId,
        request(),
        preparedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    await prepareBusinessClaimVerificationRequest(
      context,
      fixture.service,
      submissionId,
      request(),
      preparedAt,
    );
    await expect(
      prepareBusinessClaimVerificationRequest(
        context,
        fixture.service,
        submissionId,
        request({ expiresInHours: 24 }),
        preparedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });

    const valid = await prepareBusinessClaimVerificationRequest(
      context,
      fixture.service,
      submissionId,
      request(),
      preparedAt,
    );
    expect(
      businessClaimVerificationPreparationReceiptSchema.safeParse({
        ...valid,
        contactEmail: 'owner@merchant.example',
        privateProofUrl: 'https://private.example/proof',
        assistedVerifierReference: 'private-reference',
        providerCredential: 'secret',
      }).success,
    ).toBe(false);
  });

  it('uses an exact dedicated allowlist for preparation authorization', () => {
    const policy = readBusinessClaimVerificationAuthorizationPolicy({
      CPM_ADMIN_CLAIM_VERIFICATION_PREPARE_SUBJECTS: JSON.stringify([
        'claim-verification-reviewer',
      ]),
    });
    const authorized = authorizeBusinessClaimVerificationPreparation(
      {
        actorId: 'cloudflare-access:claim-verification-reviewer',
        actorType: 'human',
        subject: 'claim-verification-reviewer',
        email: null,
      },
      policy,
    );
    expect(authorized.capabilities).toEqual(['submission:claim-verification:prepare']);

    expect(() =>
      authorizeBusinessClaimVerificationPreparation(
        {
          actorId: 'cloudflare-access:other-reviewer',
          actorType: 'human',
          subject: 'other-reviewer',
          email: null,
        },
        policy,
      ),
    ).toThrowError(/not authorized/);
  });
});
