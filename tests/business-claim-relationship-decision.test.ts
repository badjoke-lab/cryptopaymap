import { describe, expect, it } from 'vitest';
import {
  authorizeBusinessClaimRelationshipDecision,
  readBusinessClaimRelationshipDecisionAuthorizationPolicy,
  type BusinessClaimRelationshipDecisionContext,
} from '../src/admin/submissions/business-claim-relationship-decision-authorization';
import {
  businessClaimRelationshipDecisionReceiptSchema,
  decideBusinessClaimRepresentativeRelationship,
  type BusinessClaimRelationshipDecisionBackend,
  type BusinessClaimRelationshipDecisionCommitCommand,
  type BusinessClaimRelationshipDecisionEventRecord,
  type BusinessClaimRelationshipDecisionState,
} from '../src/admin/submissions/business-claim-relationship-decision';
import { serializeBusinessClaimVerificationRequestEventPayload } from '../src/submissions/business-claim-verification-request-contract';
import { serializeBusinessClaimVerificationResultEventPayload } from '../src/submissions/business-claim-verification-result-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const preparationId = '30000000-0000-4000-8000-000000000001';
const executionId = '40000000-0000-4000-8000-000000000001';
const decisionId = '50000000-0000-4000-8000-000000000001';
const submissionUpdatedAt = '2026-07-14T07:30:00.000Z';
const verificationObservedAt = '2026-07-14T07:29:00.000Z';
const preparationExpiresAt = '2026-07-17T07:00:00.000Z';
const decidedAt = new Date('2026-07-14T08:00:00.000Z');

const context: BusinessClaimRelationshipDecisionContext = {
  actorId: 'cloudflare-access:relationship-decider',
  actorType: 'human',
  capabilities: ['submission:claim-relationship:decide'],
};

type Outcome = 'passed' | 'failed' | 'inconclusive' | 'provider_error';

interface StateOptions {
  outcome?: Outcome;
  projectionValue?: unknown;
  expiresAt?: string;
  updatedAt?: string;
}

interface RequestOptions {
  decision?: 'approve_relationship' | 'not_approved';
  outcome?: Outcome;
  expiresAt?: string;
  overrides?: Record<string, unknown>;
}

function resultCode(outcome: Outcome): string {
  return outcome === 'passed' ? 'challenge_confirmed' : `${outcome}_result`;
}

function projection(requestedScopes: string[] = ['representative_relationship']) {
  return {
    targetType: 'entity',
    targetId,
    claimantRole: 'owner',
    requestedScopes,
    verification: {
      method: 'dns_txt',
      officialDomain: 'merchant.example',
      protectedContactPresent: false,
      officialWebsiteUrl: null,
      officialSocialUrl: null,
      assistedVerifierReferencePresent: false,
      privateProofPresent: false,
    },
    proposedChanges: { entity: null, location: null, paymentProposals: null },
    authorityStatement: 'I am authorized to represent this business.',
    evidenceLinks: [],
  };
}

function preparationEvent(expiresAt: string): BusinessClaimRelationshipDecisionEventRecord {
  return {
    eventId: preparationId,
    submissionId,
    fromStatus: null,
    toStatus: 'in_review',
    action: 'claim_verification_request_prepared',
    reasonCode: 'dns_txt',
    actorId: 'cloudflare-access:preparer',
    internalNote: serializeBusinessClaimVerificationRequestEventPayload({
      schemaVersion: 'business-claim-verification-request-event-v1',
      preparationId,
      expectedUpdatedAt: '2026-07-14T07:00:00.000Z',
      targetType: 'entity',
      targetId,
      method: 'dns_txt',
      officialDomain: 'merchant.example',
      officialWebsiteUrl: null,
      officialSocialUrl: null,
      protectedContactPresent: false,
      privateProofPresent: false,
      assistedVerifierReferencePresent: false,
      expiresInHours: 72,
      expiresAt,
    }),
    createdAt: '2026-07-14T07:00:00.000Z',
  };
}

function executionEvent(
  outcome: Outcome,
  expiresAt: string,
): BusinessClaimRelationshipDecisionEventRecord {
  return {
    eventId: executionId,
    submissionId,
    fromStatus: null,
    toStatus: 'in_review',
    action: 'claim_verification_execution_recorded',
    reasonCode: outcome,
    actorId: 'cloudflare-access:executor',
    internalNote: serializeBusinessClaimVerificationResultEventPayload({
      schemaVersion: 'business-claim-verification-result-event-v1',
      executionId,
      preparationId,
      expectedSubmissionUpdatedAt: '2026-07-14T07:00:00.000Z',
      expectedPreparationExpiresAt: expiresAt,
      targetType: 'entity',
      targetId,
      method: 'dns_txt',
      adapterId: 'dns-adapter',
      adapterVersion: '1.0.0',
      outcome,
      resultCode: resultCode(outcome),
      observedAt: verificationObservedAt,
      retryable: outcome === 'provider_error',
      summary: 'Bounded verification result.',
      providerReferenceHash: `sha256:${'a'.repeat(64)}`,
    }),
    createdAt: submissionUpdatedAt,
  };
}

function state(options: StateOptions = {}): BusinessClaimRelationshipDecisionState {
  const outcome = options.outcome ?? 'passed';
  const expiresAt = options.expiresAt ?? preparationExpiresAt;
  return {
    submissionId,
    submissionType: 'claim',
    workflowStatus: 'in_review',
    updatedAt: options.updatedAt ?? submissionUpdatedAt,
    normalizedProjection: options.projectionValue ?? projection(),
    executionEvent: executionEvent(outcome, expiresAt),
    preparationEvent: preparationEvent(expiresAt),
  };
}

function backend(initialState: BusinessClaimRelationshipDecisionState) {
  const events = new Map<string, BusinessClaimRelationshipDecisionEventRecord>();
  const commits: BusinessClaimRelationshipDecisionCommitCommand[] = [];
  const service: BusinessClaimRelationshipDecisionBackend = {
    async readState() {
      return initialState;
    },
    async readDecisionEvent(id) {
      return events.get(id) ?? null;
    },
    async commitDecision(command) {
      commits.push(command);
      events.set(command.eventId, {
        eventId: command.eventId,
        submissionId: command.submissionId,
        fromStatus: 'in_review',
        toStatus: 'resolved',
        action: command.eventAction,
        reasonCode: command.reasonCode,
        actorId: command.actorId,
        internalNote: command.internalNote,
        createdAt: command.decidedAt.toISOString(),
      });
    },
  };
  return { service, commits };
}

function request(options: RequestOptions = {}) {
  const decision = options.decision ?? 'approve_relationship';
  const outcome = options.outcome ?? 'passed';
  const reasonCode =
    decision === 'approve_relationship'
      ? 'verified_authority_confirmed'
      : outcome === 'failed'
        ? 'verification_failed'
        : outcome === 'inconclusive'
          ? 'verification_inconclusive'
          : outcome === 'provider_error'
            ? 'provider_error'
            : 'authority_not_established';
  return {
    schemaVersion: 'business-claim-relationship-decision-v1',
    decisionId,
    executionId,
    preparationId,
    expectedSubmissionUpdatedAt: submissionUpdatedAt,
    expectedTargetType: 'entity',
    expectedTargetId: targetId,
    expectedClaimantRole: 'owner',
    expectedMethod: 'dns_txt',
    expectedOutcome: outcome,
    expectedResultCode: resultCode(outcome),
    expectedVerificationObservedAt: verificationObservedAt,
    expectedPreparationExpiresAt: options.expiresAt ?? preparationExpiresAt,
    decision,
    reasonCode,
    ...options.overrides,
  };
}

describe('P5-04G Business Claim relationship decisions', () => {
  it('approves one exact passed result into a private active relationship and replays it', async () => {
    const fixture = backend(state());
    const receipt = await decideBusinessClaimRepresentativeRelationship(
      context,
      fixture.service,
      submissionId,
      request(),
      decidedAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      decision: 'approve_relationship',
      resolution: 'approved',
      targetId,
      claimantRole: 'owner',
      executionOutcome: 'passed',
      relationship: {
        relationshipId: decisionId,
        status: 'active',
        approvedScope: 'representative_relationship',
        preparationId,
        executionId,
      },
    });
    expect(fixture.commits[0]).toMatchObject({
      resolution: 'approved',
      eventAction: 'business_claim_relationship_approved',
    });
    expect(JSON.stringify(receipt)).not.toContain('merchant.example');
    expect(JSON.stringify(receipt)).not.toContain('providerReferenceHash');
    expect(fixture.commits).toHaveLength(1);

    const replay = await decideBusinessClaimRepresentativeRelationship(
      context,
      fixture.service,
      submissionId,
      request(),
      decidedAt,
    );
    expect(replay.state).toBe('replayed');
    expect(fixture.commits).toHaveLength(1);
  });

  it('records a non-approval without creating a relationship', async () => {
    const fixture = backend(state({ outcome: 'failed' }));
    const receipt = await decideBusinessClaimRepresentativeRelationship(
      context,
      fixture.service,
      submissionId,
      request({ decision: 'not_approved', outcome: 'failed' }),
      decidedAt,
    );

    expect(receipt).toMatchObject({
      decision: 'not_approved',
      resolution: 'not_approved',
      reasonCode: 'verification_failed',
      executionOutcome: 'failed',
      relationship: null,
    });
    expect(fixture.commits[0]).toMatchObject({
      resolution: 'not_approved',
      eventAction: 'business_claim_relationship_not_approved',
    });
  });

  it('rejects non-passed approval and stale, expired, mismatched, or malformed chains', async () => {
    await expect(
      decideBusinessClaimRepresentativeRelationship(
        context,
        backend(state({ outcome: 'failed' })).service,
        submissionId,
        request({
          outcome: 'failed',
          overrides: { reasonCode: 'verified_authority_confirmed' },
        }),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });

    await expect(
      decideBusinessClaimRepresentativeRelationship(
        context,
        backend(state({ updatedAt: '2026-07-14T07:31:00.000Z' })).service,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    const expiredAt = '2026-07-14T07:59:00.000Z';
    await expect(
      decideBusinessClaimRepresentativeRelationship(
        context,
        backend(state({ expiresAt: expiredAt })).service,
        submissionId,
        request({ expiresAt: expiredAt }),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'preparation_expired' });

    await expect(
      decideBusinessClaimRepresentativeRelationship(
        context,
        backend(state()).service,
        submissionId,
        request({ overrides: { expectedTargetId: decisionId } }),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    await expect(
      decideBusinessClaimRepresentativeRelationship(
        context,
        backend(state({ projectionValue: { broken: true } })).service,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_projection' });

    await expect(
      decideBusinessClaimRepresentativeRelationship(
        context,
        backend(state({ projectionValue: projection(['entity_profile']) })).service,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_projection' });
  });

  it('rejects unauthorized decisions and changed-content replay', async () => {
    const fixture = backend(state());
    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as BusinessClaimRelationshipDecisionContext;
    await expect(
      decideBusinessClaimRepresentativeRelationship(
        unauthorized,
        fixture.service,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    await decideBusinessClaimRepresentativeRelationship(
      context,
      fixture.service,
      submissionId,
      request(),
      decidedAt,
    );
    await expect(
      decideBusinessClaimRepresentativeRelationship(
        context,
        fixture.service,
        submissionId,
        request({ overrides: { expectedResultCode: 'changed-result' } }),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('rejects protected or permission material in the strict receipt', async () => {
    const receipt = await decideBusinessClaimRepresentativeRelationship(
      context,
      backend(state()).service,
      submissionId,
      request(),
      decidedAt,
    );
    expect(
      businessClaimRelationshipDecisionReceiptSchema.safeParse({
        ...receipt,
        contactEmail: 'owner@merchant.example',
        privateProofUrl: 'https://private.example/proof',
        assistedVerifierReference: 'private-reference',
        editingPermission: true,
        accountId: 'owner-account',
        rawProviderResponse: {},
      }).success,
    ).toBe(false);
  });

  it('uses an exact dedicated allowlist for relationship decisions', () => {
    const policy = readBusinessClaimRelationshipDecisionAuthorizationPolicy({
      CPM_ADMIN_CLAIM_RELATIONSHIP_DECISION_SUBJECTS: JSON.stringify(['relationship-decider']),
    });
    const authorized = authorizeBusinessClaimRelationshipDecision(
      {
        actorId: 'cloudflare-access:relationship-decider',
        actorType: 'human',
        subject: 'relationship-decider',
        email: null,
      },
      policy,
    );
    expect(authorized.capabilities).toEqual(['submission:claim-relationship:decide']);

    expect(() =>
      authorizeBusinessClaimRelationshipDecision(
        {
          actorId: 'cloudflare-access:verification-executor',
          actorType: 'human',
          subject: 'verification-executor',
          email: null,
        },
        policy,
      ),
    ).toThrowError(/not authorized/);
  });
});
