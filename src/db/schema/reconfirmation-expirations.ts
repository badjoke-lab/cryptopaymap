import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { acceptanceClaims } from './acceptance-claims';
import { acceptanceClaimStatusEnum, claimVisibilityEnum } from './enums';
import { adminActorTypeEnum } from './import-batches';
import { verificationEvents } from './verification-events';

export const reconfirmationExpirations = pgTable(
  'reconfirmation_expirations',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => acceptanceClaims.id, { onDelete: 'restrict' }),
    fromClaimStatus: acceptanceClaimStatusEnum('from_claim_status').notNull(),
    toClaimStatus: acceptanceClaimStatusEnum('to_claim_status').notNull(),
    claimVisibility: claimVisibilityEnum('claim_visibility').notNull(),
    verificationEventId: uuid('verification_event_id')
      .notNull()
      .references(() => verificationEvents.id, { onDelete: 'restrict' }),
    expectedClaimUpdatedAt: timestamp('expected_claim_updated_at', {
      withTimezone: true,
    }).notNull(),
    expectedNextReviewAt: timestamp('expected_next_review_at', {
      withTimezone: true,
    }).notNull(),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    reasonCode: varchar('reason_code', { length: 96 }).notNull(),
    publicSummary: text('public_summary'),
    internalNote: text('internal_note'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('reconfirmation_expirations_request_unique').on(table.requestId),
    index('reconfirmation_expirations_claim_idx').on(table.claimId, table.effectiveAt),
    index('reconfirmation_expirations_event_idx').on(table.verificationEventId),
    index('reconfirmation_expirations_actor_idx').on(table.actorId, table.effectiveAt),
    check(
      'reconfirmation_expirations_status_shape',
      sql`${table.fromClaimStatus} = 'confirmed' and ${table.toClaimStatus} = 'stale'`,
    ),
    check(
      'reconfirmation_expirations_actor_shape',
      sql`${table.actorType} = 'system' and length(trim(${table.actorId})) > 0`,
    ),
    check(
      'reconfirmation_expirations_reason_shape',
      sql`${table.reasonCode} = 'review_window_expired'`,
    ),
    check(
      'reconfirmation_expirations_summary_nonempty',
      sql`${table.publicSummary} is null or length(trim(${table.publicSummary})) > 0`,
    ),
    check(
      'reconfirmation_expirations_note_nonempty',
      sql`${table.internalNote} is null or length(trim(${table.internalNote})) > 0`,
    ),
    check(
      'reconfirmation_expirations_time_order',
      sql`${table.expectedClaimUpdatedAt} <= ${table.effectiveAt} and ${table.expectedNextReviewAt} <= ${table.effectiveAt}`,
    ),
    check(
      'reconfirmation_expirations_fingerprint_nonempty',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
  ],
);

export type ReconfirmationExpiration = typeof reconfirmationExpirations.$inferSelect;
export type NewReconfirmationExpiration = typeof reconfirmationExpirations.$inferInsert;
