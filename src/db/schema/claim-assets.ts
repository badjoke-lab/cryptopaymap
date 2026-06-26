import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { acceptanceClaims } from './acceptance-claims';
import { assets } from './assets';
import { networks } from './networks';
import { paymentMethods } from './payment-registries';

export const claimAssets = pgTable(
  'claim_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => acceptanceClaims.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    networkId: uuid('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    paymentMethodId: uuid('payment_method_id')
      .notNull()
      .references(() => paymentMethods.id, { onDelete: 'restrict' }),
    contractAddress: text('contract_address'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('claim_assets_without_contract_unique')
      .on(table.claimId, table.assetId, table.networkId, table.paymentMethodId)
      .where(sql`${table.contractAddress} is null`),
    uniqueIndex('claim_assets_with_contract_unique')
      .on(
        table.claimId,
        table.assetId,
        table.networkId,
        table.paymentMethodId,
        table.contractAddress,
      )
      .where(sql`${table.contractAddress} is not null`),
    uniqueIndex('claim_assets_primary_per_claim_unique')
      .on(table.claimId)
      .where(sql`${table.isPrimary} = true`),
    index('claim_assets_claim_idx').on(table.claimId),
    index('claim_assets_asset_network_idx').on(table.assetId, table.networkId),
    index('claim_assets_payment_method_idx').on(table.paymentMethodId),
    check(
      'claim_assets_contract_address_nonempty',
      sql`${table.contractAddress} is null or length(trim(${table.contractAddress})) > 0`,
    ),
    check(
      'claim_assets_notes_nonempty',
      sql`${table.notes} is null or length(trim(${table.notes})) > 0`,
    ),
  ],
);

export type ClaimAsset = typeof claimAssets.$inferSelect;
export type NewClaimAsset = typeof claimAssets.$inferInsert;
