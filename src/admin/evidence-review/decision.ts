import { z } from 'zod';

export const evidenceReviewCapabilityValues = ['evidence:review'] as const;
export const evidenceReviewDispositionValues = ['accepted', 'rejected', 'held'] as const;
export const evidenceReviewFindingValues = [
  'supports_claim',
  'contradicts_claim',
  'insufficient',
] as const;
export const evidenceReviewClaimActionValues = [
  'no_change',
  'confirm',
  'mark_stale',
  'end',
  'reject',
] as const;
export const evidenceReviewClaimStatusValues = [
  'candidate',
  'confirmed',
  'stale',
  'ended',
  'rejected',
] as const;
export const evidenceReviewClaimVisibilityValues = [
  'public',
  'hidden',
  'temporarily_hidden',
] as const;

export const evidenceReviewMutationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.enum(evidenceReviewCapabilityValues)).min(1),
  })
  .strict();

export const evidenceReviewDecisionInputSchema = z
  .object({
    evidenceId: z.uuid(),
    claimId: z.uuid(),
    expectedEvidenceUpdatedAt: z.iso.datetime({ offset: true }),
    expectedEvidenceReviewStatus: z.literal('pending'),
    expectedClaimUpdatedAt: z.iso.datetime({ offset: true }),
    expectedClaimStatus: z.enum(evidenceReviewClaimStatusValues),
    expectedClaimVisibility: z.enum(evidenceReviewClaimVisibilityValues),
    expectedAcceptedEvidenceIds: z.array(z.uuid()).max(100),
    expectedClaimAssetIds: z.array(z.uuid()).max(100),
    decidedAt: z.iso.datetime({ offset: true }),
    disposition: z.enum(evidenceReviewDispositionValues),
    finding: z.enum(evidenceReviewFindingValues),
    claimAction: z.enum(evidenceReviewClaimActionValues),
    reasonCode: z
      .string()
      .trim()
      .min(1)
      .max(96)
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
    publicSummary: z.string().trim().min(1).max(1_000).nullable(),
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
    nextReviewAt: z.iso.datetime({ offset: true }).nullable(),
    endedReason: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (
      new Set(decision.expectedAcceptedEvidenceIds).size !==
      decision.expectedAcceptedEvidenceIds.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expectedAcceptedEvidenceIds'],
        message: 'Expected accepted Evidence IDs must be unique.',
      });
    }
    if (
      new Set(decision.expectedClaimAssetIds).size !== decision.expectedClaimAssetIds.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expectedClaimAssetIds'],
        message: 'Expected Claim Asset IDs must be unique.',
      });
    }
    if (
      Date.parse(decision.decidedAt) < Date.parse(decision.expectedEvidenceUpdatedAt) ||
      Date.parse(decision.decidedAt) < Date.parse(decision.expectedClaimUpdatedAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['decidedAt'],
        message: 'The decision cannot precede the reviewed Claim or Evidence version.',
      });
    }
    if (decision.publicSummary === null && decision.internalNote === null) {
      context.addIssue({
        code: 'custom',
        path: ['internalNote'],
        message: 'A review decision requires a public summary or internal note.',
      });
    }

    if (decision.disposition === 'held') {
      if (decision.finding !== 'insufficient' || decision.claimAction !== 'no_change') {
        context.addIssue({
          code: 'custom',
          path: ['disposition'],
          message: 'Held Evidence remains pending and cannot change Claim state.',
        });
      }
    }
    if (decision.disposition === 'rejected') {
      if (decision.finding !== 'insufficient' || decision.claimAction !== 'no_change') {
        context.addIssue({
          code: 'custom',
          path: ['disposition'],
          message: 'Rejected Evidence must be insufficient and cannot change Claim state.',
        });
      }
    }
    if (decision.disposition === 'accepted' && decision.finding === 'supports_claim') {
      if (!['no_change', 'confirm'].includes(decision.claimAction)) {
        context.addIssue({
          code: 'custom',
          path: ['claimAction'],
          message: 'Supporting Evidence may only confirm the Claim or leave it unchanged.',
        });
      }
    }
    if (decision.disposition === 'accepted' && decision.finding === 'contradicts_claim') {
      if (!['no_change', 'mark_stale', 'end', 'reject'].includes(decision.claimAction)) {
        context.addIssue({
          code: 'custom',
          path: ['claimAction'],
          message:
            'Contradicting Evidence may only stale, end, reject, or leave the Claim unchanged.',
        });
      }
    }
    if (
      decision.disposition === 'accepted' &&
      decision.finding === 'insufficient' &&
      decision.claimAction !== 'no_change'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['claimAction'],
        message: 'Insufficient Evidence cannot change Claim state.',
      });
    }

    if (['confirm', 'mark_stale'].includes(decision.claimAction)) {
      if (
        decision.nextReviewAt === null ||
        Date.parse(decision.nextReviewAt) <= Date.parse(decision.decidedAt)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['nextReviewAt'],
          message: 'Confirm and mark-stale actions require a future review time.',
        });
      }
    } else if (decision.nextReviewAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['nextReviewAt'],
        message: 'This Claim action cannot assign a next review time.',
      });
    }

    if (decision.claimAction === 'end') {
      if (decision.endedReason === null) {
        context.addIssue({
          code: 'custom',
          path: ['endedReason'],
          message: 'Ending a Claim requires an ended reason.',
        });
      }
    } else if (decision.endedReason !== null) {
      context.addIssue({
        code: 'custom',
        path: ['endedReason'],
        message: 'Only an end action may assign an ended reason.',
      });
    }
  });

export type EvidenceReviewMutationContext = z.infer<typeof evidenceReviewMutationContextSchema>;
export type EvidenceReviewDecisionInput = z.infer<typeof evidenceReviewDecisionInputSchema>;
export type EvidenceReviewDisposition = EvidenceReviewDecisionInput['disposition'];
export type EvidenceReviewFinding = EvidenceReviewDecisionInput['finding'];
export type EvidenceReviewClaimAction = EvidenceReviewDecisionInput['claimAction'];
export type EvidenceReviewClaimStatus = EvidenceReviewDecisionInput['expectedClaimStatus'];
export type EvidenceReviewClaimVisibility = EvidenceReviewDecisionInput['expectedClaimVisibility'];

export interface EvidenceReviewDecisionCommand {
  requestId: string;
  actorId: string;
  actorType: 'human' | 'system';
  evidenceId: string;
  claimId: string;
  expectedEvidenceUpdatedAt: Date;
  expectedEvidenceReviewStatus: 'pending';
  expectedClaimUpdatedAt: Date;
  expectedClaimStatus: EvidenceReviewClaimStatus;
  expectedClaimVisibility: EvidenceReviewClaimVisibility;
  expectedAcceptedEvidenceIds: string[];
  expectedClaimAssetIds: string[];
  decidedAt: Date;
  disposition: EvidenceReviewDisposition;
  finding: EvidenceReviewFinding;
  claimAction: EvidenceReviewClaimAction;
  reasonCode: string;
  publicSummary: string | null;
  internalNote: string | null;
  nextReviewAt: Date | null;
  endedReason: string | null;
  requestFingerprint: string;
}

export type EvidenceReviewVerificationEventType =
  | 'confirmed'
  | 'reconfirmed'
  | 'restored'
  | 'marked_stale'
  | 'ended'
  | 'rejected'
  | null;

export interface EvidenceReviewDecisionReceipt {
  requestId: string;
  evidenceId: string;
  claimId: string;
  disposition: EvidenceReviewDisposition;
  finding: EvidenceReviewFinding;
  claimAction: EvidenceReviewClaimAction;
  evidenceReviewStatus: 'pending' | 'accepted' | 'rejected';
  claimStatus: EvidenceReviewClaimStatus;
  claimVisibility: EvidenceReviewClaimVisibility;
  verificationEventType: EvidenceReviewVerificationEventType;
  decidedAt: string;
  state: 'committed' | 'replayed';
}

export interface EvidenceReviewDecisionBackend {
  commitDecision(command: EvidenceReviewDecisionCommand): Promise<EvidenceReviewDecisionReceipt>;
}

export type EvidenceReviewDecisionErrorCode =
  | 'unauthorized'
  | 'invalid_decision'
  | 'not_found'
  | 'conflict'
  | 'backend_failure';

export class EvidenceReviewDecisionError extends Error {
  readonly code: EvidenceReviewDecisionErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: EvidenceReviewDecisionErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EvidenceReviewDecisionError';
    this.code = code;
    this.issues = issues;
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function buildCommand(
  context: EvidenceReviewMutationContext,
  input: EvidenceReviewDecisionInput,
): EvidenceReviewDecisionCommand {
  const expectedAcceptedEvidenceIds = [...input.expectedAcceptedEvidenceIds].sort();
  const expectedClaimAssetIds = [...input.expectedClaimAssetIds].sort();
  const requestFingerprint = JSON.stringify(
    stable({
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      ...input,
      expectedAcceptedEvidenceIds,
      expectedClaimAssetIds,
    }),
  );
  return {
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    evidenceId: input.evidenceId,
    claimId: input.claimId,
    expectedEvidenceUpdatedAt: new Date(input.expectedEvidenceUpdatedAt),
    expectedEvidenceReviewStatus: input.expectedEvidenceReviewStatus,
    expectedClaimUpdatedAt: new Date(input.expectedClaimUpdatedAt),
    expectedClaimStatus: input.expectedClaimStatus,
    expectedClaimVisibility: input.expectedClaimVisibility,
    expectedAcceptedEvidenceIds,
    expectedClaimAssetIds,
    decidedAt: new Date(input.decidedAt),
    disposition: input.disposition,
    finding: input.finding,
    claimAction: input.claimAction,
    reasonCode: input.reasonCode,
    publicSummary: input.publicSummary,
    internalNote: input.internalNote,
    nextReviewAt: input.nextReviewAt === null ? null : new Date(input.nextReviewAt),
    endedReason: input.endedReason,
    requestFingerprint,
  };
}

export function createEvidenceReviewDecisionService(backend: EvidenceReviewDecisionBackend) {
  return {
    async decide(
      context: EvidenceReviewMutationContext,
      input: EvidenceReviewDecisionInput,
    ): Promise<EvidenceReviewDecisionReceipt> {
      const contextResult = evidenceReviewMutationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('evidence:review')) {
        throw new EvidenceReviewDecisionError(
          'unauthorized',
          'The actor is not authorized to review Evidence.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }
      const inputResult = evidenceReviewDecisionInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new EvidenceReviewDecisionError(
          'invalid_decision',
          'The Evidence review decision is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      try {
        return await backend.commitDecision(buildCommand(contextResult.data, inputResult.data));
      } catch (error) {
        if (error instanceof EvidenceReviewDecisionError) throw error;
        throw new EvidenceReviewDecisionError(
          'backend_failure',
          'The Evidence review decision was not committed.',
          [],
          { cause: error },
        );
      }
    },
  };
}
