import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { entities } from './entities';
import {
  acceptanceClaimStatusEnum,
  claimVisibilityEnum,
  routeTypeEnum,
} from './enums';
import { locations } from './locations';

export const claimScopeValues = [
  'location_specific',
  'brand_region',
  'brand_global',
  'online_service',
  'platform_capability',
] as const;
export const acceptanceScopeValues = [
  'all_checkout',
  'selected_products',
  'new_purchase_only',
  'renewal_only',
  'region_limited',
  'temporary',
] as const;
export const merchantReceivesValues = [
  'crypto',
  'fiat',
  'crypto_or_fiat',
  'not_publicly_confirmed',
] as const;
export const claimRegionInclusionValues = ['include', 'exclude'] as const;

export const claimScopeEnum = pgEnum('claim_scope', claimScopeValues);
export const acceptanceScopeEnum = pgEnum('acceptance_scope', acceptanceScopeValues);
export const merchantReceivesEnum = pgEnum('merchant_receives', merchantReceivesValues);
export const claimRegionInclusionEnum = pgEnum(
  'claim_region_inclusion',
  claimRegionInclusionValues,
);

export const acceptanceClaims = pgTable(
  'acceptance_claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    claimScope: claimScopeEnum('claim_scope').notNull(),
    routeType: routeTypeEnum('route_type').notNull(),
    acceptanceScope: acceptanceScopeEnum('acceptance_scope').default('all_checkout').notNull(),
    claimStatus: acceptanceClaimStatusEnum('claim_status').default('candidate').notNull(),
    visibility: claimVisibilityEnum('visibility').default('hidden').notNull(),
    customerPaysCrypto: boolean('customer_pays_crypto').default(false).notNull(),
    merchantExplicitlyAcceptsCrypto: boolean('merchant_explicitly_accepts_crypto')
      .default(false)
      .notNull(),
    processorId: uuid('processor_id').references(() => entities.id, { onDelete: 'restrict' }),
    howToPay: text('how_to_pay'),
    instructionsLanguage: varchar('instructions_language', { length: 35 }).default('en').notNull(),
    merchantReceives: merchantReceivesEnum('merchant_receives')
      .default('not_publicly_confirmed')
      .notNull(),
    restrictions: text('restrictions'),
    firstConfirmedAt: timestamp('first_confirmed_at', { withTimezone: true }),
    lastConfirmedAt: timestamp('last_confirmed_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endedReason: text('ended_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('acceptance_claims_entity_idx').on(table.entityId),
    index('acceptance_claims_location_idx').on(table.locationId),
    index('acceptance_claims_processor_idx').on(table.processorId),
    index('acceptance_claims_status_idx').on(table.claimStatus),
    index('acceptance_claims_review_idx').on(table.nextReviewAt),
    check(
      'acceptance_claims_location_scope',
      sql`(${table.claimScope} = 'location_specific' and ${table.locationId} is not null) or (${table.claimScope} <> 'location_specific' and ${table.locationId} is null)`,
    ),
    check(
      'acceptance_claims_processor_route',
      sql`${table.routeType} <> 'processor_checkout' or ${table.processorId} is not null`,
    ),
    check(
      'acceptance_claims_ended_timestamp',
      sql`${table.claimStatus} <> 'ended' or ${table.endedAt} is not null`,
    ),
    check(
      'acceptance_claims_confirmed_requirements',
      sql`${table.claimStatus} <> 'confirmed' or (${table.howToPay} is not null and length(trim(${table.howToPay})) > 0 and ${table.firstConfirmedAt} is not null and ${table.lastConfirmedAt} is not null)`,
    ),
    check(
      'acceptance_claims_public_status',
      sql`${table.visibility} <> 'public' or ${table.claimStatus} in ('confirmed', 'stale', 'ended')`,
    ),
    check(
      'acceptance_claims_public_payment_flags',
      sql`${table.visibility} <> 'public' or (${table.customerPaysCrypto} = true and ${table.merchantExplicitlyAcceptsCrypto} = true)`,
    ),
    check(
      'acceptance_claims_confirmation_order',
      sql`${table.firstConfirmedAt} is null or ${table.lastConfirmedAt} is null or ${table.firstConfirmedAt} <= ${table.lastConfirmedAt}`,
    ),
  ],
);

export const claimRegions = pgTable(
  'claim_regions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => acceptanceClaims.id, { onDelete: 'cascade' }),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    regionCode: varchar('region_code', { length: 64 }),
    inclusionType: claimRegionInclusionEnum('inclusion_type').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('claim_regions_identity_unique').on(
      table.claimId,
      table.countryCode,
      table.regionCode,
      table.inclusionType,
    ),
    index('claim_regions_claim_idx').on(table.claimId),
  ],
);

export type AcceptanceClaim = typeof acceptanceClaims.$inferSelect;
export type NewAcceptanceClaim = typeof acceptanceClaims.$inferInsert;
export type ClaimRegion = typeof claimRegions.$inferSelect;
export type NewClaimRegion = typeof claimRegions.$inferInsert;
