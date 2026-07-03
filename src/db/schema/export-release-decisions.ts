import { sql } from 'drizzle-orm';
import {
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

export const exportReleaseActionValues = ['approve', 'reject'] as const;
export const exportReleaseStatusValues = ['approved', 'rejected'] as const;
export const exportReleaseCandidateStatusValues = ['eligible', 'blocked'] as const;

export const exportReleaseActionEnum = pgEnum('export_release_action', exportReleaseActionValues);
export const exportReleaseStatusEnum = pgEnum('export_release_status', exportReleaseStatusValues);
export const exportReleaseCandidateStatusEnum = pgEnum(
  'export_release_candidate_status',
  exportReleaseCandidateStatusValues,
);

export const exportReleaseDecisions = pgTable(
  'export_release_decisions',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    action: exportReleaseActionEnum('action').notNull(),
    releaseStatus: exportReleaseStatusEnum('release_status').notNull(),
    snapshotDigest: varchar('snapshot_digest', { length: 64 }).notNull(),
    artifactCount: integer('artifact_count').notNull(),
    datasetVersion: varchar('dataset_version', { length: 64 }).notNull(),
    schemaVersion: varchar('schema_version', { length: 32 }).notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    candidateStatus: exportReleaseCandidateStatusEnum('candidate_status').notNull(),
    validationIssues: jsonb('validation_issues').$type<string[]>().notNull(),
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
    uniqueIndex('export_release_decisions_request_unique').on(table.requestId),
    uniqueIndex('export_release_decisions_approved_snapshot_unique')
      .on(table.snapshotDigest)
      .where(sql`${table.releaseStatus} = 'approved'`),
    uniqueIndex('export_release_decisions_approved_dataset_unique')
      .on(table.datasetVersion)
      .where(sql`${table.releaseStatus} = 'approved'`),
    index('export_release_decisions_decided_idx').on(table.decidedAt),
    index('export_release_decisions_actor_idx').on(table.actorId, table.decidedAt),
    index('export_release_decisions_status_idx').on(table.releaseStatus, table.decidedAt),
    check('export_release_decisions_digest_shape', sql`${table.snapshotDigest} ~ '^[a-f0-9]{64}$'`),
    check(
      'export_release_decisions_artifact_count_range',
      sql`${table.artifactCount} between 1 and 100`,
    ),
    check(
      'export_release_decisions_validation_issues_array',
      sql`jsonb_typeof(${table.validationIssues}) = 'array' and jsonb_array_length(${table.validationIssues}) between 0 and 500`,
    ),
    check(
      'export_release_decisions_candidate_shape',
      sql`(${table.candidateStatus} = 'eligible' and jsonb_array_length(${table.validationIssues}) = 0) or (${table.candidateStatus} = 'blocked' and jsonb_array_length(${table.validationIssues}) > 0)`,
    ),
    check(
      'export_release_decisions_dataset_version_nonempty',
      sql`length(trim(${table.datasetVersion})) > 0`,
    ),
    check(
      'export_release_decisions_schema_version_nonempty',
      sql`length(trim(${table.schemaVersion})) > 0`,
    ),
    check('export_release_decisions_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check('export_release_decisions_reason_nonempty', sql`length(trim(${table.reasonCode})) > 0`),
    check(
      'export_release_decisions_fingerprint_nonempty',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
    check(
      'export_release_decisions_summary_required',
      sql`${table.publicSummary} is not null or ${table.internalNote} is not null`,
    ),
    check('export_release_decisions_time_order', sql`${table.generatedAt} <= ${table.decidedAt}`),
    check(
      'export_release_decisions_approve_shape',
      sql`${table.action} <> 'approve' or (${table.releaseStatus} = 'approved' and ${table.candidateStatus} = 'eligible')`,
    ),
    check(
      'export_release_decisions_reject_shape',
      sql`${table.action} <> 'reject' or ${table.releaseStatus} = 'rejected'`,
    ),
  ],
);

export type ExportReleaseDecision = typeof exportReleaseDecisions.$inferSelect;
export type NewExportReleaseDecision = typeof exportReleaseDecisions.$inferInsert;
