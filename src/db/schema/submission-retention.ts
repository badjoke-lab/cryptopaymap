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
import { submissions } from './submissions';

export const submissionRetentionRunStateValues = ['running', 'completed', 'partial'] as const;
export const submissionRetentionRunStateEnum = pgEnum(
  'submission_retention_run_state',
  submissionRetentionRunStateValues,
);

export const submissionRetentionMaterialValues = [
  'contact',
  'payload',
  'evidence',
  'media_object_set',
] as const;
export const submissionRetentionMaterialEnum = pgEnum(
  'submission_retention_material',
  submissionRetentionMaterialValues,
);

export const submissionRetentionPolicyValues = [
  'contact_retention_expired',
  'terminal_payload_180d',
  'private_evidence_180d',
  'expired_authorization',
  'closed_submission_without_handoff',
  'rejected_media_30d',
  'superseded_media_30d',
  'private_evidence_media_180d',
  'owner_verification_media_90d',
] as const;
export const submissionRetentionPolicyEnum = pgEnum(
  'submission_retention_policy',
  submissionRetentionPolicyValues,
);

export const submissionRetentionReferenceTypeValues = [
  'submission',
  'evidence',
  'reservation',
  'media_asset',
] as const;
export const submissionRetentionReferenceTypeEnum = pgEnum(
  'submission_retention_reference_type',
  submissionRetentionReferenceTypeValues,
);

export const submissionRetentionOutcomeValues = ['redacted', 'objects_deleted'] as const;
export const submissionRetentionOutcomeEnum = pgEnum(
  'submission_retention_outcome',
  submissionRetentionOutcomeValues,
);

export const submissionRetentionRuns = pgTable(
  'submission_retention_runs',
  {
    id: uuid('id').primaryKey(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    state: submissionRetentionRunStateEnum('state').default('running').notNull(),
    receipt: jsonb('receipt').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('submission_retention_runs_effective_idx').on(table.effectiveAt),
    check(
      'submission_retention_runs_fingerprint_sha256',
      sql`${table.requestFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check('submission_retention_runs_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'submission_retention_runs_receipt_state',
      sql`(${table.state} = 'running' and ${table.receipt} is null) or (${table.state} in ('completed', 'partial') and ${table.receipt} is not null and jsonb_typeof(${table.receipt}) = 'object')`,
    ),
    check('submission_retention_runs_time_order', sql`${table.createdAt} <= ${table.updatedAt}`),
  ],
);

export const submissionRetentionItems = pgTable(
  'submission_retention_items',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => submissionRetentionRuns.id, { onDelete: 'restrict' }),
    material: submissionRetentionMaterialEnum('material').notNull(),
    policy: submissionRetentionPolicyEnum('policy').notNull(),
    referenceType: submissionRetentionReferenceTypeEnum('reference_type').notNull(),
    referenceId: uuid('reference_id').notNull(),
    submissionId: uuid('submission_id').references(() => submissions.id, {
      onDelete: 'restrict',
    }),
    outcome: submissionRetentionOutcomeEnum('outcome').notNull(),
    deletedObjectCount: integer('deleted_object_count').default(0).notNull(),
    missingObjectCount: integer('missing_object_count').default(0).notNull(),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('submission_retention_items_policy_reference_unique').on(
      table.policy,
      table.referenceType,
      table.referenceId,
    ),
    index('submission_retention_items_run_idx').on(table.runId),
    index('submission_retention_items_submission_idx').on(table.submissionId),
    index('submission_retention_items_completed_idx').on(table.completedAt),
    check(
      'submission_retention_items_object_counts',
      sql`${table.deletedObjectCount} >= 0 and ${table.missingObjectCount} >= 0`,
    ),
    check('submission_retention_items_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'submission_retention_items_outcome_shape',
      sql`(${table.outcome} = 'redacted' and ${table.material} in ('contact', 'payload', 'evidence') and ${table.deletedObjectCount} = 0 and ${table.missingObjectCount} = 0) or (${table.outcome} = 'objects_deleted' and ${table.material} = 'media_object_set')`,
    ),
  ],
);

export type SubmissionRetentionRun = typeof submissionRetentionRuns.$inferSelect;
export type NewSubmissionRetentionRun = typeof submissionRetentionRuns.$inferInsert;
export type SubmissionRetentionItem = typeof submissionRetentionItems.$inferSelect;
export type NewSubmissionRetentionItem = typeof submissionRetentionItems.$inferInsert;
