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

export const entityTypeValues = [
  'merchant',
  'online_service',
  'payment_processor',
  'payment_program',
  'platform',
] as const;
export const entityStatusValues = ['active', 'inactive', 'ended', 'unknown'] as const;

export const entityTypeEnum = pgEnum('entity_type', entityTypeValues);
export const entityStatusEnum = pgEnum('entity_status', entityStatusValues);

export const entities = pgTable(
  'entities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityType: entityTypeEnum('entity_type').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 64 }),
    legalName: varchar('legal_name', { length: 200 }),
    websiteUrl: text('website_url'),
    countryCode: varchar('country_code', { length: 2 }),
    entityStatus: entityStatusEnum('entity_status').default('active').notNull(),
    visibility: claimVisibilityEnum('visibility').default('hidden').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('entities_slug_unique').on(table.slug),
    index('entities_type_idx').on(table.entityType),
    index('entities_status_idx').on(table.entityStatus),
    index('entities_visibility_idx').on(table.visibility),
  ],
);

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
