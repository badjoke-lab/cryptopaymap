import {
  boolean,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const assetTypeValues = ['native', 'token', 'other'] as const;
export const assetStatusValues = ['active', 'deprecated'] as const;
export const assetTypeEnum = pgEnum('asset_type', assetTypeValues);
export const assetStatusEnum = pgEnum('asset_status', assetStatusValues);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    symbol: varchar('symbol', { length: 16 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    aliases: text('aliases').array(),
    assetType: assetTypeEnum('asset_type').notNull(),
    isStablecoin: boolean('is_stablecoin').default(false).notNull(),
    isWrapped: boolean('is_wrapped').default(false).notNull(),
    defaultDecimals: smallint('default_decimals'),
    status: assetStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('assets_slug_unique').on(table.slug),
    index('assets_symbol_idx').on(table.symbol),
    index('assets_status_idx').on(table.status),
  ],
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
