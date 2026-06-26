import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { assetStatusEnum, assetTypeEnum } from './asset-enums';

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    symbol: varchar('symbol', { length: 16 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    assetType: assetTypeEnum('asset_type').notNull(),
    status: assetStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('assets_slug_unique').on(table.slug),
    index('assets_symbol_idx').on(table.symbol),
  ],
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
