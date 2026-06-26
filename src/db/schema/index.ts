import { pgEnum } from 'drizzle-orm/pg-core';

export {
  acceptanceClaimStatusEnum,
  acceptanceClaimStatusValues,
  claimVisibilityEnum,
  claimVisibilityValues,
  routeTypeEnum,
  routeTypeValues,
  submissionResolutionEnum,
  submissionResolutionValues,
  submissionWorkflowStatusEnum,
  submissionWorkflowStatusValues,
} from './enums';
export * from './assets';
export * from './networks';
export * from './payment-registries';

export const entityStatusValues = ['active', 'inactive', 'ended', 'unknown'] as const;
export const entityStatusEnum = pgEnum('entity_status', entityStatusValues);
