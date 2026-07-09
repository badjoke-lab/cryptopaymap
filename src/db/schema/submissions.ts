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
import { submissionResolutionEnum, submissionWorkflowStatusEnum } from './enums';

export const submissionTypeValues = [
  'suggest',
  'payment_report',
  'problem_report',
  'claim',
  'photos',
] as const;
export const submissionTypeEnum = pgEnum('submission_type', submissionTypeValues);

export const submissionTargetTypeValues = ['entity', 'location', 'claim', 'new_record'] as const;
export const submissionTargetTypeEnum = pgEnum(
  'submission_target_type',
  submissionTargetTypeValues,
);

export const submissionRelationshipValues = [
  'customer',
  'employee',
  'owner_or_authorized_representative',
  'payment_provider',
  'independent_researcher',
  'other',
] as const;
export const submissionRelationshipEnum = pgEnum(
  'submission_relationship',
  submissionRelationshipValues,
);

export const submissionEventActorTypeValues = ['submitter', 'reviewer', 'system'] as const;
export const submissionEventActorTypeEnum = pgEnum(
  'submission_event_actor_type',
  submissionEventActorTypeValues,
);

export const submissionPublicReferenceCounters = pgTable(
  'submission_public_reference_counters',
  {
    year: integer('year').primaryKey(),
    nextSequence: integer('next_sequence').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('submission_public_reference_year_range', sql`${table.year} between 2000 and 9999`),
    check(
      'submission_public_reference_sequence_range',
      sql`${table.nextSequence} between 2 and 1000000`,
    ),
  ],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey(),
    intakeRequestId: uuid('intake_request_id').notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    publicId: varchar('public_id', { length: 17 }).notNull(),
    submissionType: submissionTypeEnum('submission_type').notNull(),
    targetType: submissionTargetTypeEnum('target_type'),
    targetId: uuid('target_id'),
    relationship: submissionRelationshipEnum('relationship'),
    workflowStatus: submissionWorkflowStatusEnum('workflow_status').default('received').notNull(),
    resolution: submissionResolutionEnum('resolution'),
    priority: integer('priority').default(0).notNull(),
    statusTokenHash: varchar('status_token_hash', { length: 71 }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('submissions_intake_request_unique').on(table.intakeRequestId),
    uniqueIndex('submissions_public_id_unique').on(table.publicId),
    uniqueIndex('submissions_status_token_hash_unique').on(table.statusTokenHash),
    index('submissions_workflow_priority_idx').on(
      table.workflowStatus,
      table.priority,
      table.submittedAt,
    ),
    index('submissions_type_submitted_idx').on(table.submissionType, table.submittedAt),
    index('submissions_target_idx').on(table.targetType, table.targetId),
    check(
      'submissions_request_fingerprint_sha256',
      sql`${table.requestFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check('submissions_public_id_shape', sql`${table.publicId} ~ '^CPM-S-[0-9]{4}-[0-9]{6}$'`),
    check(
      'submissions_status_token_hash_shape',
      sql`${table.statusTokenHash} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check('submissions_priority_range', sql`${table.priority} between 0 and 1000`),
    check(
      'submissions_target_pair',
      sql`(${table.targetType} is null and ${table.targetId} is null) or (${table.targetType} is not null and ${table.targetId} is not null)`,
    ),
    check(
      'submissions_resolved_requires_resolution',
      sql`${table.workflowStatus} <> 'resolved' or ${table.resolution} is not null`,
    ),
    check(
      'submissions_duplicate_resolution_shape',
      sql`${table.workflowStatus} <> 'duplicate' or ${table.resolution} is null or ${table.resolution} = 'duplicate'`,
    ),
    check(
      'submissions_withdrawn_resolution_shape',
      sql`${table.workflowStatus} <> 'withdrawn' or ${table.resolution} is null or ${table.resolution} = 'withdrawn'`,
    ),
    check('submissions_update_order', sql`${table.submittedAt} <= ${table.updatedAt}`),
    check(
      'submissions_resolved_time_order',
      sql`${table.resolvedAt} is null or (${table.submittedAt} <= ${table.resolvedAt} and ${table.resolvedAt} <= ${table.updatedAt})`,
    ),
    check(
      'submissions_withdrawn_time_order',
      sql`${table.withdrawnAt} is null or (${table.submittedAt} <= ${table.withdrawnAt} and ${table.withdrawnAt} <= ${table.updatedAt})`,
    ),
  ],
);

export const submissionPayloads = pgTable(
  'submission_payloads',
  {
    submissionId: uuid('submission_id')
      .primaryKey()
      .references(() => submissions.id, { onDelete: 'restrict' }),
    originalPayload: jsonb('original_payload').$type<Record<string, unknown>>().notNull(),
    normalizedPayload: jsonb('normalized_payload').$type<Record<string, unknown>>(),
    proposedChanges: jsonb('proposed_changes').$type<Record<string, unknown>>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'submission_payloads_original_object',
      sql`jsonb_typeof(${table.originalPayload}) = 'object'`,
    ),
    check(
      'submission_payloads_normalized_object',
      sql`${table.normalizedPayload} is null or jsonb_typeof(${table.normalizedPayload}) = 'object'`,
    ),
    check(
      'submission_payloads_proposed_object',
      sql`${table.proposedChanges} is null or jsonb_typeof(${table.proposedChanges}) = 'object'`,
    ),
  ],
);

export const submissionContacts = pgTable(
  'submission_contacts',
  {
    submissionId: uuid('submission_id')
      .primaryKey()
      .references(() => submissions.id, { onDelete: 'restrict' }),
    encryptedEmail: text('encrypted_email').notNull(),
    emailHash: varchar('email_hash', { length: 64 }).notNull(),
    contactAllowed: boolean('contact_allowed').notNull(),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('submission_contacts_email_hash_idx').on(table.emailHash),
    index('submission_contacts_retention_idx').on(table.retentionUntil),
    check('submission_contacts_encrypted_email_nonempty', sql`length(${table.encryptedEmail}) > 0`),
    check('submission_contacts_email_hash_sha256', sql`${table.emailHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const submissionEvents = pgTable(
  'submission_events',
  {
    id: uuid('id').primaryKey(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'restrict' }),
    fromStatus: submissionWorkflowStatusEnum('from_status'),
    toStatus: submissionWorkflowStatusEnum('to_status').notNull(),
    action: varchar('action', { length: 96 }).notNull(),
    reasonCode: varchar('reason_code', { length: 96 }),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: submissionEventActorTypeEnum('actor_type').notNull(),
    internalNote: text('internal_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('submission_events_submission_created_idx').on(table.submissionId, table.createdAt),
    index('submission_events_actor_created_idx').on(table.actorId, table.createdAt),
    check('submission_events_action_nonempty', sql`length(trim(${table.action})) > 0`),
    check('submission_events_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'submission_events_reason_nonempty',
      sql`${table.reasonCode} is null or length(trim(${table.reasonCode})) > 0`,
    ),
    check(
      'submission_events_note_nonempty',
      sql`${table.internalNote} is null or length(trim(${table.internalNote})) > 0`,
    ),
    check(
      'submission_events_status_change',
      sql`${table.fromStatus} is null or ${table.fromStatus} <> ${table.toStatus}`,
    ),
  ],
);

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type SubmissionPayload = typeof submissionPayloads.$inferSelect;
export type NewSubmissionPayload = typeof submissionPayloads.$inferInsert;
export type SubmissionContact = typeof submissionContacts.$inferSelect;
export type NewSubmissionContact = typeof submissionContacts.$inferInsert;
export type SubmissionEvent = typeof submissionEvents.$inferSelect;
export type NewSubmissionEvent = typeof submissionEvents.$inferInsert;
