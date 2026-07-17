import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { adminActorTypeEnum } from './import-batches';
import { submissionEvents, submissions, submissionTypeEnum } from './submissions';

export const submissionApplicationSourceDecisionKindValues = [
  'suggest_candidate_acceptance',
  'positive_payment_evidence',
  'negative_report_evidence',
  'problem_correction_handoff',
  'problem_claim_mutation',
  'business_claim_relationship',
  'photos_parent_resolution',
] as const;

export const submissionApplicationKindValues = [
  'candidate_resolution',
  'report_evidence',
  'problem_correction',
  'problem_claim_mutation',
  'business_claim_update',
  'photo_media_set',
] as const;

export const submissionApplicationStatusValues = ['pending', 'committed', 'failed'] as const;
export const submissionPublicationStatusValues = ['blocked', 'pending', 'committed', 'failed'] as const;
export const submissionApplicationReceiptKindValues = ['submission_event'] as const;
export const submissionApplicationEventActionValues = [
  'registered',
  'application_committed',
  'application_failed',
  'application_retried',
  'publication_committed',
  'publication_failed',
  'publication_retried',
] as const;

export const submissionApplicationSourceDecisionKindEnum = pgEnum(
  'submission_application_source_decision_kind',
  submissionApplicationSourceDecisionKindValues,
);
export const submissionApplicationKindEnum = pgEnum(
  'submission_application_kind',
  submissionApplicationKindValues,
);
export const submissionApplicationStatusEnum = pgEnum(
  'submission_application_status',
  submissionApplicationStatusValues,
);
export const submissionPublicationStatusEnum = pgEnum(
  'submission_publication_status',
  submissionPublicationStatusValues,
);
export const submissionApplicationReceiptKindEnum = pgEnum(
  'submission_application_receipt_kind',
  submissionApplicationReceiptKindValues,
);
export const submissionApplicationEventActionEnum = pgEnum(
  'submission_application_event_action',
  submissionApplicationEventActionValues,
);

export const submissionApplications = pgTable(
  'submission_applications',
  {
    id: uuid('id').primaryKey(),
    registrationRequestId: uuid('registration_request_id').notNull(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'restrict' }),
    submissionType: submissionTypeEnum('submission_type').notNull(),
    sourceDecisionKind: submissionApplicationSourceDecisionKindEnum('source_decision_kind').notNull(),
    sourceDecisionEventId: uuid('source_decision_event_id')
      .notNull()
      .references(() => submissionEvents.id, { onDelete: 'restrict' }),
    applicationKind: submissionApplicationKindEnum('application_kind').notNull(),
    applicationStatus: submissionApplicationStatusEnum('application_status').notNull(),
    publicationStatus: submissionPublicationStatusEnum('publication_status').notNull(),
    applicationReceiptKind: submissionApplicationReceiptKindEnum('application_receipt_kind'),
    applicationReceiptIds: jsonb('application_receipt_ids').$type<string[]>().notNull(),
    publicationReceiptKind: submissionApplicationReceiptKindEnum('publication_receipt_kind'),
    publicationReceiptIds: jsonb('publication_receipt_ids').$type<string[]>().notNull(),
    expectedSubmissionUpdatedAt: timestamp('expected_submission_updated_at', {
      withTimezone: true,
    }).notNull(),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('submission_applications_request_unique').on(table.registrationRequestId),
    uniqueIndex('submission_applications_submission_unique').on(table.submissionId),
    uniqueIndex('submission_applications_source_event_unique').on(table.sourceDecisionEventId),
    index('submission_applications_status_idx').on(
      table.applicationStatus,
      table.publicationStatus,
      table.updatedAt,
    ),
    index('submission_applications_actor_idx').on(table.actorId, table.registeredAt),
    check('submission_applications_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'submission_applications_fingerprint_sha256',
      sql`${table.requestFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'submission_applications_application_receipts_array',
      sql`jsonb_typeof(${table.applicationReceiptIds}) = 'array' and jsonb_array_length(${table.applicationReceiptIds}) between 0 and 20`,
    ),
    check(
      'submission_applications_publication_receipts_array',
      sql`jsonb_typeof(${table.publicationReceiptIds}) = 'array' and jsonb_array_length(${table.publicationReceiptIds}) between 0 and 20`,
    ),
    check(
      'submission_applications_application_receipt_pair',
      sql`(${table.applicationReceiptKind} is null and jsonb_array_length(${table.applicationReceiptIds}) = 0) or (${table.applicationReceiptKind} is not null and jsonb_array_length(${table.applicationReceiptIds}) > 0)`,
    ),
    check(
      'submission_applications_publication_receipt_pair',
      sql`(${table.publicationReceiptKind} is null and jsonb_array_length(${table.publicationReceiptIds}) = 0) or (${table.publicationReceiptKind} is not null and jsonb_array_length(${table.publicationReceiptIds}) > 0)`,
    ),
    check(
      'submission_applications_application_publication_order',
      sql`(${table.applicationStatus} in ('pending', 'failed') and ${table.publicationStatus} = 'blocked') or (${table.applicationStatus} = 'committed' and ${table.publicationStatus} in ('pending', 'committed', 'failed'))`,
    ),
    check(
      'submission_applications_committed_receipt',
      sql`${table.applicationStatus} <> 'committed' or ${table.applicationReceiptKind} is not null`,
    ),
    check(
      'submission_applications_uncommitted_receipt',
      sql`${table.applicationStatus} = 'committed' or (${table.applicationReceiptKind} is null and jsonb_array_length(${table.applicationReceiptIds}) = 0)`,
    ),
    check(
      'submission_applications_publication_committed_receipt',
      sql`${table.publicationStatus} <> 'committed' or ${table.publicationReceiptKind} is not null`,
    ),
    check(
      'submission_applications_time_order',
      sql`${table.expectedSubmissionUpdatedAt} <= ${table.registeredAt} and ${table.registeredAt} <= ${table.updatedAt}`,
    ),
  ],
);

export const submissionApplicationEvents = pgTable(
  'submission_application_events',
  {
    id: uuid('id').primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => submissionApplications.id, { onDelete: 'restrict' }),
    action: submissionApplicationEventActionEnum('action').notNull(),
    fromApplicationStatus: submissionApplicationStatusEnum('from_application_status'),
    toApplicationStatus: submissionApplicationStatusEnum('to_application_status').notNull(),
    fromPublicationStatus: submissionPublicationStatusEnum('from_publication_status'),
    toPublicationStatus: submissionPublicationStatusEnum('to_publication_status').notNull(),
    sourceDecisionEventId: uuid('source_decision_event_id')
      .notNull()
      .references(() => submissionEvents.id, { onDelete: 'restrict' }),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('submission_application_events_application_created_idx').on(
      table.applicationId,
      table.createdAt,
    ),
    index('submission_application_events_actor_created_idx').on(table.actorId, table.createdAt),
    check('submission_application_events_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'submission_application_events_fingerprint_sha256',
      sql`${table.requestFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'submission_application_events_registration_shape',
      sql`${table.action} <> 'registered' or (${table.fromApplicationStatus} is null and ${table.fromPublicationStatus} is null)`,
    ),
  ],
);

export type SubmissionApplication = typeof submissionApplications.$inferSelect;
export type NewSubmissionApplication = typeof submissionApplications.$inferInsert;
export type SubmissionApplicationEvent = typeof submissionApplicationEvents.$inferSelect;
export type NewSubmissionApplicationEvent = typeof submissionApplicationEvents.$inferInsert;
