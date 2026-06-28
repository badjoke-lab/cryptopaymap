import { z } from 'zod';
import {
  candidateDuplicateSignalReasonValues,
  candidateDuplicateSignalStrengthValues,
  candidateStatusValues,
  candidateTypeValues,
  duplicateGroupStatusValues,
  sourceTypeValues,
} from '../../db/schema';

const timestampSchema = z.iso.datetime({ offset: true });

export const candidateDuplicateReviewContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(220),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.literal('candidate:read')).min(1),
  })
  .strict();

export const candidateDuplicateReviewMemberSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    candidateType: z.enum(candidateTypeValues),
    status: z.enum(candidateStatusValues),
    priority: z.number().int().min(0).max(1_000).nullable(),
    firstSeenAt: timestampSchema,
    lastSeenAt: timestampSchema,
    updatedAt: timestampSchema,
    sourceTypes: z.array(z.enum(sourceTypeValues)).max(sourceTypeValues.length),
    sourceCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    linkedEntity: z.boolean(),
    linkedLocation: z.boolean(),
  })
  .strict()
  .superRefine((member, context) => {
    if (member.sourceCount < member.sourceTypes.length) {
      context.addIssue({
        code: 'custom',
        path: ['sourceCount'],
        message: 'sourceCount cannot be smaller than the distinct source-type count.',
      });
    }
    if (member.linkedLocation && member.candidateType !== 'physical_place') {
      context.addIssue({
        code: 'custom',
        path: ['linkedLocation'],
        message: 'Only a physical-place Candidate may link to a location.',
      });
    }
  });

export const candidateDuplicateReviewSignalSchema = z
  .object({
    id: z.uuid(),
    leftCandidateId: z.uuid(),
    rightCandidateId: z.uuid(),
    reason: z.enum(candidateDuplicateSignalReasonValues),
    strength: z.enum(candidateDuplicateSignalStrengthValues),
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((signal, context) => {
    if (signal.leftCandidateId === signal.rightCandidateId) {
      context.addIssue({
        code: 'custom',
        path: ['rightCandidateId'],
        message: 'A duplicate signal requires two distinct Candidates.',
      });
    }
  });

export const candidateDuplicateReviewDataSchema = z
  .object({
    group: z
      .object({
        id: z.uuid(),
        status: z.enum(duplicateGroupStatusValues),
        updatedAt: timestampSchema,
        resolvedAt: timestampSchema.nullable(),
      })
      .strict(),
    members: z.array(candidateDuplicateReviewMemberSchema).min(2).max(50),
    signals: z.array(candidateDuplicateReviewSignalSchema).max(100),
    signalsTruncated: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const memberIds = new Set(value.members.map((member) => member.id));
    if (memberIds.size !== value.members.length) {
      context.addIssue({
        code: 'custom',
        path: ['members'],
        message: 'Duplicate review members must be unique.',
      });
    }
    if (new Set(value.members.map((member) => member.candidateType)).size !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['members'],
        message: 'A duplicate review group cannot mix Candidate types.',
      });
    }
    for (const [index, signal] of value.signals.entries()) {
      if (!memberIds.has(signal.leftCandidateId) || !memberIds.has(signal.rightCandidateId)) {
        context.addIssue({
          code: 'custom',
          path: ['signals', index],
          message: 'Every duplicate signal must reference reviewed group members.',
        });
      }
    }
    if (value.group.status === 'open' && value.group.resolvedAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['group', 'resolvedAt'],
        message: 'An open duplicate group cannot have a resolution time.',
      });
    }
    if (value.group.status !== 'open' && value.group.resolvedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['group', 'resolvedAt'],
        message: 'A closed duplicate group requires a resolution time.',
      });
    }
  });

export const candidateDuplicateReviewResponseSchema = candidateDuplicateReviewDataSchema.safeExtend(
  {
    generatedAt: timestampSchema,
  },
);

export type CandidateDuplicateReviewContext = z.infer<typeof candidateDuplicateReviewContextSchema>;
export type CandidateDuplicateReviewMember = z.infer<typeof candidateDuplicateReviewMemberSchema>;
export type CandidateDuplicateReviewSignal = z.infer<typeof candidateDuplicateReviewSignalSchema>;
export type CandidateDuplicateReviewData = z.infer<typeof candidateDuplicateReviewDataSchema>;
export type CandidateDuplicateReviewResponse = z.infer<
  typeof candidateDuplicateReviewResponseSchema
>;

export interface CandidateDuplicateReviewBackend {
  loadGroup(groupId: string, asOf: Date): Promise<CandidateDuplicateReviewData | null>;
}

export type CandidateDuplicateReviewErrorCode =
  | 'unauthorized'
  | 'invalid_group_id'
  | 'not_found'
  | 'invalid_group'
  | 'backend_failure';

export class CandidateDuplicateReviewError extends Error {
  readonly code: CandidateDuplicateReviewErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: CandidateDuplicateReviewErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidateDuplicateReviewError';
    this.code = code;
    this.issues = issues;
  }
}

export async function loadCandidateDuplicateReview(
  context: CandidateDuplicateReviewContext,
  backend: CandidateDuplicateReviewBackend,
  groupId: string,
  asOf = new Date(),
): Promise<CandidateDuplicateReviewResponse> {
  const contextResult = candidateDuplicateReviewContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('candidate:read')) {
    throw new CandidateDuplicateReviewError(
      'unauthorized',
      'The actor is not authorized to read Candidate duplicate groups.',
    );
  }

  const groupIdResult = z.uuid().safeParse(groupId);
  if (!groupIdResult.success || Number.isNaN(asOf.getTime())) {
    throw new CandidateDuplicateReviewError(
      'invalid_group_id',
      'The Candidate duplicate-group identifier is invalid.',
    );
  }

  let detail: CandidateDuplicateReviewData | null;
  try {
    detail = await backend.loadGroup(groupIdResult.data, asOf);
  } catch (error) {
    if (error instanceof CandidateDuplicateReviewError) throw error;
    throw new CandidateDuplicateReviewError(
      'backend_failure',
      'The Candidate duplicate group could not be loaded.',
      [],
      { cause: error },
    );
  }

  if (detail === null) {
    throw new CandidateDuplicateReviewError(
      'not_found',
      'The Candidate duplicate group was not found.',
    );
  }

  const result = candidateDuplicateReviewResponseSchema.safeParse({
    ...detail,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new CandidateDuplicateReviewError(
      'invalid_group',
      'The Candidate duplicate backend returned an invalid group.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  return result.data;
}
