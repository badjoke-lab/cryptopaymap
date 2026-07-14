import { describe, expect, it } from 'vitest';
import {
  authorizeBusinessClaimVerificationExecution,
  readBusinessClaimVerificationExecutionAuthorizationPolicy,
  type BusinessClaimVerificationExecutionContext,
} from '../src/admin/submissions/business-claim-verification-execution-authorization';
import {
  businessClaimVerificationExecutionReceiptSchema,
  createBusinessClaimVerificationAdapterRegistry,
  executeBusinessClaimVerification,
  type BusinessClaimVerificationExecutionBackend,
  type BusinessClaimVerificationExecutionEventRecord,
  type BusinessClaimVerificationExecutionState,
  type BusinessClaimVerificationResultCommitCommand,
  type BusinessClaimVerificationMethodAdapter,
} from '../src/admin/submissions/business-claim-verification-execution';
import { serializeBusinessClaimVerificationRequestEventPayload } from '../src/submissions/business-claim-verification-request-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const preparationId = '30000000-0000-4000-8000-000000000001';
const executionId = '40000000-0000-4000-8000-000000000001';
const submissionUpdatedAt = '2026-07-14T07:00:00.000Z';
const preparationExpiresAt = '2026-07-17T07:00:00.000Z';
const executedAt = new Date('2026-07-14T07:30:00.000Z');
const context: BusinessClaimVerificationExecutionContext = {
  actorId: 'cloudflare-access:verification-executor',
  actorType: 'human',
  capabilities: ['submission:claim-verification:execute'],
};

type VerificationMethod =
  | 'official_domain_email'
  | 'website_code'
  | 'dns_txt'
  | 'official_social'
  | 'assisted_verification';

function preparationPayload(method: VerificationMethod, expiresAt = preparationExpiresAt) {
  return {
    schemaVersion: 'business-claim-verification-request-event-v1' as const,
    preparationId,
    expectedUpdatedAt: '2026-07-14T06:00:00.000Z',
    targetType: 'entity' as const,
    targetId,
    method,
    officialDomain:
      method === 'official_domain_email' || method === 'dns_txt' ? 'merchant.example' : null,
    officialWebsiteUrl: method === 'website_code' ? 'https://merchant.example/verify' : null,
    officialSocialUrl: method === 'official_social' ? 'https://social.example/merchant' : null,
    protectedContactPresent: method === 'official_domain_email',
    privateProofPresent: false,
    assistedVerifierReferencePresent: method === 'assisted_verification',
    expiresInHours: 72 as const,
    expiresAt,
  };
}

function state(
  method: VerificationMethod,
  expiresAt = preparationExpiresAt,
): BusinessClaimVerificationExecutionState {
  return {
    submissionId,
    submissionType: 'claim',
    workflowStatus: 'in_review',
    updatedAt: submissionUpdatedAt,
    preparationEvent: {
      eventId: preparationId,
      submissionId,
      fromStatus: null,
      toStatus: 'in_review',
      action: 'claim_verification_request_prepared',
      reasonCode: method,
      internalNote: serializeBusinessClaimVerificationRequestEventPayload(
        preparationPayload(method, expiresAt),
      ),
      createdAt: submissionUpdatedAt,
    },
  };
}

function backend(initialState: BusinessClaimVerificationExecutionState) {
  const events = new Map<string, BusinessClaimVerificationExecutionEventRecord>();
  const commits: BusinessClaimVerificationResultCommitCommand[] = [];
  const service: BusinessClaimVerificationExecutionBackend = {
    async readState() {
      return initialState;
    },
    async readExecutionEvent(id) {
      return events.get(id) ?? null;
    },
    async commitResult(command) {
      commits.push(command);
      events.set(command.eventId, {
        eventId: command.eventId,
        submissionId: command.submissionId,
        fromStatus: null,
        toStatus: 'in_review',
        action: 'claim_verification_execution_recorded',
        reasonCode: command.outcome,
        actorId: command.actorId,
        internalNote: command.internalNote,
        createdAt: command.executedAt.toISOString(),
      });
    },
  };
  return { service, events, commits };
}

function adapter(
  method: VerificationMethod,
  result: unknown,
): BusinessClaimVerificationMethodAdapter {
  return {
    method,
    adapterId: `test-${method}`,
    adapterVersion: '1.0.0',
    async execute() {
      return result;
    },
  };
}

function request(method: VerificationMethod, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'business-claim-verification-execution-v1',
    executionId,
    preparationId,
    expectedSubmissionUpdatedAt: submissionUpdatedAt,
    expectedMethod: method,
    expectedPreparationExpiresAt: preparationExpiresAt,
    ...overrides,
  };
}

const safeAdapterResult = {
  outcome: 'passed' as const,
  resultCode: 'challenge_confirmed',
  observedAt: '2026-07-14T07:29:00.000Z',
  retryable: false,
  summary: 'The prepared verification challenge was confirmed.',
  providerReferenceHash: `sha256:${'a'.repeat(64)}`,
};

describe('P5-04F Business Claim verification execution', () => {
  for (const method of [
    'official_domain_email',
    'website_code',
    'dns_txt',
    'official_social',
    'assisted_verification',
  ] as const) {
    it(`executes and replays the ${method} adapter`, async () => {
      const fixture = backend(state(method));
      const registry = createBusinessClaimVerificationAdapterRegistry([
        adapter(method, safeAdapterResult),
      ]);

      const receipt = await executeBusinessClaimVerification(
        context,
        fixture.service,
        registry,
        submissionId,
        request(method),
        executedAt,
      );

      expect(receipt).toMatchObject({
        state: 'committed',
        submissionId,
        executionId,
        preparationId,
        targetId,
        method,
        outcome: 'passed',
        resultCode: 'challenge_confirmed',
        adapterId: `test-${method}`,
        adapterVersion: '1.0.0',
      });
      expect(JSON.stringify(receipt)).not.toContain('merchant.example');
      expect(JSON.stringify(receipt)).not.toContain('providerReferenceHash');
      expect(fixture.commits).toHaveLength(1);

      const replay = await executeBusinessClaimVerification(
        context,
        fixture.service,
        registry,
        submissionId,
        request(method),
        executedAt,
      );
      expect(replay.state).toBe('replayed');
      expect(fixture.commits).toHaveLength(1);
    });
  }

  it('rejects expired, stale, mismatched, and unavailable preparations', async () => {
    const registry = createBusinessClaimVerificationAdapterRegistry([
      adapter('dns_txt', safeAdapterResult),
    ]);

    await expect(
      executeBusinessClaimVerification(
        context,
        backend(state('dns_txt', '2026-07-14T07:00:00.000Z')).service,
        registry,
        submissionId,
        request('dns_txt', {
          expectedPreparationExpiresAt: '2026-07-14T07:00:00.000Z',
        }),
        executedAt,
      ),
    ).rejects.toMatchObject({ code: 'preparation_expired' });

    const staleState = state('dns_txt');
    staleState.updatedAt = '2026-07-14T07:10:00.000Z';
    await expect(
      executeBusinessClaimVerification(
        context,
        backend(staleState).service,
        registry,
        submissionId,
        request('dns_txt'),
        executedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    await expect(
      executeBusinessClaimVerification(
        context,
        backend(state('dns_txt')).service,
        registry,
        submissionId,
        request('website_code'),
        executedAt,
      ),
    ).rejects.toMatchObject({ code: 'method_mismatch' });

    await expect(
      executeBusinessClaimVerification(
        context,
        backend(state('official_social')).service,
        registry,
        submissionId,
        request('official_social'),
        executedAt,
      ),
    ).rejects.toMatchObject({ code: 'adapter_unavailable' });
  });

  it('rejects unauthorized execution, adapter exceptions, and unsafe adapter output', async () => {
    const fixture = backend(state('official_domain_email'));
    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as BusinessClaimVerificationExecutionContext;
    await expect(
      executeBusinessClaimVerification(
        unauthorized,
        fixture.service,
        createBusinessClaimVerificationAdapterRegistry([
          adapter('official_domain_email', safeAdapterResult),
        ]),
        submissionId,
        request('official_domain_email'),
        executedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    const throwingAdapter: BusinessClaimVerificationMethodAdapter = {
      method: 'official_domain_email',
      adapterId: 'throwing-adapter',
      adapterVersion: '1.0.0',
      async execute() {
        throw new Error('provider secret failure');
      },
    };
    await expect(
      executeBusinessClaimVerification(
        context,
        fixture.service,
        createBusinessClaimVerificationAdapterRegistry([throwingAdapter]),
        submissionId,
        request('official_domain_email'),
        executedAt,
      ),
    ).rejects.toMatchObject({ code: 'adapter_failure' });

    await expect(
      executeBusinessClaimVerification(
        context,
        fixture.service,
        createBusinessClaimVerificationAdapterRegistry([
          adapter('official_domain_email', {
            ...safeAdapterResult,
            rawProviderResponse: { contactEmail: 'owner@merchant.example' },
          }),
        ]),
        submissionId,
        request('official_domain_email'),
        executedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_adapter_result' });
    expect(fixture.commits).toHaveLength(0);
  });

  it('rejects changed replay content and protected fields in the execution receipt', async () => {
    const fixture = backend(state('dns_txt'));
    const registry = createBusinessClaimVerificationAdapterRegistry([
      adapter('dns_txt', safeAdapterResult),
    ]);
    const receipt = await executeBusinessClaimVerification(
      context,
      fixture.service,
      registry,
      submissionId,
      request('dns_txt'),
      executedAt,
    );

    await expect(
      executeBusinessClaimVerification(
        context,
        fixture.service,
        registry,
        submissionId,
        request('dns_txt', {
          expectedPreparationExpiresAt: '2026-07-18T07:00:00.000Z',
        }),
        executedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });

    expect(
      businessClaimVerificationExecutionReceiptSchema.safeParse({
        ...receipt,
        contactEmail: 'owner@merchant.example',
        privateProofUrl: 'https://private.example/proof',
        assistedVerifierReference: 'private-reference',
        providerCredential: 'secret',
        rawProviderResponse: {},
      }).success,
    ).toBe(false);
  });

  it('uses an exact dedicated allowlist for execution authorization', () => {
    const policy = readBusinessClaimVerificationExecutionAuthorizationPolicy({
      CPM_ADMIN_CLAIM_VERIFICATION_EXECUTE_SUBJECTS: JSON.stringify([
        'claim-verification-executor',
      ]),
    });
    const authorized = authorizeBusinessClaimVerificationExecution(
      {
        actorId: 'cloudflare-access:claim-verification-executor',
        actorType: 'human',
        subject: 'claim-verification-executor',
        email: null,
      },
      policy,
    );
    expect(authorized.capabilities).toEqual(['submission:claim-verification:execute']);

    expect(() =>
      authorizeBusinessClaimVerificationExecution(
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
