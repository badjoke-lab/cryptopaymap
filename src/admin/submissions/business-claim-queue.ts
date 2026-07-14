import { z } from 'zod';
import {
  submissionResolutionSchema,
  submissionWorkflowStatusSchema,
  submissionWorkflowStatusValues,
} from '../../submissions/contract';
import {
  businessClaimRequestedScopeSchema,
  businessClaimTargetTypeSchema,
  businessClaimantRoleSchema,
  ownershipVerificationMethodSchema,
} from '../../submissions/business-claim-contract';
import type { SubmissionReviewContext } from './authorization';

const timestampSchema = z.iso.datetime({ offset: true });
const submissionReadCapabilitySchema = z.literal('submission:read');

export const businessClaimSubmissionReviewContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(220),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(submissionReadCapabilitySchema).min(1),
  })
  .strict();

const businessClaimSubmissionQueueCursorSchema = z
  .object({
    priority: z.number().int().min(0).max(1_000),
    submittedAt: timestampSchema,
    id: z.uuid(),
  })
  .strict();

const businessClaimQueueRequestedScopesSchema = z
  .array(businessClaimRequestedScopeSchema)
  .min(1)
  .max(4)
  .superRefine((scopes, context) => {
    if (new Set(scopes).size !== scopes.length) {
      context.addIssue({
        code: 'custom',
        message: 'Business Claim requested scopes must be unique.',
      });
    }
    if (!scopes.includes('representative_relationship')) {
      context.addIssue({
        code: 'custom',
        message: 'Business Claim queue items must request a representative relationship.',
      });
    }
  });

export const actionableBusinessClaimSubmissionStatuses = [
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
] as const;

export const businessClaimSubmissionQueueQuerySchema = z
  .object({
    statuses: z
      .array(submissionWorkflowStatusSchema)
      .min(1)
      .max(submissionWorkflowStatusValues.length)
      .default([...actionableBusinessClaimSubmissionStatuses]),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: businessClaimSubmissionQueueCursorSchema.nullable().default(null),
  })
  .strict();

export const businessClaimSubmissionQueueItemSchema = z
  .object({
    id: z.uuid(),
    publicId: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
    targetType: businessClaimTargetTypeSchema,
    targetId: z.uuid(),
    claimantRole: businessClaimantRoleSchema,
    requestedScopes: businessClaimQueueRequestedScopesSchema,
    verificationMethod: ownershipVerificationMethodSchema,
    workflowStatus: submissionWorkflowStatusSchema,
    resolution: submissionResolutionSchema.nullable(),
    priority: z.number().int().min(0).max(1_000),
    evidenceCount: z.number().int().nonnegative().max(10),
    protectedContactPresent: z.boolean(),
    privateProofPresent: z.boolean(),
    assistedVerifierReferencePresent: z.boolean(),
    submittedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const businessClaimSubmissionQueuePageDataSchema = z
  .object({
    items: z.array(businessClaimSubmissionQueueItemSchema).max(50),
    hasNextPage: z.boolean(),
    nextCursor: z.string().max(1_024).nullable(),
  })
  .strict()
  .superRefine((page, context) => {
    if (page.hasNextPage !== (page.nextCursor !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message: 'nextCursor must be present exactly when hasNextPage is true.',
      });
    }
  });

export const businessClaimSubmissionQueueResponseSchema =
  businessClaimSubmissionQueuePageDataSchema.safeExtend({ generatedAt: timestampSchema });

export type BusinessClaimSubmissionQueueQuery = z.infer<
  typeof businessClaimSubmissionQueueQuerySchema
>;
export type BusinessClaimSubmissionQueueItem = z.infer<
  typeof businessClaimSubmissionQueueItemSchema
>;
export type BusinessClaimSubmissionQueuePageData = z.infer<
  typeof businessClaimSubmissionQueuePageDataSchema
>;
export type BusinessClaimSubmissionQueueResponse = z.infer<
  typeof businessClaimSubmissionQueueResponseSchema
>;
export type BusinessClaimSubmissionQueueCursor = z.infer<
  typeof businessClaimSubmissionQueueCursorSchema
>;

export interface BusinessClaimSubmissionQueueBackend {
  loadPage(
    query: BusinessClaimSubmissionQueueQuery,
    asOf: Date,
  ): Promise<BusinessClaimSubmissionQueuePageData>;
}

export class BusinessClaimSubmissionQueueError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'invalid_query' | 'invalid_page' | 'backend_failure',
    message: string,
    readonly issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimSubmissionQueueError';
  }
}

function parseMultiValue(searchParameters: URLSearchParams, key: string): string[] {
  return searchParameters
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function encodeBusinessClaimSubmissionQueueCursor(
  cursor: BusinessClaimSubmissionQueueCursor,
): string {
  const validated = businessClaimSubmissionQueueCursorSchema.parse(cursor);
  return globalThis
    .btoa(JSON.stringify(validated))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function decodeBusinessClaimSubmissionQueueCursor(
  value: string,
): BusinessClaimSubmissionQueueCursor {
  if (value.length === 0 || value.length > 1_024) {
    throw new BusinessClaimSubmissionQueueError(
      'invalid_query',
      'Business Claim queue cursor is invalid.',
    );
  }
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    return businessClaimSubmissionQueueCursorSchema.parse(
      JSON.parse(globalThis.atob(normalized.padEnd(normalized.length + padding, '='))),
    );
  } catch (error) {
    throw new BusinessClaimSubmissionQueueError(
      'invalid_query',
      'Business Claim queue cursor is invalid.',
      [],
      { cause: error },
    );
  }
}

export function parseBusinessClaimSubmissionQueueQuery(
  url: URL,
): BusinessClaimSubmissionQueueQuery {
  const statuses = parseMultiValue(url.searchParams, 'status');
  const limitValue = url.searchParams.get('limit');
  const cursorValue = url.searchParams.get('cursor');
  const result = businessClaimSubmissionQueueQuerySchema.safeParse({
    ...(statuses.length > 0 ? { statuses } : {}),
    limit: limitValue === null ? undefined : Number(limitValue),
    cursor:
      cursorValue === null ? undefined : decodeBusinessClaimSubmissionQueueCursor(cursorValue),
  });
  if (!result.success) {
    throw new BusinessClaimSubmissionQueueError(
      'invalid_query',
      'Business Claim queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadBusinessClaimSubmissionQueue(
  context: SubmissionReviewContext,
  backend: BusinessClaimSubmissionQueueBackend,
  query: BusinessClaimSubmissionQueueQuery,
  asOf = new Date(),
): Promise<BusinessClaimSubmissionQueueResponse> {
  const contextResult = businessClaimSubmissionReviewContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('submission:read')) {
    throw new BusinessClaimSubmissionQueueError(
      'unauthorized',
      'The actor is not authorized to read the Business Claim Submission queue.',
    );
  }
  if (Number.isNaN(asOf.getTime())) {
    throw new BusinessClaimSubmissionQueueError(
      'invalid_query',
      'Business Claim queue time is invalid.',
    );
  }

  let page: BusinessClaimSubmissionQueuePageData;
  try {
    page = await backend.loadPage(query, asOf);
  } catch (error) {
    if (error instanceof BusinessClaimSubmissionQueueError) throw error;
    throw new BusinessClaimSubmissionQueueError(
      'backend_failure',
      'The Business Claim Submission queue could not be loaded.',
      [],
      { cause: error },
    );
  }

  const result = businessClaimSubmissionQueueResponseSchema.safeParse({
    ...page,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new BusinessClaimSubmissionQueueError(
      'invalid_page',
      'The Business Claim Submission queue backend returned an invalid page.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
