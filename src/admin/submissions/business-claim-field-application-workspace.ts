import { z } from 'zod';
import {
  businessClaimEntityFieldSchema,
  businessClaimLocationFieldSchema,
  businessClaimRequestedScopeSchema,
  type BusinessClaimReviewProjection,
} from '../../submissions/business-claim-contract';
import { parseBusinessClaimRelationshipDecisionEventPayload } from '../../submissions/business-claim-relationship-decision-contract';
import { businessClaimReviewProjectionSchema } from '../../submissions/business-claim-target-context';
import { suggestPaymentProposalSchema } from '../../submissions/suggest-contract';
import {
  canonicalEntitySchema,
  canonicalLocationSchema,
  canonicalLocationSocialLinkSchema,
} from '../../schemas/canonical-identity';
import type { BusinessClaimFieldApplicationContext } from './business-claim-field-application-authorization';
import type {
  BusinessClaimFieldApplicationPersistenceBackend,
  BusinessClaimFieldApplicationPersistenceEventRecord,
} from './business-claim-field-application-persistence';

const timestampSchema = z.iso.datetime({ offset: true });
const fieldValueSchema = z.union([
  z.string().max(5_000),
  z.number().finite(),
  z.null(),
  z.array(z.string().max(80)).max(100),
  z.array(canonicalLocationSocialLinkSchema).max(30),
]);

const entityFieldSchema = z
  .object({
    field: businessClaimEntityFieldSchema,
    currentValue: fieldValueSchema,
    proposedValue: fieldValueSchema,
  })
  .strict();

const locationFieldSchema = z
  .object({
    field: businessClaimLocationFieldSchema,
    currentValue: fieldValueSchema,
    proposedValue: fieldValueSchema,
  })
  .strict();

const paymentProposalSchema = z
  .object({
    index: z.number().int().min(0).max(19),
    proposal: suggestPaymentProposalSchema,
  })
  .strict();

export const businessClaimFieldApplicationWorkspaceEligibilityIssueValues = [
  'submission_not_approved',
  'canonical_target_missing',
  'already_applied',
  'no_reviewable_proposals',
] as const;
export const businessClaimFieldApplicationWorkspaceEligibilityIssueSchema = z.enum(
  businessClaimFieldApplicationWorkspaceEligibilityIssueValues,
);

export const businessClaimFieldApplicationWorkspaceResponseSchema = z
  .object({
    generatedAt: timestampSchema,
    submission: z
      .object({
        id: z.uuid(),
        workflowStatus: z.string().min(1).max(64),
        resolution: z.string().min(1).max(64).nullable(),
        updatedAt: timestampSchema,
      })
      .strict(),
    relationship: z
      .object({
        decisionId: z.uuid(),
        claimantRole: z.enum(['owner', 'authorized_representative', 'authorized_employee']),
        verificationMethod: z.enum([
          'official_domain_email',
          'website_code',
          'dns_txt',
          'official_social',
          'assisted_verification',
        ]),
        verifiedAt: timestampSchema,
      })
      .strict(),
    target: z
      .object({
        targetType: z.enum(['entity', 'location']),
        targetId: z.uuid(),
        updatedAt: timestampSchema.nullable(),
      })
      .strict(),
    requestedScopes: z.array(businessClaimRequestedScopeSchema).max(4),
    entityFields: z.array(entityFieldSchema).max(4),
    locationFields: z.array(locationFieldSchema).max(14),
    paymentProposals: z.array(paymentProposalSchema).max(20),
    requestSeed: z
      .object({
        expectedSubmissionUpdatedAt: timestampSchema,
        expectedRelationshipDecisionId: z.uuid(),
        expectedEntityUpdatedAt: timestampSchema.nullable(),
        expectedLocationUpdatedAt: timestampSchema.nullable(),
      })
      .strict(),
    eligible: z.boolean(),
    eligibilityIssues: z
      .array(businessClaimFieldApplicationWorkspaceEligibilityIssueSchema)
      .max(businessClaimFieldApplicationWorkspaceEligibilityIssueValues.length),
  })
  .strict()
  .superRefine((workspace, context) => {
    if (workspace.eligible !== (workspace.eligibilityIssues.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['eligible'],
        message: 'Workspace eligibility must match the issue list.',
      });
    }
    if (workspace.target.targetType === 'entity') {
      if (
        workspace.locationFields.length > 0 ||
        workspace.requestSeed.expectedLocationUpdatedAt !== null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['locationFields'],
          message: 'Entity workspaces must not carry Location application material.',
        });
      }
    }
    if (workspace.target.targetType === 'location') {
      if (
        workspace.entityFields.length > 0 ||
        workspace.requestSeed.expectedEntityUpdatedAt !== null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['entityFields'],
          message: 'Location workspaces must not carry Entity application material.',
        });
      }
    }
  });

export type BusinessClaimFieldApplicationWorkspaceResponse = z.infer<
  typeof businessClaimFieldApplicationWorkspaceResponseSchema
>;

export class BusinessClaimFieldApplicationWorkspaceError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'invalid_workspace'
      | 'backend_failure',
    message: string,
    readonly issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimFieldApplicationWorkspaceError';
  }
}

function locationProposalValue(
  projection: BusinessClaimReviewProjection,
  field: z.infer<typeof businessClaimLocationFieldSchema>,
): z.infer<typeof fieldValueSchema> {
  const proposal = projection.proposedChanges.location;
  if (proposal === null) return null;
  const value = proposal[field];
  if ((field === 'amenities' || field === 'socialLinks') && value === null) return [];
  return fieldValueSchema.parse(value);
}

export async function loadBusinessClaimFieldApplicationWorkspace(
  context: BusinessClaimFieldApplicationContext,
  backend: BusinessClaimFieldApplicationPersistenceBackend,
  submissionId: string,
  relationshipDecisionId: string,
  asOf = new Date(),
): Promise<BusinessClaimFieldApplicationWorkspaceResponse> {
  if (!context.capabilities.includes('submission:claim-fields:apply')) {
    throw new BusinessClaimFieldApplicationWorkspaceError(
      'unauthorized',
      'The actor is not authorized to load the Business Claim field workspace.',
    );
  }
  const submissionIdResult = z.uuid().safeParse(submissionId);
  const relationshipIdResult = z.uuid().safeParse(relationshipDecisionId);
  if (
    !submissionIdResult.success ||
    !relationshipIdResult.success ||
    Number.isNaN(asOf.getTime())
  ) {
    throw new BusinessClaimFieldApplicationWorkspaceError(
      'invalid_request',
      'The Business Claim field workspace request is invalid.',
    );
  }

  let state: Awaited<ReturnType<BusinessClaimFieldApplicationPersistenceBackend['loadState']>>;
  let priorApplication: BusinessClaimFieldApplicationPersistenceEventRecord | null;
  try {
    const priorApplicationPromise =
      backend.readSubmissionApplicationEvent === undefined
        ? Promise.resolve(null)
        : backend.readSubmissionApplicationEvent(submissionIdResult.data);
    [state, priorApplication] = await Promise.all([
      backend.loadState(submissionIdResult.data, relationshipIdResult.data),
      priorApplicationPromise,
    ]);
  } catch (error) {
    throw new BusinessClaimFieldApplicationWorkspaceError(
      'backend_failure',
      'The Business Claim field workspace state could not be loaded.',
      [],
      { cause: error },
    );
  }
  if (state === null) {
    throw new BusinessClaimFieldApplicationWorkspaceError(
      'not_found',
      'The Business Claim Submission was not found.',
    );
  }

  const projectionResult = businessClaimReviewProjectionSchema.safeParse(state.normalizedProjection);
  if (!projectionResult.success) {
    throw new BusinessClaimFieldApplicationWorkspaceError(
      'invalid_workspace',
      'The normalized Business Claim projection is invalid.',
      projectionResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const projection = projectionResult.data;
  const relationshipEvent = state.relationshipEvent;
  const relationshipPayload = parseBusinessClaimRelationshipDecisionEventPayload(
    relationshipEvent?.internalNote ?? null,
  );
  if (
    state.submissionId !== submissionIdResult.data ||
    state.submissionType !== 'claim' ||
    state.targetType !== projection.targetType ||
    state.targetId !== projection.targetId ||
    relationshipEvent === null ||
    relationshipEvent.eventId !== relationshipIdResult.data ||
    relationshipEvent.submissionId !== submissionIdResult.data ||
    relationshipEvent.fromStatus !== 'in_review' ||
    relationshipEvent.toStatus !== 'resolved' ||
    relationshipEvent.action !== 'business_claim_relationship_approved' ||
    relationshipEvent.reasonCode !== 'verified_authority_confirmed' ||
    relationshipPayload === null ||
    relationshipPayload.decisionId !== relationshipIdResult.data ||
    relationshipPayload.decision !== 'approve_relationship' ||
    relationshipPayload.relationship === null ||
    relationshipPayload.targetType !== projection.targetType ||
    relationshipPayload.targetId !== projection.targetId ||
    relationshipPayload.claimantRole !== projection.claimantRole
  ) {
    throw new BusinessClaimFieldApplicationWorkspaceError(
      'invalid_workspace',
      'The approved representative relationship does not match the Business Claim.',
    );
  }

  const issues: Array<
    (typeof businessClaimFieldApplicationWorkspaceEligibilityIssueValues)[number]
  > = [];
  if (state.workflowStatus !== 'resolved' || state.resolution !== 'approved') {
    issues.push('submission_not_approved');
  }
  if (priorApplication !== null) issues.push('already_applied');

  const entityFields: z.infer<typeof entityFieldSchema>[] = [];
  const locationFields: z.infer<typeof locationFieldSchema>[] = [];
  let targetUpdatedAt: string | null = null;

  if (projection.targetType === 'entity') {
    const canonicalResult = canonicalEntitySchema.safeParse(state.entityTarget?.value);
    if (
      state.entityTarget === null ||
      state.entityTarget.id !== projection.targetId ||
      !canonicalResult.success
    ) {
      issues.push('canonical_target_missing');
    } else {
      targetUpdatedAt = state.entityTarget.updatedAt;
      const proposal = projection.proposedChanges.entity;
      if (proposal !== null) {
        for (const field of proposal.changedFields) {
          entityFields.push(
            entityFieldSchema.parse({
              field,
              currentValue: canonicalResult.data[field],
              proposedValue: proposal[field],
            }),
          );
        }
      }
    }
  } else {
    const canonicalResult = canonicalLocationSchema.safeParse(state.locationTarget?.value);
    if (
      state.locationTarget === null ||
      state.locationTarget.id !== projection.targetId ||
      !canonicalResult.success
    ) {
      issues.push('canonical_target_missing');
    } else {
      targetUpdatedAt = state.locationTarget.updatedAt;
      const proposal = projection.proposedChanges.location;
      if (proposal !== null) {
        for (const field of proposal.changedFields) {
          locationFields.push(
            locationFieldSchema.parse({
              field,
              currentValue: canonicalResult.data[field],
              proposedValue: locationProposalValue(projection, field),
            }),
          );
        }
      }
    }
  }

  const paymentProposals = (projection.proposedChanges.paymentProposals ?? []).map(
    (proposal, index) => paymentProposalSchema.parse({ index, proposal }),
  );
  if (entityFields.length === 0 && locationFields.length === 0 && paymentProposals.length === 0) {
    issues.push('no_reviewable_proposals');
  }

  const uniqueIssues = [...new Set(issues)];
  const result = businessClaimFieldApplicationWorkspaceResponseSchema.safeParse({
    generatedAt: asOf.toISOString(),
    submission: {
      id: state.submissionId,
      workflowStatus: state.workflowStatus,
      resolution: state.resolution,
      updatedAt: state.updatedAt,
    },
    relationship: {
      decisionId: relationshipPayload.decisionId,
      claimantRole: relationshipPayload.claimantRole,
      verificationMethod: relationshipPayload.verificationMethod,
      verifiedAt: relationshipPayload.verificationObservedAt,
    },
    target: {
      targetType: projection.targetType,
      targetId: projection.targetId,
      updatedAt: targetUpdatedAt,
    },
    requestedScopes: projection.requestedScopes,
    entityFields,
    locationFields,
    paymentProposals,
    requestSeed: {
      expectedSubmissionUpdatedAt: state.updatedAt,
      expectedRelationshipDecisionId: relationshipPayload.decisionId,
      expectedEntityUpdatedAt: projection.targetType === 'entity' ? targetUpdatedAt : null,
      expectedLocationUpdatedAt: projection.targetType === 'location' ? targetUpdatedAt : null,
    },
    eligible: uniqueIssues.length === 0,
    eligibilityIssues: uniqueIssues,
  });
  if (!result.success) {
    throw new BusinessClaimFieldApplicationWorkspaceError(
      'invalid_workspace',
      'The Business Claim field workspace response is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
