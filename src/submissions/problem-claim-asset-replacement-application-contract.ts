import { z } from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const problemClaimAssetReplacementApplicationRequestSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-asset-replacement-application-v1'),
    requestId: z.uuid(),
    planId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    expectedPlanCreatedAt: timestampSchema,
    expectedClaimUpdatedAt: timestampSchema,
    expectedSourceDecisionEventId: z.uuid(),
    expectedCurrentSetHash: hashSchema,
    expectedProposedSetHash: hashSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (request.requestId === request.planId) {
      context.addIssue({
        code: 'custom',
        path: ['requestId'],
        message: 'The canonical application UUID must differ from the durable plan UUID.',
      });
    }
    if (request.expectedCurrentSetHash === request.expectedProposedSetHash) {
      context.addIssue({
        code: 'custom',
        path: ['expectedProposedSetHash'],
        message: 'The proposed complete set must differ from the current complete set.',
      });
    }
  });

export const problemClaimAssetReplacementSourcePayloadSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-asset-replacement-source-v1'),
    submissionReference: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
    planId: z.uuid(),
    sourceDecisionEventId: z.uuid(),
    targetClaimId: z.uuid(),
    reportType: z.enum(['wrong_asset', 'wrong_network']),
    correction: z
      .object({
        kind: z.enum(['asset', 'network']),
        proposedSlug: slugSchema,
      })
      .strict(),
    observedAt: z.iso.date(),
    currentSetHash: hashSchema,
    proposedSetHash: hashSchema,
    selectedCurrentRowId: z.uuid(),
    replacementRowId: z.uuid(),
  })
  .strict();

export const problemClaimAssetReplacementApplicationEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-asset-replacement-application-event-v1'),
    requestFingerprint: hashSchema,
    applicationId: z.uuid(),
    planId: z.uuid(),
    sourceDecisionEventId: z.uuid(),
    claimId: z.uuid(),
    sourceRecordId: z.uuid(),
    verificationEventId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    expectedPlanCreatedAt: timestampSchema,
    expectedClaimUpdatedAt: timestampSchema,
    currentSetHash: hashSchema,
    proposedSetHash: hashSchema,
    selectedCurrentRowId: z.uuid(),
    replacementRowId: z.uuid(),
    correctionKind: z.enum(['asset', 'network']),
  })
  .strict();

export const problemClaimAssetReplacementApplicationReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed', 'already_applied']),
    applicationId: z.uuid(),
    submissionId: z.uuid(),
    claimId: z.uuid(),
    planId: z.uuid(),
    correctionEventId: z.uuid(),
    sourceRecordId: z.uuid(),
    verificationEventId: z.uuid(),
    currentSetHash: hashSchema,
    proposedSetHash: hashSchema,
    applicationStatus: z.literal('committed'),
    publicationStatus: z.enum(['pending', 'committed', 'failed']),
    transitionEventId: z.uuid().nullable(),
    appliedAt: timestampSchema,
  })
  .strict();

export type ProblemClaimAssetReplacementApplicationRequest = z.infer<
  typeof problemClaimAssetReplacementApplicationRequestSchema
>;
export type ProblemClaimAssetReplacementSourcePayload = z.infer<
  typeof problemClaimAssetReplacementSourcePayloadSchema
>;
export type ProblemClaimAssetReplacementApplicationEventPayload = z.infer<
  typeof problemClaimAssetReplacementApplicationEventPayloadSchema
>;
export type ProblemClaimAssetReplacementApplicationReceipt = z.infer<
  typeof problemClaimAssetReplacementApplicationReceiptSchema
>;

export function serializeProblemClaimAssetReplacementApplicationEventPayload(
  payload: ProblemClaimAssetReplacementApplicationEventPayload,
): string {
  return JSON.stringify(problemClaimAssetReplacementApplicationEventPayloadSchema.parse(payload));
}

export function parseProblemClaimAssetReplacementApplicationEventPayload(
  value: string | null,
): ProblemClaimAssetReplacementApplicationEventPayload | null {
  if (value === null || value.length === 0 || value.length > 24_000) return null;
  try {
    return problemClaimAssetReplacementApplicationEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
