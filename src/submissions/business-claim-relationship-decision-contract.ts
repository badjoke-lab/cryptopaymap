import { z } from 'zod';
import {
  businessClaimantRoleSchema,
  businessClaimTargetTypeSchema,
  ownershipVerificationMethodSchema,
} from './business-claim-contract';
import { businessClaimVerificationOutcomeSchema } from './business-claim-verification-result-contract';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimRelationshipDecisionValues = [
  'approve_relationship',
  'not_approved',
] as const;
export const businessClaimRelationshipDecisionSchema = z.enum(
  businessClaimRelationshipDecisionValues,
);

export const businessClaimRelationshipDecisionReasonValues = [
  'verified_authority_confirmed',
  'verification_failed',
  'verification_inconclusive',
  'provider_error',
  'authority_not_established',
  'relationship_conflict',
  'superseded_verification',
] as const;
export const businessClaimRelationshipDecisionReasonSchema = z.enum(
  businessClaimRelationshipDecisionReasonValues,
);

export const businessClaimRepresentativeRelationshipSchema = z
  .object({
    relationshipId: z.uuid(),
    status: z.literal('active'),
    targetType: businessClaimTargetTypeSchema,
    targetId: z.uuid(),
    claimantRole: businessClaimantRoleSchema,
    approvedScope: z.literal('representative_relationship'),
    verificationMethod: ownershipVerificationMethodSchema,
    preparationId: z.uuid(),
    executionId: z.uuid(),
    verifiedAt: timestampSchema,
    createdAt: timestampSchema,
  })
  .strict();

export const businessClaimRelationshipDecisionEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-relationship-decision-event-v1'),
    decisionId: z.uuid(),
    expectedSubmissionUpdatedAt: timestampSchema,
    decision: businessClaimRelationshipDecisionSchema,
    reasonCode: businessClaimRelationshipDecisionReasonSchema,
    targetType: businessClaimTargetTypeSchema,
    targetId: z.uuid(),
    claimantRole: businessClaimantRoleSchema,
    approvedScope: z.literal('representative_relationship').nullable(),
    verificationMethod: ownershipVerificationMethodSchema,
    preparationId: z.uuid(),
    executionId: z.uuid(),
    executionOutcome: businessClaimVerificationOutcomeSchema,
    executionResultCode: z.string().trim().min(1).max(96),
    verificationObservedAt: timestampSchema,
    preparationExpiresAt: timestampSchema,
    relationship: businessClaimRepresentativeRelationshipSchema.nullable(),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.decision === 'approve_relationship') {
      if (payload.reasonCode !== 'verified_authority_confirmed') {
        context.addIssue({
          code: 'custom',
          path: ['reasonCode'],
          message: 'Relationship approval requires verified_authority_confirmed.',
        });
      }
      if (payload.executionOutcome !== 'passed') {
        context.addIssue({
          code: 'custom',
          path: ['executionOutcome'],
          message: 'Relationship approval requires a passed verification result.',
        });
      }
      if (
        payload.approvedScope !== 'representative_relationship' ||
        payload.relationship === null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['relationship'],
          message: 'Relationship approval requires one active representative relationship.',
        });
      } else {
        const relationship = payload.relationship;
        if (
          relationship.relationshipId !== payload.decisionId ||
          relationship.targetType !== payload.targetType ||
          relationship.targetId !== payload.targetId ||
          relationship.claimantRole !== payload.claimantRole ||
          relationship.verificationMethod !== payload.verificationMethod ||
          relationship.preparationId !== payload.preparationId ||
          relationship.executionId !== payload.executionId ||
          relationship.verifiedAt !== payload.verificationObservedAt
        ) {
          context.addIssue({
            code: 'custom',
            path: ['relationship'],
            message: 'The representative relationship must match the verified decision chain.',
          });
        }
      }
    }

    if (payload.decision === 'not_approved') {
      if (payload.reasonCode === 'verified_authority_confirmed') {
        context.addIssue({
          code: 'custom',
          path: ['reasonCode'],
          message: 'A non-approval decision requires a non-approval reason.',
        });
      }
      if (payload.approvedScope !== null || payload.relationship !== null) {
        context.addIssue({
          code: 'custom',
          path: ['relationship'],
          message: 'A non-approval decision must not create a representative relationship.',
        });
      }
    }
  });

export type BusinessClaimRelationshipDecision = z.infer<
  typeof businessClaimRelationshipDecisionSchema
>;
export type BusinessClaimRelationshipDecisionReason = z.infer<
  typeof businessClaimRelationshipDecisionReasonSchema
>;
export type BusinessClaimRepresentativeRelationship = z.infer<
  typeof businessClaimRepresentativeRelationshipSchema
>;
export type BusinessClaimRelationshipDecisionEventPayload = z.infer<
  typeof businessClaimRelationshipDecisionEventPayloadSchema
>;

export function serializeBusinessClaimRelationshipDecisionEventPayload(
  payload: BusinessClaimRelationshipDecisionEventPayload,
): string {
  return JSON.stringify(businessClaimRelationshipDecisionEventPayloadSchema.parse(payload));
}

export function parseBusinessClaimRelationshipDecisionEventPayload(
  value: string | null,
): BusinessClaimRelationshipDecisionEventPayload | null {
  if (value === null || value.length === 0 || value.length > 20_000) return null;
  try {
    return businessClaimRelationshipDecisionEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
