import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { acceptanceClaims } from './acceptance-claims';
import { entities } from './entities';
import { evidence } from './evidence';
import { locations } from './locations';
import { licenses, sourceRecords } from './source-provenance';

export const mediaPurposeValues = [
  'evidence',
  'owner_verification',
  'public_gallery_candidate',
  'public_gallery',
  'canonical_logo',
] as const;
export const mediaRoleValues = [
  'cover',
  'gallery',
  'exterior',
  'interior',
  'product',
  'menu',
  'payment_sign',
  'checkout_terminal',
  'logo',
  'evidence_image',
  'owner_verification_proof',
] as const;
export const mediaReviewStatusValues = ['pending', 'accepted', 'rejected', 'superseded'] as const;
export const mediaRightsStatusValues = [
  'unknown',
  'submitted_with_permission',
  'licensed',
  'public_domain',
  'restricted',
] as const;
export const mediaVisibilityValues = ['private', 'public', 'restricted'] as const;
export const mediaVariantValues = ['original', 'display', 'thumbnail'] as const;
export const mediaStorageScopeValues = ['quarantine', 'private', 'public'] as const;
export const legacySourceSystemValues = ['cryptopaymap_v2', 'crypto_acceptance_registry'] as const;
export const legacyMigrationStatusValues = ['pending', 'mapped', 'unresolved', 'retired'] as const;

export const mediaPurposeEnum = pgEnum('media_purpose', mediaPurposeValues);
export const mediaRoleEnum = pgEnum('media_role', mediaRoleValues);
export const mediaReviewStatusEnum = pgEnum('media_review_status', mediaReviewStatusValues);
export const mediaRightsStatusEnum = pgEnum('media_rights_status', mediaRightsStatusValues);
export const mediaVisibilityEnum = pgEnum('media_visibility', mediaVisibilityValues);
export const mediaVariantEnum = pgEnum('media_variant', mediaVariantValues);
export const mediaStorageScopeEnum = pgEnum('media_storage_scope', mediaStorageScopeValues);
export const legacySourceSystemEnum = pgEnum('legacy_source_system', legacySourceSystemValues);
export const legacyMigrationStatusEnum = pgEnum(
  'legacy_migration_status',
  legacyMigrationStatusValues,
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purpose: mediaPurposeEnum('purpose').notNull(),
    role: mediaRoleEnum('role').notNull(),
    reviewStatus: mediaReviewStatusEnum('review_status').default('pending').notNull(),
    rightsStatus: mediaRightsStatusEnum('rights_status').default('unknown').notNull(),
    visibility: mediaVisibilityEnum('visibility').default('private').notNull(),
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    claimId: uuid('claim_id').references(() => acceptanceClaims.id, { onDelete: 'restrict' }),
    evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'restrict' }),
    submissionId: uuid('submission_id'),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'restrict',
    }),
    licenseId: uuid('license_id').references(() => licenses.id, { onDelete: 'restrict' }),
    attribution: text('attribution'),
    altText: text('alt_text'),
    rightsHolder: varchar('rights_holder', { length: 200 }),
    consentReference: varchar('consent_reference', { length: 256 }),
    displayOrder: integer('display_order').default(0).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('media_assets_entity_idx').on(table.entityId),
    index('media_assets_location_idx').on(table.locationId),
    index('media_assets_claim_idx').on(table.claimId),
    index('media_assets_evidence_idx').on(table.evidenceId),
    index('media_assets_submission_idx').on(table.submissionId),
    index('media_assets_source_record_idx').on(table.sourceRecordId),
    index('media_assets_license_idx').on(table.licenseId),
    index('media_assets_review_visibility_idx').on(table.reviewStatus, table.visibility),
    index('media_assets_purpose_order_idx').on(table.purpose, table.displayOrder),
    check(
      'media_assets_subject_exactly_one',
      sql`num_nonnulls(${table.entityId}, ${table.locationId}, ${table.claimId}, ${table.evidenceId}, ${table.submissionId}, ${table.sourceRecordId}) = 1`,
    ),
    check(
      'media_assets_purpose_role',
      sql`(${table.purpose} = 'evidence' and ${table.role} = 'evidence_image') or (${table.purpose} = 'owner_verification' and ${table.role} = 'owner_verification_proof') or (${table.purpose} = 'canonical_logo' and ${table.role} = 'logo') or (${table.purpose} in ('public_gallery_candidate', 'public_gallery') and ${table.role} in ('cover', 'gallery', 'exterior', 'interior', 'product', 'menu', 'payment_sign', 'checkout_terminal'))`,
    ),
    check(
      'media_assets_public_eligible',
      sql`${table.visibility} <> 'public' or (${table.reviewStatus} = 'accepted' and ${table.purpose} in ('public_gallery', 'canonical_logo') and ${table.rightsStatus} in ('submitted_with_permission', 'licensed', 'public_domain') and ${table.publishedAt} is not null and ${table.altText} is not null and ${table.deletedAt} is null)`,
    ),
    check(
      'media_assets_licensed_reference',
      sql`${table.rightsStatus} <> 'licensed' or ${table.licenseId} is not null`,
    ),
    check(
      'media_assets_permission_reference',
      sql`${table.rightsStatus} <> 'submitted_with_permission' or ${table.rightsHolder} is not null or ${table.consentReference} is not null`,
    ),
    check('media_assets_display_order_nonnegative', sql`${table.displayOrder} >= 0`),
    check(
      'media_assets_attribution_nonempty',
      sql`${table.attribution} is null or length(trim(${table.attribution})) > 0`,
    ),
    check(
      'media_assets_alt_text_nonempty',
      sql`${table.altText} is null or length(trim(${table.altText})) > 0`,
    ),
    check(
      'media_assets_rights_holder_nonempty',
      sql`${table.rightsHolder} is null or length(trim(${table.rightsHolder})) > 0`,
    ),
    check(
      'media_assets_consent_reference_nonempty',
      sql`${table.consentReference} is null or length(trim(${table.consentReference})) > 0`,
    ),
  ],
);

export const mediaFiles = pgTable(
  'media_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    variant: mediaVariantEnum('variant').notNull(),
    storageScope: mediaStorageScopeEnum('storage_scope').notNull(),
    storageKey: text('storage_key').notNull(),
    originalFilename: varchar('original_filename', { length: 256 }),
    mimeType: varchar('mime_type', { length: 127 }).notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_files_storage_key_unique').on(table.storageKey),
    uniqueIndex('media_files_asset_variant_unique').on(table.mediaAssetId, table.variant),
    index('media_files_asset_idx').on(table.mediaAssetId),
    index('media_files_content_hash_idx').on(table.contentHash),
    check('media_files_storage_key_nonempty', sql`length(trim(${table.storageKey})) > 0`),
    check('media_files_mime_type_nonempty', sql`length(trim(${table.mimeType})) > 0`),
    check('media_files_byte_size_positive', sql`${table.byteSize} > 0`),
    check(
      'media_files_dimensions_pair',
      sql`(${table.width} is null and ${table.height} is null) or (${table.width} > 0 and ${table.height} > 0)`,
    ),
    check('media_files_content_hash_sha256', sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'media_files_original_filename_nonempty',
      sql`${table.originalFilename} is null or length(trim(${table.originalFilename})) > 0`,
    ),
    check(
      'media_files_original_filename_scope',
      sql`${table.originalFilename} is null or ${table.variant} = 'original'`,
    ),
    check(
      'media_files_original_not_public',
      sql`${table.variant} <> 'original' or ${table.storageScope} <> 'public'`,
    ),
    check(
      'media_files_public_format',
      sql`${table.storageScope} <> 'public' or (${table.variant} <> 'original' and ${table.mimeType} in ('image/jpeg', 'image/webp'))`,
    ),
  ],
);

export const legacyPlaceIds = pgTable(
  'legacy_place_ids',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceSystem: legacySourceSystemEnum('source_system').notNull(),
    legacyId: varchar('legacy_id', { length: 256 }).notNull(),
    legacyPath: text('legacy_path'),
    migrationStatus: legacyMigrationStatusEnum('migration_status').default('pending').notNull(),
    canonicalPath: text('canonical_path'),
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    sourceRecordId: uuid('source_record_id').references(() => sourceRecords.id, {
      onDelete: 'restrict',
    }),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('legacy_place_ids_source_identity_unique').on(table.sourceSystem, table.legacyId),
    uniqueIndex('legacy_place_ids_legacy_path_unique')
      .on(table.legacyPath)
      .where(sql`${table.legacyPath} is not null`),
    index('legacy_place_ids_status_idx').on(table.migrationStatus),
    index('legacy_place_ids_entity_idx').on(table.entityId),
    index('legacy_place_ids_location_idx').on(table.locationId),
    index('legacy_place_ids_source_record_idx').on(table.sourceRecordId),
    check('legacy_place_ids_legacy_id_nonempty', sql`length(trim(${table.legacyId})) > 0`),
    check(
      'legacy_place_ids_state_shape',
      sql`(${table.migrationStatus} = 'pending' and ${table.resolvedAt} is null and ${table.canonicalPath} is null and num_nonnulls(${table.entityId}, ${table.locationId}) = 0) or (${table.migrationStatus} = 'mapped' and ${table.resolvedAt} is not null and ${table.canonicalPath} is not null and num_nonnulls(${table.entityId}, ${table.locationId}) = 1) or (${table.migrationStatus} in ('unresolved', 'retired') and ${table.resolvedAt} is not null and ${table.canonicalPath} is null and num_nonnulls(${table.entityId}, ${table.locationId}) = 0)`,
    ),
    check(
      'legacy_place_ids_source_target',
      sql`${table.migrationStatus} <> 'mapped' or (${table.sourceSystem} = 'cryptopaymap_v2' and ${table.locationId} is not null and ${table.entityId} is null) or (${table.sourceSystem} = 'crypto_acceptance_registry' and ${table.entityId} is not null and ${table.locationId} is null)`,
    ),
    check(
      'legacy_place_ids_legacy_path_format',
      sql`${table.legacyPath} is null or ${table.legacyPath} ~ '^/[^?#]*$'`,
    ),
    check(
      'legacy_place_ids_canonical_path_format',
      sql`${table.canonicalPath} is null or ${table.canonicalPath} ~ '^/[^?#]+$'`,
    ),
    check(
      'legacy_place_ids_path_change',
      sql`${table.legacyPath} is null or ${table.canonicalPath} is null or ${table.legacyPath} <> ${table.canonicalPath}`,
    ),
    check(
      'legacy_place_ids_resolution_note_required',
      sql`${table.migrationStatus} not in ('unresolved', 'retired') or ${table.resolutionNote} is not null`,
    ),
    check(
      'legacy_place_ids_resolution_note_nonempty',
      sql`${table.resolutionNote} is null or length(trim(${table.resolutionNote})) > 0`,
    ),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type MediaFile = typeof mediaFiles.$inferSelect;
export type NewMediaFile = typeof mediaFiles.$inferInsert;
export type LegacyPlaceId = typeof legacyPlaceIds.$inferSelect;
export type NewLegacyPlaceId = typeof legacyPlaceIds.$inferInsert;
