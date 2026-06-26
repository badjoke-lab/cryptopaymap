import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { acceptanceClaims } from './acceptance-claims';
import { licenses, sourceRecords } from './source-provenance';

export const evidenceKindValues = [
  'live_checkout',
  'official_payment_page',
  'verified_representative',
  'payment_proof',
  'official_social',
  'processor_case_study',
  'dated_osm_observation',
  'independent_user_report',
  'directory_listing',
  'undated_osm_tag',
  'article',
  'search_snippet',
  'platform_capability',
  'other',
] as const;
export const evidenceClassValues = ['a', 'b', 'c'] as const;
export const evidenceReviewStatusValues = [
  'pending',
  'accepted',
  'rejected',
  'superseded',
] as const;
export const evidenceVisibilityValues = ['public', 'private', 'restricted'] as const;
export const evidencePolarityValues = ['supporting', 'contradicting', 'neutral'] as const;
export const evidenceOriginRoleValues = [
  'merchant_side',
  'processor_side',
  'usage_side',
  'on_ground',
  'osm_side',
  'directory',
  'other',
] as const;
export const evidenceSourceTypeValues = [
  'official_page',
  'official_social',
  'processor',
  'openstreetmap',
  'directory',
  'article',
  'search',
  'user_submission',
  'business_representative',
  'live_observation',
  'payment_proof',
  'other',
] as const;

export const evidenceKindEnum = pgEnum('evidence_kind', evidenceKindValues);
export const evidenceClassEnum = pgEnum('evidence_class', evidenceClassValues);
export const evidenceReviewStatusEnum = pgEnum(
  'evidence_review_status',
  evidenceReviewStatusValues,
);
export const evidenceVisibilityEnum = pgEnum('evidence_visibility', evidenceVisibilityValues);
export const evidencePolarityEnum = pgEnum('evidence_polarity', evidencePolarityValues);
export const evidenceOriginRoleEnum = pgEnum('evidence_origin_role', evidenceOriginRoleValues);
export const evidenceSourceTypeEnum = pgEnum('evidence_source_type', evidenceSourceTypeValues);

export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    claimId: uuid('claim_id').references(() => acceptanceClaims.id, { onDelete: 'restrict' }),
    submissionId: uuid('submission_id'),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'restrict',
    }),
    evidenceKind: evidenceKindEnum('evidence_kind').notNull(),
    evidenceClass: evidenceClassEnum('evidence_class').notNull(),
    sourceType: evidenceSourceTypeEnum('source_type').notNull(),
    originRole: evidenceOriginRoleEnum('origin_role').notNull(),
    polarity: evidencePolarityEnum('polarity').default('supporting').notNull(),
    sourceName: varchar('source_name', { length: 160 }),
    sourceUrl: text('source_url'),
    sourceNativeId: varchar('source_native_id', { length: 256 }),
    observedAt: timestamp('observed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    summary: text('summary').notNull(),
    visibility: evidenceVisibilityEnum('visibility').default('private').notNull(),
    reviewStatus: evidenceReviewStatusEnum('review_status').default('pending').notNull(),
    archiveUrl: text('archive_url'),
    contentHash: varchar('content_hash', { length: 128 }),
    licenseId: uuid('license_id').references(() => licenses.id, { onDelete: 'restrict' }),
    attribution: text('attribution'),
    independenceKey: varchar('independence_key', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('evidence_claim_idx').on(table.claimId),
    index('evidence_submission_idx').on(table.submissionId),
    index('evidence_source_record_idx').on(table.sourceRecordId),
    index('evidence_review_idx').on(table.reviewStatus, table.evidenceClass),
    index('evidence_observed_idx').on(table.observedAt),
    index('evidence_content_hash_idx').on(table.contentHash),
    index('evidence_license_idx').on(table.licenseId),
    check(
      'evidence_parent_required',
      sql`${table.claimId} is not null or ${table.submissionId} is not null or ${table.sourceRecordId} is not null`,
    ),
    check(
      'evidence_public_reviewed',
      sql`${table.visibility} <> 'public' or ${table.reviewStatus} = 'accepted'`,
    ),
    check(
      'evidence_accepted_observation',
      sql`${table.reviewStatus} <> 'accepted' or ${table.evidenceClass} = 'c' or ${table.observedAt} is not null`,
    ),
    check(
      'evidence_accepted_b_independence',
      sql`${table.reviewStatus} <> 'accepted' or ${table.evidenceClass} <> 'b' or ${table.independenceKey} is not null`,
    ),
    check('evidence_summary_nonempty', sql`length(trim(${table.summary})) > 0`),
    check(
      'evidence_source_name_nonempty',
      sql`${table.sourceName} is null or length(trim(${table.sourceName})) > 0`,
    ),
    check(
      'evidence_source_url_nonempty',
      sql`${table.sourceUrl} is null or length(trim(${table.sourceUrl})) > 0`,
    ),
    check(
      'evidence_archive_url_nonempty',
      sql`${table.archiveUrl} is null or length(trim(${table.archiveUrl})) > 0`,
    ),
    check(
      'evidence_content_hash_nonempty',
      sql`${table.contentHash} is null or length(trim(${table.contentHash})) > 0`,
    ),
    check(
      'evidence_independence_key_nonempty',
      sql`${table.independenceKey} is null or length(trim(${table.independenceKey})) > 0`,
    ),
  ],
);

export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
