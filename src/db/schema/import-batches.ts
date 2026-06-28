import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sources } from './source-provenance';

export const importKindValues = ['physical_place', 'online_service'] as const;
export const importKindEnum = pgEnum('import_kind', importKindValues);
export const adminActorTypeValues = ['human', 'system'] as const;
export const adminActorTypeEnum = pgEnum('admin_actor_type', adminActorTypeValues);

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    importKind: importKindEnum('import_kind').notNull(),
    sourceSchemaVersion: varchar('source_schema_version', { length: 96 }).notNull(),
    importerVersion: varchar('importer_version', { length: 32 }).notNull(),
    inputChecksum: varchar('input_checksum', { length: 64 }).notNull(),
    inputCount: integer('input_count').notNull(),
    acceptedCount: integer('accepted_count').notNull(),
    rejectedCount: integer('rejected_count').notNull(),
    replayedCount: integer('replayed_count').notNull(),
    outOfScopeCount: integer('out_of_scope_count').default(0).notNull(),
    duplicateSignalCount: integer('duplicate_signal_count').default(0).notNull(),
    automaticConfirmedCount: integer('automatic_confirmed_count').default(0).notNull(),
    rejectionSummary: jsonb('rejection_summary').$type<Record<string, number>>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('import_batches_request_id_unique').on(table.requestId),
    uniqueIndex('import_batches_source_checksum_unique').on(
      table.sourceId,
      table.importKind,
      table.importerVersion,
      table.inputChecksum,
    ),
    index('import_batches_actor_completed_idx').on(table.actorId, table.completedAt),
    index('import_batches_source_completed_idx').on(table.sourceId, table.completedAt),
    index('import_batches_kind_completed_idx').on(table.importKind, table.completedAt),
    check('import_batches_actor_id_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'import_batches_source_schema_version_nonempty',
      sql`length(trim(${table.sourceSchemaVersion})) > 0`,
    ),
    check(
      'import_batches_importer_version_nonempty',
      sql`length(trim(${table.importerVersion})) > 0`,
    ),
    check('import_batches_input_checksum_sha256', sql`${table.inputChecksum} ~ '^[a-f0-9]{64}$'`),
    check(
      'import_batches_counts_nonnegative',
      sql`${table.inputCount} >= 0 and ${table.acceptedCount} >= 0 and ${table.rejectedCount} >= 0 and ${table.replayedCount} >= 0 and ${table.outOfScopeCount} >= 0 and ${table.duplicateSignalCount} >= 0 and ${table.automaticConfirmedCount} >= 0`,
    ),
    check(
      'import_batches_input_count_shape',
      sql`${table.inputCount} = ${table.acceptedCount} + ${table.rejectedCount} + ${table.replayedCount}`,
    ),
    check(
      'import_batches_out_of_scope_subset',
      sql`${table.outOfScopeCount} <= ${table.rejectedCount}`,
    ),
    check('import_batches_no_automatic_confirmed', sql`${table.automaticConfirmedCount} = 0`),
    check('import_batches_time_order', sql`${table.startedAt} <= ${table.completedAt}`),
  ],
);

export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
