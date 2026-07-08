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
import { adminActorTypeEnum } from './import-batches';
import { locations } from './locations';

export interface LocationProfileCorrectionProvenanceAssignmentValue {
  fieldPath: string;
  sourceRecordIds: string[];
}

export const locationProfileCorrectionDecisions = pgTable(
  'location_profile_correction_decisions',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    expectedLocationUpdatedAt: timestamp('expected_location_updated_at', {
      withTimezone: true,
    }).notNull(),
    changedFieldPaths: jsonb('changed_field_paths').$type<string[]>().notNull(),
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
    beforeValues: jsonb('before_values').$type<Record<string, unknown>>().notNull(),
    afterValues: jsonb('after_values').$type<Record<string, unknown>>().notNull(),
    sourceRecordIds: jsonb('source_record_ids').$type<string[]>().notNull(),
    provenanceAssignments: jsonb('provenance_assignments')
      .$type<LocationProfileCorrectionProvenanceAssignmentValue[]>()
      .notNull(),
    reasonCode: varchar('reason_code', { length: 96 }).notNull(),
    publicSummary: text('public_summary'),
    internalNote: text('internal_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('location_profile_corrections_request_unique').on(table.requestId),
    index('location_profile_corrections_location_idx').on(table.locationId, table.decidedAt),
    index('location_profile_corrections_actor_idx').on(table.actorId, table.decidedAt),
    check(
      'location_profile_corrections_fields_array',
      sql`jsonb_typeof(${table.changedFieldPaths}) = 'array' and jsonb_array_length(${table.changedFieldPaths}) between 1 and 10`,
    ),
    check(
      'location_profile_corrections_changes_object',
      sql`jsonb_typeof(${table.changes}) = 'object'`,
    ),
    check(
      'location_profile_corrections_before_object',
      sql`jsonb_typeof(${table.beforeValues}) = 'object'`,
    ),
    check(
      'location_profile_corrections_after_object',
      sql`jsonb_typeof(${table.afterValues}) = 'object'`,
    ),
    check(
      'location_profile_corrections_sources_array',
      sql`jsonb_typeof(${table.sourceRecordIds}) = 'array' and jsonb_array_length(${table.sourceRecordIds}) between 1 and 100`,
    ),
    check(
      'location_profile_corrections_assignments_array',
      sql`jsonb_typeof(${table.provenanceAssignments}) = 'array' and jsonb_array_length(${table.provenanceAssignments}) between 1 and 10`,
    ),
    check('location_profile_corrections_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'location_profile_corrections_reason_nonempty',
      sql`length(trim(${table.reasonCode})) > 0`,
    ),
    check(
      'location_profile_corrections_fingerprint_nonempty',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
    check(
      'location_profile_corrections_summary_required',
      sql`${table.publicSummary} is not null or ${table.internalNote} is not null`,
    ),
    check(
      'location_profile_corrections_summary_nonempty',
      sql`${table.publicSummary} is null or length(trim(${table.publicSummary})) > 0`,
    ),
    check(
      'location_profile_corrections_note_nonempty',
      sql`${table.internalNote} is null or length(trim(${table.internalNote})) > 0`,
    ),
    check(
      'location_profile_corrections_time_order',
      sql`${table.expectedLocationUpdatedAt} <= ${table.decidedAt}`,
    ),
  ],
);

export type LocationProfileCorrectionDecision =
  typeof locationProfileCorrectionDecisions.$inferSelect;
export type NewLocationProfileCorrectionDecision =
  typeof locationProfileCorrectionDecisions.$inferInsert;
