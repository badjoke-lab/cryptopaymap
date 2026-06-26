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
import { routeTypeEnum } from './enums';

export const paymentRegistryStatusValues = ['active', 'deprecated'] as const;
export const paymentMethodValues = [
  'onchain',
  'lightning_invoice',
  'lightning_nfc',
  'wallet_qr',
  'processor_checkout',
  'pos_terminal',
  'invoice',
  'payment_link',
] as const;

export const paymentRegistryStatusEnum = pgEnum(
  'payment_registry_status',
  paymentRegistryStatusValues,
);

export const paymentRoutes = pgTable(
  'payment_routes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: routeTypeEnum('slug').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    status: paymentRegistryStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('payment_routes_slug_unique').on(table.slug),
    index('payment_routes_status_idx').on(table.status),
  ],
);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    aliases: text('aliases').array(),
    description: text('description'),
    status: paymentRegistryStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('payment_methods_slug_unique').on(table.slug),
    index('payment_methods_status_idx').on(table.status),
  ],
);

export type PaymentRoute = typeof paymentRoutes.$inferSelect;
export type NewPaymentRoute = typeof paymentRoutes.$inferInsert;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
