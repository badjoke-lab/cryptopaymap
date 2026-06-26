import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const networkStatusValues = ['active', 'deprecated'] as const;
export const networkStatusEnum = pgEnum('network_status', networkStatusValues);

export const networks = pgTable(
  'networks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    aliases: text('aliases').array(),
    status: networkStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('networks_slug_unique').on(table.slug),
    index('networks_status_idx').on(table.status),
  ],
);

export type Network = typeof networks.$inferSelect;
export type NewNetwork = typeof networks.$inferInsert;
