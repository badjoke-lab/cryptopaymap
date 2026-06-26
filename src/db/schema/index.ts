import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { claimVisibilityEnum } from './enums';

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

export const entityTypeValues = [
  'merchant',
  'online_service',
  'payment_processor',
  'payment_program',
  'platform',
] as const;
export const entityStatusValues = ['active', 'inactive', 'ended', 'unknown'] as const;
export const locationStatusValues = [
  'active',
  'temporarily_closed',
  'closed',
  'unknown',
] as const;
export const osmElementTypeValues = ['node', 'way', 'relation'] as const;

export const entityTypeEnum = pgEnum('entity_type', entityTypeValues);
export const entityStatusEnum = pgEnum('entity_status', entityStatusValues);
export const locationStatusEnum = pgEnum('location_status', locationStatusValues);
export const osmElementTypeEnum = pgEnum('osm_element_type', osmElementTypeValues);

export const entities = pgTable('entities', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: varchar('entity_type', { length: 32 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 64 }),
  legalName: varchar('legal_name', { length: 200 }),
  websiteUrl: text('website_url'),
  countryCode: varchar('country_code', { length: 2 }),
  entityStatus: entityStatusEnum('entity_status').default('active').notNull(),
});

void claimVisibilityEnum;
void index;
void timestamp;
void uniqueIndex;
