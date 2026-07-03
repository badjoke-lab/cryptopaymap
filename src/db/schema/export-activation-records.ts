import { sql } from 'drizzle-orm';
import {
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
import { adminActorTypeEnum } from './import-batches';

export const exportActivationStatusValues = ['active'] as const;

export const exportActivationStatusEnum = pgEnum(
  'export_activation_status',
  exportActivationStatusValues,
);

export const exportActivationRecords = pgTable(
  'export_activation_records',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    approvalRequestId: uuid('approval_request_id').notNull(),
    activationStatus: exportActivationStatusEnum('activation_status').notNull(),
    snapshotDigest: varchar('snapshot_digest', { length: 64 }).notNull(),
    datasetVersion: varchar('dataset_version', { length: 64 }).notNull(),
    schemaVersion: varchar('schema_version', { length: 32 }).notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    previousSnapshotDigest: varchar('previous_snapshot_digest', { length: 64 }),
    pointerKey: varchar('pointer_key', { length: 512 }).notNull(),
    releasePrefix: varchar('release_prefix', { length: 512 }).notNull(),
    artifactCount: integer('artifact_count').notNull(),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    reasonCode: varchar('reason_code', { length: 96 }).notNull(),
    internalNote: text('internal_note'),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('export_activation_records_request_unique').on(table.requestId),
    uniqueIndex('export_activation_records_snapshot_unique').on(table.snapshotDigest),
    uniqueIndex('export_activation_records_dataset_unique').on(table.datasetVersion),
    index('export_activation_records_published_idx').on(table.publishedAt),
    index('export_activation_records_actor_idx').on(table.actorId, table.publishedAt),
    check(
      'export_activation_records_digest_shape',
      sql`${table.snapshotDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'export_activation_records_previous_digest_shape',
      sql`${table.previousSnapshotDigest} is null or ${table.previousSnapshotDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'export_activation_records_distinct_previous_digest',
      sql`${table.previousSnapshotDigest} is null or ${table.previousSnapshotDigest} <> ${table.snapshotDigest}`,
    ),
    check(
      'export_activation_records_artifact_count_range',
      sql`${table.artifactCount} between 1 and 100`,
    ),
    check(
      'export_activation_records_time_order',
      sql`${table.generatedAt} <= ${table.publishedAt}`,
    ),
    check('export_activation_records_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check('export_activation_records_reason_nonempty', sql`length(trim(${table.reasonCode})) > 0`),
    check(
      'export_activation_records_fingerprint_nonempty',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
  ],
);

export type ExportActivationRecord = typeof exportActivationRecords.$inferSelect;
export type NewExportActivationRecord = typeof exportActivationRecords.$inferInsert;
