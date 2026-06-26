import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { entities } from './entities';
import { locations } from './locations';

export const sourceTypeValues = [
  'osm',
  'official_site',
  'official_social',
  'processor',
  'directory',
  'user_submission',
  'legacy_import',
  'business_representative',
  'live_observation',
  'payment_proof',
  'other',
] as const;
export const candidateTypeValues = [
  'physical_place',
  'online_service',
  'payment_processor',
  'payment_program',
  'platform',
] as const;
export const candidateStatusValues = [
  'new',
  'triaged',
  'linked',
  'promoted',
  'duplicate',
  'rejected',
  'archived',
] as const;
export const duplicateGroupStatusValues = ['open', 'resolved', 'dismissed'] as const;
export const candidateSourceRelationshipValues = [
  'origin',
  'supporting',
  'contradiction',
  'update',
  'duplicate_signal',
] as const;
export const provenanceSubjectTypeValues = [
  'entity',
  'location',
  'acceptance_claim',
  'claim_asset',
  'evidence',
  'verification_event',
  'media',
] as const;
export const provenanceRoleValues = [
  'origin',
  'verification',
  'correction',
  'attribution',
] as const;

export const sourceTypeEnum = pgEnum('source_type', sourceTypeValues);
export const candidateTypeEnum = pgEnum('candidate_type', candidateTypeValues);
export const candidateStatusEnum = pgEnum('candidate_status', candidateStatusValues);
export const duplicateGroupStatusEnum = pgEnum(
  'duplicate_group_status',
  duplicateGroupStatusValues,
);
export const candidateSourceRelationshipEnum = pgEnum(
  'candidate_source_relationship',
  candidateSourceRelationshipValues,
);
export const provenanceSubjectTypeEnum = pgEnum(
  'provenance_subject_type',
  provenanceSubjectTypeValues,
);
export const provenanceRoleEnum = pgEnum('provenance_role', provenanceRoleValues);

export const licenses = pgTable(
  'licenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 96 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    version: varchar('version', { length: 64 }),
    url: text('url'),
    attributionRequired: boolean('attribution_required').default(false).notNull(),
    shareAlike: boolean('share_alike').default(false).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('licenses_slug_unique').on(table.slug),
    check('licenses_slug_nonempty', sql`length(trim(${table.slug})) > 0`),
    check('licenses_name_nonempty', sql`length(trim(${table.name})) > 0`),
    check('licenses_url_nonempty', sql`${table.url} is null or length(trim(${table.url})) > 0`),
    check(
      'licenses_notes_nonempty',
      sql`${table.notes} is null or length(trim(${table.notes})) > 0`,
    ),
  ],
);

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceType: sourceTypeEnum('source_type').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    baseUrl: text('base_url'),
    defaultLicenseId: uuid('default_license_id').references(() => licenses.id, {
      onDelete: 'restrict',
    }),
    attributionText: text('attribution_text'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sources_type_active_idx').on(table.sourceType, table.isActive),
    index('sources_default_license_idx').on(table.defaultLicenseId),
    check('sources_name_nonempty', sql`length(trim(${table.name})) > 0`),
    check(
      'sources_base_url_nonempty',
      sql`${table.baseUrl} is null or length(trim(${table.baseUrl})) > 0`,
    ),
    check(
      'sources_attribution_nonempty',
      sql`${table.attributionText} is null or length(trim(${table.attributionText})) > 0`,
    ),
  ],
);

export const sourceRecords = pgTable(
  'source_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    externalId: varchar('external_id', { length: 256 }),
    sourceUrl: text('source_url'),
    rawPayload: jsonb('raw_payload').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    contentHash: varchar('content_hash', { length: 128 }),
    archiveUrl: text('archive_url'),
    licenseId: uuid('license_id').references(() => licenses.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('source_records_external_identity_unique')
      .on(table.sourceId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    index('source_records_source_fetched_idx').on(table.sourceId, table.fetchedAt),
    index('source_records_content_hash_idx').on(table.contentHash),
    index('source_records_license_idx').on(table.licenseId),
    check(
      'source_records_identity_required',
      sql`${table.externalId} is not null or ${table.sourceUrl} is not null or ${table.contentHash} is not null`,
    ),
    check(
      'source_records_external_id_nonempty',
      sql`${table.externalId} is null or length(trim(${table.externalId})) > 0`,
    ),
    check(
      'source_records_source_url_nonempty',
      sql`${table.sourceUrl} is null or length(trim(${table.sourceUrl})) > 0`,
    ),
    check(
      'source_records_archive_url_nonempty',
      sql`${table.archiveUrl} is null or length(trim(${table.archiveUrl})) > 0`,
    ),
    check(
      'source_records_content_hash_nonempty',
      sql`${table.contentHash} is null or length(trim(${table.contentHash})) > 0`,
    ),
    check(
      'source_records_archive_requires_source',
      sql`${table.archiveUrl} is null or ${table.sourceUrl} is not null`,
    ),
  ],
);

export const candidateDuplicateGroups = pgTable(
  'candidate_duplicate_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: duplicateGroupStatusEnum('status').default('open').notNull(),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('candidate_duplicate_groups_status_idx').on(table.status),
    check(
      'candidate_duplicate_groups_resolution_note_nonempty',
      sql`${table.resolutionNote} is null or length(trim(${table.resolutionNote})) > 0`,
    ),
    check(
      'candidate_duplicate_groups_resolution_time',
      sql`(${table.status} = 'open' and ${table.resolvedAt} is null) or (${table.status} in ('resolved', 'dismissed') and ${table.resolvedAt} is not null)`,
    ),
  ],
);

export const sourceCandidates = pgTable(
  'source_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateType: candidateTypeEnum('candidate_type').notNull(),
    normalizedName: varchar('normalized_name', { length: 200 }).notNull(),
    candidateStatus: candidateStatusEnum('candidate_status').default('new').notNull(),
    priority: integer('priority'),
    duplicateGroupId: uuid('duplicate_group_id').references(() => candidateDuplicateGroups.id, {
      onDelete: 'restrict',
    }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    importBatchId: uuid('import_batch_id'),
    canonicalEntityId: uuid('canonical_entity_id').references(() => entities.id, {
      onDelete: 'restrict',
    }),
    canonicalLocationId: uuid('canonical_location_id').references(() => locations.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('source_candidates_status_priority_idx').on(table.candidateStatus, table.priority),
    index('source_candidates_normalized_name_idx').on(table.normalizedName),
    index('source_candidates_duplicate_group_idx').on(table.duplicateGroupId),
    index('source_candidates_canonical_entity_idx').on(table.canonicalEntityId),
    index('source_candidates_canonical_location_idx').on(table.canonicalLocationId),
    index('source_candidates_import_batch_idx').on(table.importBatchId),
    check(
      'source_candidates_normalized_name_nonempty',
      sql`length(trim(${table.normalizedName})) > 0`,
    ),
    check(
      'source_candidates_priority_range',
      sql`${table.priority} is null or ${table.priority} between 0 and 1000`,
    ),
    check('source_candidates_seen_order', sql`${table.firstSeenAt} <= ${table.lastSeenAt}`),
    check(
      'source_candidates_location_type',
      sql`${table.canonicalLocationId} is null or ${table.candidateType} = 'physical_place'`,
    ),
    check(
      'source_candidates_linked_canonical',
      sql`${table.candidateStatus} not in ('linked', 'promoted') or ${table.canonicalEntityId} is not null or ${table.canonicalLocationId} is not null`,
    ),
    check(
      'source_candidates_duplicate_group',
      sql`${table.candidateStatus} <> 'duplicate' or ${table.duplicateGroupId} is not null`,
    ),
  ],
);

export const candidateSourceRecords = pgTable(
  'candidate_source_records',
  {
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => sourceCandidates.id, { onDelete: 'cascade' }),
    sourceRecordId: uuid('source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    relationship: candidateSourceRelationshipEnum('relationship').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'candidate_source_records_pk',
      columns: [table.candidateId, table.sourceRecordId],
    }),
    index('candidate_source_records_source_idx').on(table.sourceRecordId),
  ],
);

export const provenanceLinks = pgTable(
  'provenance_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectType: provenanceSubjectTypeEnum('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    fieldPath: varchar('field_path', { length: 160 }),
    sourceRecordId: uuid('source_record_id')
      .notNull()
      .references(() => sourceRecords.id, { onDelete: 'restrict' }),
    licenseId: uuid('license_id').references(() => licenses.id, { onDelete: 'restrict' }),
    provenanceRole: provenanceRoleEnum('provenance_role').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('provenance_links_record_unique')
      .on(table.subjectType, table.subjectId, table.sourceRecordId, table.provenanceRole)
      .where(sql`${table.fieldPath} is null`),
    uniqueIndex('provenance_links_field_unique')
      .on(
        table.subjectType,
        table.subjectId,
        table.fieldPath,
        table.sourceRecordId,
        table.provenanceRole,
      )
      .where(sql`${table.fieldPath} is not null`),
    index('provenance_links_subject_idx').on(table.subjectType, table.subjectId),
    index('provenance_links_source_record_idx').on(table.sourceRecordId),
    index('provenance_links_license_idx').on(table.licenseId),
    check(
      'provenance_links_field_path_nonempty',
      sql`${table.fieldPath} is null or length(trim(${table.fieldPath})) > 0`,
    ),
    check(
      'provenance_links_effective_order',
      sql`${table.effectiveFrom} is null or ${table.effectiveTo} is null or ${table.effectiveFrom} <= ${table.effectiveTo}`,
    ),
  ],
);

export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type SourceRecord = typeof sourceRecords.$inferSelect;
export type NewSourceRecord = typeof sourceRecords.$inferInsert;
export type CandidateDuplicateGroup = typeof candidateDuplicateGroups.$inferSelect;
export type NewCandidateDuplicateGroup = typeof candidateDuplicateGroups.$inferInsert;
export type SourceCandidate = typeof sourceCandidates.$inferSelect;
export type NewSourceCandidate = typeof sourceCandidates.$inferInsert;
export type CandidateSourceRecord = typeof candidateSourceRecords.$inferSelect;
export type NewCandidateSourceRecord = typeof candidateSourceRecords.$inferInsert;
export type ProvenanceLink = typeof provenanceLinks.$inferSelect;
export type NewProvenanceLink = typeof provenanceLinks.$inferInsert;
