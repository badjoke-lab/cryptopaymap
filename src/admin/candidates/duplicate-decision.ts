import { z } from 'zod';
import {
  candidateDuplicateDecisionActionValues,
  candidateDuplicateDecisionReasonValues,
} from '../../db/schema';

export const candidateDuplicateResolveCapabilityValues = ['candidate:resolve'] as const;
export const candidateDuplicateResolveCapabilitySchema = z.enum(
  candidateDuplicateResolveCapabilityValues,
);

export const candidateDuplicateMutationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(candidateDuplicateResolveCapabilitySchema).min(1),
  })
  .strict();

export const candidateDuplicateDecisionInputSchema = z
  .object({
    duplicateGroupId: z.uuid(),
    action: z.enum(candidateDuplicateDecisionActionValues),
    primaryCandidateId: z.uuid().nullable(),
    memberCandidateIds: z.array(z.uuid()).min(2).max(50),
    reasonCode: z.enum(candidateDuplicateDecisionReasonValues),
    note: z.string().trim().min(1).max(2_000).nullable().default(null),
    expectedGroupUpdatedAt: z.iso.datetime({ offset: true }),
    decidedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.memberCandidateIds).size !== value.memberCandidateIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['memberCandidateIds'],
        message: 'Duplicate decision members must be unique.',
      });
    }
    if (value.action === 'confirm_duplicate') {
      if (value.primaryCandidateId === null) {
        context.addIssue({
          code: 'custom',
          path: ['primaryCandidateId'],
          message: 'A confirmed duplicate decision requires a primary Candidate.',
        });
      } else if (!value.memberCandidateIds.includes(value.primaryCandidateId)) {
        context.addIssue({
          code: 'custom',
          path: ['primaryCandidateId'],
          message: 'The primary Candidate must be a member of the reviewed group.',
        });
      }
    }
    if (value.action === 'dismiss_signal' && value.primaryCandidateId !== null) {
      context.addIssue({
        code: 'custom',
        path: ['primaryCandidateId'],
        message: 'A dismissed signal cannot select a primary Candidate.',
      });
    }
    if (Date.parse(value.decidedAt) < Date.parse(value.expectedGroupUpdatedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['decidedAt'],
        message: 'The decision time cannot precede the reviewed group version.',
      });
    }
  });

export type CandidateDuplicateMutationContext = z.infer<
  typeof candidateDuplicateMutationContextSchema
>;
export type CandidateDuplicateDecisionInput = z.infer<typeof candidateDuplicateDecisionInputSchema>;

export interface CandidateDuplicateDecisionCommand {
  decisionId: string;
  requestId: string;
  actorId: string;
  actorType: 'human' | 'system';
  duplicateGroupId: string;
  action: (typeof candidateDuplicateDecisionActionValues)[number];
  primaryCandidateId: string | null;
  memberCandidateIds: string[];
  reasonCode: (typeof candidateDuplicateDecisionReasonValues)[number];
  note: string | null;
  expectedGroupUpdatedAt: Date;
  decidedAt: Date;
  decisionFingerprint: string;
}

export interface CandidateDuplicateDecisionReceipt {
  decisionId: string;
  requestId: string;
  duplicateGroupId: string;
  action: CandidateDuplicateDecisionCommand['action'];
  primaryCandidateId: string | null;
  memberCandidateIds: string[];
  groupStatus: 'resolved' | 'dismissed';
  decidedAt: string;
  state: 'committed' | 'replayed';
}

export interface CandidateDuplicateDecisionBackend {
  commitDecision(
    command: CandidateDuplicateDecisionCommand,
  ): Promise<CandidateDuplicateDecisionReceipt>;
}

export type CandidateDuplicateDecisionErrorCode =
  | 'unauthorized'
  | 'invalid_decision'
  | 'not_found'
  | 'conflict'
  | 'backend_failure';

export class CandidateDuplicateDecisionError extends Error {
  readonly code: CandidateDuplicateDecisionErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: CandidateDuplicateDecisionErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidateDuplicateDecisionError';
    this.code = code;
    this.issues = issues;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const serialized = JSON.stringify(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serialized),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function buildCommand(
  context: CandidateDuplicateMutationContext,
  input: CandidateDuplicateDecisionInput,
): Promise<CandidateDuplicateDecisionCommand> {
  const memberCandidateIds = [...input.memberCandidateIds].sort();
  const normalized = {
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    duplicateGroupId: input.duplicateGroupId,
    action: input.action,
    primaryCandidateId: input.primaryCandidateId,
    memberCandidateIds,
    reasonCode: input.reasonCode,
    note: input.note,
    expectedGroupUpdatedAt: input.expectedGroupUpdatedAt,
    decidedAt: input.decidedAt,
  };
  return {
    decisionId: await deterministicUuid(`candidate-duplicate-decision:${context.requestId}`),
    ...normalized,
    expectedGroupUpdatedAt: new Date(input.expectedGroupUpdatedAt),
    decidedAt: new Date(input.decidedAt),
    decisionFingerprint: await sha256(normalized),
  };
}

export function createCandidateDuplicateDecisionService(
  backend: CandidateDuplicateDecisionBackend,
) {
  return {
    async decide(
      context: CandidateDuplicateMutationContext,
      input: CandidateDuplicateDecisionInput,
    ): Promise<CandidateDuplicateDecisionReceipt> {
      const contextResult = candidateDuplicateMutationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('candidate:resolve')) {
        throw new CandidateDuplicateDecisionError(
          'unauthorized',
          'The actor is not authorized to resolve Candidate duplicates.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }

      const inputResult = candidateDuplicateDecisionInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new CandidateDuplicateDecisionError(
          'invalid_decision',
          'The Candidate duplicate decision is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }

      const command = await buildCommand(contextResult.data, inputResult.data);
      try {
        return await backend.commitDecision(command);
      } catch (error) {
        if (error instanceof CandidateDuplicateDecisionError) throw error;
        throw new CandidateDuplicateDecisionError(
          'backend_failure',
          'The Candidate duplicate decision was not committed.',
          [],
          { cause: error },
        );
      }
    },
  };
}
