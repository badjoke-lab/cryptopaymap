import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { acceptanceClaims } from './acceptance-claims';
import { entities } from './entities';
import { adminActorTypeEnum } from './import-batches';
import { locations } from './locations';
import { sourceCandidates } from './source-provenance';

export const candidatePromotionDecisions = pgTable(
  'candidate_promotion_decisions',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => sourceCandidates.id, { onDelete: 'restrict' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => acceptanceClaims.id, { onDelete: 'restrict' }),
    claimAssetIds: jsonb('claim_asset_ids').$type<string[]>().notNull(),
    sourceRecordIds: jsonb('source_record_ids').$type<string[]>().notNull(),
    canonicalPath: text('canonical_path').notNull(),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    expectedCandidateUpdatedAt: timestamp('expected_candidate_updated_at', {
      withTimezone: true,
    }).notNull(),
    promotedAt: timestamp('promoted_at', { withTimezone: true }).notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('candidate_promotion_decisions_request_unique').on(table.requestId),
    uniqueIndex('candidate_promotion_decisions_candidate_unique').on(table.candidateId),
    uniqueIndex('candidate_promotion_decisions_claim_unique').on(table.claimId),
    index('candidate_promotion_decisions_entity_idx').on(table.entityId),
    index('candidate_promotion_decisions_location_idx').on(table.locationId),
    index('candidate_promotion_decisions_actor_idx').on(table.actorId, table.promotedAt),
    check(
      'candidate_promotion_decisions_claim_assets_array',
      sql`jsonb_typeof(${table.claimAssetIds}) = 'array' and jsonb_array_length(${table.claimAssetIds}) between 1 and 100`,
    ),
    check(
      'candidate_promotion_decisions_source_records_array',
      sql`jsonb_typeof(${table.sourceRecordIds}) = 'array' and jsonb_array_length(${table.sourceRecordIds}) between 1 and 100`,
    ),
    check(
      'candidate_promotion_decisions_canonical_path_format',
      sql`${table.canonicalPath} ~ '^/(place|service)/[^/?#]+$'`,
    ),
    check('candidate_promotion_decisions_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'candidate_promotion_decisions_fingerprint_nonempty',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
    check(
      'candidate_promotion_decisions_time_order',
      sql`${table.expectedCandidateUpdatedAt} <= ${table.promotedAt}`,
    ),
    check(
      'candidate_promotion_decisions_location_shape',
      sql`(${table.canonicalPath} like '/place/%' and ${table.locationId} is not null) or (${table.canonicalPath} like '/service/%' and ${table.locationId} is null)`,
    ),
  ],
);

export type CandidatePromotionDecision = typeof candidatePromotionDecisions.$inferSelect;
export type NewCandidatePromotionDecision = typeof candidatePromotionDecisions.$inferInsert;
