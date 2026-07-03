import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { adminActorTypeEnum } from './import-batches';
import {
  mediaAssets,
  mediaFiles,
  mediaPurposeEnum,
  mediaReviewStatusEnum,
  mediaRightsStatusEnum,
  mediaVisibilityEnum,
} from './media-legacy';

export const mediaReviewActionValues = [
  'approve_private',
  'approve_public',
  'reject',
  'restrict',
  'supersede',
] as const;
export const mediaReviewTargetMatchValues = ['confirmed', 'uncertain', 'wrong_target'] as const;
export const mediaReviewPrivacyValues = ['cleared', 'private_only', 'blocked'] as const;
export const mediaReviewSubjectTypeValues = [
  'entity',
  'location',
  'claim',
  'evidence',
  'submission',
  'source_record',
] as const;

export const mediaReviewActionEnum = pgEnum('media_review_action', mediaReviewActionValues);
export const mediaReviewTargetMatchEnum = pgEnum(
  'media_review_target_match',
  mediaReviewTargetMatchValues,
);
export const mediaReviewPrivacyEnum = pgEnum('media_review_privacy', mediaReviewPrivacyValues);
export const mediaReviewSubjectTypeEnum = pgEnum(
  'media_review_subject_type',
  mediaReviewSubjectTypeValues,
);

export const mediaReviewDecisions = pgTable(
  'media_review_decisions',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    action: mediaReviewActionEnum('action').notNull(),
    targetMatch: mediaReviewTargetMatchEnum('target_match').notNull(),
    privacyReview: mediaReviewPrivacyEnum('privacy_review').notNull(),
    expectedMediaUpdatedAt: timestamp('expected_media_updated_at', {
      withTimezone: true,
    }).notNull(),
    expectedReviewStatus: mediaReviewStatusEnum('expected_review_status').notNull(),
    expectedPurpose: mediaPurposeEnum('expected_purpose').notNull(),
    expectedRightsStatus: mediaRightsStatusEnum('expected_rights_status').notNull(),
    expectedVisibility: mediaVisibilityEnum('expected_visibility').notNull(),
    expectedSubjectType: mediaReviewSubjectTypeEnum('expected_subject_type').notNull(),
    expectedSubjectId: uuid('expected_subject_id').notNull(),
    expectedFiles: jsonb('expected_files').$type<unknown[]>().notNull(),
    toReviewStatus: mediaReviewStatusEnum('to_review_status').notNull(),
    toPurpose: mediaPurposeEnum('to_purpose').notNull(),
    toRightsStatus: mediaRightsStatusEnum('to_rights_status').notNull(),
    toVisibility: mediaVisibilityEnum('to_visibility').notNull(),
    licenseId: uuid('license_id'),
    rightsHolder: varchar('rights_holder', { length: 200 }),
    consentReference: varchar('consent_reference', { length: 256 }),
    attribution: text('attribution'),
    licenseAttributionRequired: boolean('license_attribution_required'),
    altText: text('alt_text'),
    displayOrder: integer('display_order'),
    publicDisplayFileId: uuid('public_display_file_id').references(() => mediaFiles.id, {
      onDelete: 'restrict',
    }),
    publicThumbnailFileId: uuid('public_thumbnail_file_id').references(() => mediaFiles.id, {
      onDelete: 'restrict',
    }),
    publicFileIds: jsonb('public_file_ids').$type<string[]>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    reasonCode: varchar('reason_code', { length: 96 }).notNull(),
    publicSummary: text('public_summary'),
    internalNote: text('internal_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_review_decisions_request_unique').on(table.requestId),
    index('media_review_decisions_asset_idx').on(table.mediaAssetId, table.decidedAt),
    index('media_review_decisions_actor_idx').on(table.actorId, table.decidedAt),
    index('media_review_decisions_action_idx').on(table.action, table.decidedAt),
    check(
      'media_review_decisions_expected_files_array',
      sql`jsonb_typeof(${table.expectedFiles}) = 'array' and jsonb_array_length(${table.expectedFiles}) between 0 and 3`,
    ),
    check(
      'media_review_decisions_public_files_array',
      sql`jsonb_typeof(${table.publicFileIds}) = 'array' and jsonb_array_length(${table.publicFileIds}) between 0 and 3`,
    ),
    check('media_review_decisions_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check('media_review_decisions_reason_nonempty', sql`length(trim(${table.reasonCode})) > 0`),
    check(
      'media_review_decisions_fingerprint_nonempty',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
    check(
      'media_review_decisions_summary_required',
      sql`${table.publicSummary} is not null or ${table.internalNote} is not null`,
    ),
    check(
      'media_review_decisions_time_order',
      sql`${table.expectedMediaUpdatedAt} <= ${table.decidedAt}`,
    ),
    check(
      'media_review_decisions_private_approval_shape',
      sql`${table.action} <> 'approve_private' or (${table.expectedReviewStatus} = 'pending' and ${table.expectedPurpose} in ('evidence', 'owner_verification') and ${table.expectedVisibility} = 'private' and ${table.targetMatch} = 'confirmed' and ${table.privacyReview} <> 'blocked' and ${table.toReviewStatus} = 'accepted' and ${table.toPurpose} = ${table.expectedPurpose} and ${table.toVisibility} = 'private' and jsonb_array_length(${table.publicFileIds}) = 0)`,
    ),
    check(
      'media_review_decisions_public_approval_shape',
      sql`${table.action} <> 'approve_public' or (${table.expectedReviewStatus} = 'pending' and ${table.expectedPurpose} in ('public_gallery_candidate', 'canonical_logo') and ${table.expectedVisibility} = 'private' and ${table.targetMatch} = 'confirmed' and ${table.privacyReview} = 'cleared' and ${table.toReviewStatus} = 'accepted' and ${table.toPurpose} in ('public_gallery', 'canonical_logo') and ${table.toRightsStatus} in ('submitted_with_permission', 'licensed', 'public_domain') and ${table.toVisibility} = 'public' and ${table.altText} is not null and ${table.displayOrder} is not null and ${table.publicDisplayFileId} is not null and ${table.publishedAt} = ${table.decidedAt})`,
    ),
    check(
      'media_review_decisions_reject_shape',
      sql`${table.action} <> 'reject' or (${table.expectedReviewStatus} = 'pending' and ${table.toReviewStatus} = 'rejected' and ${table.toVisibility} = 'private' and jsonb_array_length(${table.publicFileIds}) = 0)`,
    ),
    check(
      'media_review_decisions_restrict_shape',
      sql`${table.action} <> 'restrict' or (${table.expectedReviewStatus} = 'accepted' and ${table.expectedVisibility} = 'public' and ${table.toReviewStatus} = 'accepted' and ${table.toVisibility} = 'restricted')`,
    ),
    check(
      'media_review_decisions_supersede_shape',
      sql`${table.action} <> 'supersede' or (${table.expectedReviewStatus} = 'accepted' and ${table.expectedPurpose} in ('public_gallery', 'canonical_logo') and ${table.expectedVisibility} in ('public', 'restricted') and ${table.toReviewStatus} = 'superseded' and ${table.toVisibility} = 'restricted')`,
    ),
    check(
      'media_review_decisions_license_shape',
      sql`${table.toRightsStatus} <> 'licensed' or ${table.licenseId} is not null`,
    ),
    check(
      'media_review_decisions_permission_shape',
      sql`${table.toRightsStatus} <> 'submitted_with_permission' or ${table.rightsHolder} is not null or ${table.consentReference} is not null`,
    ),
    check(
      'media_review_decisions_attribution_shape',
      sql`${table.licenseAttributionRequired} is not true or ${table.attribution} is not null`,
    ),
    check(
      'media_review_decisions_display_order_nonnegative',
      sql`${table.displayOrder} is null or ${table.displayOrder} >= 0`,
    ),
  ],
);

export type MediaReviewDecision = typeof mediaReviewDecisions.$inferSelect;
export type NewMediaReviewDecision = typeof mediaReviewDecisions.$inferInsert;
