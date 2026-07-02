import { z } from 'zod';

export const reconfirmationExpirationCapabilityValues = ['claim:expire'] as const;

export const reconfirmationExpirationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.literal('system'),
    capabilities: z.array(z.enum(reconfirmationExpirationCapabilityValues)).min(1),
  })
  .strict();

export const reconfirmationExpirationInputSchema = z
  .object({
    claimId: z.uuid(),
    expectedClaimUpdatedAt: z.iso.datetime({ offset: true }),
    expectedClaimStatus: z.literal('confirmed'),
    expectedClaimVisibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    expectedNextReviewAt: z.iso.datetime({ offset: true }),
    effectiveAt: z.iso.datetime({ offset: true }),
    reasonCode: z.literal('review_window_expired'),
    publicSummary: z.string().trim().min(1).max(1000).nullable(),
    internalNote: z.string().trim().min(1).max(2000).nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Date.parse(input.effectiveAt) < Date.parse(input.expectedNextReviewAt)) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveAt'],
        message: 'A Claim cannot be marked stale before its review deadline.',
      });
    }
    if (Date.parse(input.effectiveAt) < Date.parse(input.expectedClaimUpdatedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveAt'],
        message: 'The expiration event cannot precede the reviewed Claim version.',
      });
    }
  });

export type ReconfirmationExpirationContext = z.infer<
  typeof reconfirmationExpirationContextSchema
>;
export type ReconfirmationExpirationInput = z.infer<typeof reconfirmationExpirationInputSchema>;

export interface ReconfirmationExpirationCommand {
  requestId: string;
  actorId: string;
  actorType: 'system';
  claimId: string;
  expectedClaimUpdatedAt: Date;
  expectedClaimStatus: 'confirmed';
  expectedClaimVisibility: 'public' | 'hidden' | 'temporarily_hidden';
  expectedNextReviewAt: Date;
  effectiveAt: Date;
  reasonCode: 'review_window_expired';
  publicSummary: string | null;
  internalNote: string | null;
  requestFingerprint: string;
}

export interface ReconfirmationExpirationReceipt {
  requestId: string;
  claimId: string;
  fromStatus: 'confirmed';
  toStatus: 'stale';
  visibility: 'public' | 'hidden' | 'temporarily_hidden';
  nextReviewAt: string;
  eventType: 'marked_stale';
  effectiveAt: string;
  state: 'committed' | 'replayed';
}

export interface ReconfirmationExpirationBackend {
  commitExpiration(
    command: ReconfirmationExpirationCommand,
  ): Promise<ReconfirmationExpirationReceipt>;
}

export type ReconfirmationExpirationErrorCode =
  | 'unauthorized'
  | 'invalid_expiration'
  | 'not_found'
  | 'conflict'
  | 'backend_failure';

export class ReconfirmationExpirationError extends Error {
  readonly code: ReconfirmationExpirationErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ReconfirmationExpirationErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ReconfirmationExpirationError';
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

function command(
  context: ReconfirmationExpirationContext,
  input: ReconfirmationExpirationInput,
): ReconfirmationExpirationCommand {
  const requestFingerprint = JSON.stringify(stable({ ...context, ...input }));
  return {
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    claimId: input.claimId,
    expectedClaimUpdatedAt: new Date(input.expectedClaimUpdatedAt),
    expectedClaimStatus: input.expectedClaimStatus,
    expectedClaimVisibility: input.expectedClaimVisibility,
    expectedNextReviewAt: new Date(input.expectedNextReviewAt),
    effectiveAt: new Date(input.effectiveAt),
    reasonCode: input.reasonCode,
    publicSummary: input.publicSummary,
    internalNote: input.internalNote,
    requestFingerprint,
  };
}

export function createReconfirmationExpirationService(
  backend: ReconfirmationExpirationBackend,
) {
  return {
    async expire(
      context: ReconfirmationExpirationContext,
      input: ReconfirmationExpirationInput,
    ): Promise<ReconfirmationExpirationReceipt> {
      const contextResult = reconfirmationExpirationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('claim:expire')) {
        throw new ReconfirmationExpirationError(
          'unauthorized',
          'The actor is not authorized to expire Claim review windows.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }
      const inputResult = reconfirmationExpirationInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new ReconfirmationExpirationError(
          'invalid_expiration',
          'The Claim expiration request is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      try {
        return await backend.commitExpiration(command(contextResult.data, inputResult.data));
      } catch (error) {
        if (error instanceof ReconfirmationExpirationError) throw error;
        throw new ReconfirmationExpirationError(
          'backend_failure',
          'The Claim expiration was not committed.',
          [],
          { cause: error },
        );
      }
    },
  };
}
