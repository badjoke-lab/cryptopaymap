import { pgEnum } from 'drizzle-orm/pg-core';

export const acceptanceClaimStatusValues = [
  'candidate',
  'confirmed',
  'stale',
  'ended',
  'rejected',
] as const;

export const claimVisibilityValues = [
  'public',
  'hidden',
  'temporarily_hidden',
] as const;

export const routeTypeValues = [
  'direct_wallet',
  'processor_checkout',
] as const;

export const submissionWorkflowStatusValues = [
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
  'resolved',
  'duplicate',
  'rejected_spam',
  'withdrawn',
] as const;

export const submissionResolutionValues = [
  'approved',
  'partially_approved',
  'accepted_as_candidate',
  'not_approved',
  'duplicate',
  'no_change',
  'withdrawn',
] as const;

export const acceptanceClaimStatusEnum = pgEnum(
  'acceptance_claim_status',
  acceptanceClaimStatusValues,
);

export const claimVisibilityEnum = pgEnum(
  'claim_visibility',
  claimVisibilityValues,
);

export const routeTypeEnum = pgEnum('route_type', routeTypeValues);

export const submissionWorkflowStatusEnum = pgEnum(
  'submission_workflow_status',
  submissionWorkflowStatusValues,
);

export const submissionResolutionEnum = pgEnum(
  'submission_resolution',
  submissionResolutionValues,
);
