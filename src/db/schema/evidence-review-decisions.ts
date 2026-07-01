import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { acceptanceClaims } from './acceptance-claims';
import { acceptanceClaimStatusEnum, claimVisibilityEnum } from './enums';
import { evidence, evidenceReviewStatusEnum } from './evidence';
import { adminActorTypeEnum } from './import-batches';
import { verificationEvents } from './verification-events';

export const evidenceReviewDispositionValues = ['accepted', 'rejected', 'held'] as const;
export const evidenceReviewFindingValues = [
  'supports_claim',
  'contradicts_claim',
  'insufficient',
] as const;
export const evidenceReviewClaimActionValues = [
  'no_change',
  'confirm',
  'mark_stale',
  'end',
  'reject',
] as const;

export const evidenceReviewDispositionEnum = pgEnum(
  'evidence_review_disposition',
  evidenceReviewDispositionValues,
);
export const evidenceReviewFindingEnum = pgEnum(
  'evidence_review_finding',
  evidenceReviewFindingValues,
);
export const evidenceReviewClaimActionEnum = pgEnum(
  'evidence_review_claim_action',
  evidenceReviewClaimActionValues,
);

export const evidenceReviewDecisions = pgTable(
  'evidence_review_decisions',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'restrict' }),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => acceptanceClaims.id, { onDelete: 'restrict' }),
    disposition: evidenceReviewDispositionEnum('disposition').notNull(),
    finding: evidenceReviewFindingEnum('finding').notNull(),
    claimAction: evidenceReviewClaimActionEnum('claim_action').notNull(),
    evidenceReviewStatus: evidenceReviewStatusEnum('evidence_review_status').notNull(),
    fromClaimStatus: acceptanceClaimStatusEnum('from_claim_status').notNull(),
    toClaimStatus: acceptanceClaimStatusEnum('to_claim_status').notNull(),
    claimVisibility: claimVisibilityEnum('claim_visibility').notNull(),
    verificationEventId: uuid('verification_event_id').references(() => verificationEvents.id, {
      onDelete: 'restrict',
    }),
    expectedEvidenceUpdatedAt: timestamp('expected_evidence_updated_at', {
      withTimezone: true,
    }).notNull(),
    expectedClaimUpdatedAt: timestamp('expected_claim_updated_at', {
      withTimezone: true,
    }).notNull(),
    expectedAcceptedEvidenceIds: jsonb('expected_accepted_evidence_ids')
      .$type<string[]>()
      .notNull(),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    reasonCode: varchar('reason_code', { length: 96 }).notNull(),
    publicSummary: text('public_summary'),
    internalNote: text('internal_note'),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    endedReason: text('ended_reason'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('evidence_review_decisions_request_unique').on(table.requestId),
    index('evidence_review_decisions_evidence_idx').on(table.evidenceId, table.decidedAt),
    index('evidence_review_decisions_claim_idx').on(table.claimId, table.decidedAt),
    index('evidence_review_decisions_actor_idx').on(table.actorId, table.decidedAt),
    index('evidence_review_decisions_event_idx').on(table.verificationEventId),
    check(
      'evidence_review_decisions_expected_set_array',
      sql`jsonb_typeof(${table.expectedAcceptedEvidenceIds}) = 'array' and jsonb_array_length(${table.expectedAcceptedEvidenceIds}) between 0 and 100`,
    ),
    check('evidence_review_decisions_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check('evidence_review_decisions_reason_nonempty', sql`length(trim(${table.reasonCode})) > 0`),
    check(
      'evidence_review_decisions_fingerprint_nonempty',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
    check(
      'evidence_review_decisions_summary_required',
      sql`${table.publicSummary} is not null or ${table.internalNote} is not null`,
    ),
    check(
      'evidence_review_decisions_summary_nonempty',
      sql`${table.publicSummary} is null or length(trim(${table.publicSummary})) > 0`,
    ),
    check(
      'evidence_review_decisions_note_nonempty',
      sql`${table.internalNote} is null or length(trim(${table.internalNote})) > 0`,
    ),
    check(
      'evidence_review_decisions_time_order',
      sql`${table.expectedEvidenceUpdatedAt} <= ${table.decidedAt} and ${table.expectedClaimUpdatedAt} <= ${table.decidedAt}`,
    ),
    check(
      'evidence_review_decisions_disposition_shape',
      sql`(${table.disposition} = 'accepted' and ${table.evidenceReviewStatus} = 'accepted') or (${table.disposition} = 'rejected' and ${table.evidenceReviewStatus} = 'rejected' and ${table.finding} = 'insufficient' and ${table.claimAction} = 'no_change') or (${table.disposition} = 'held' and ${table.evidenceReviewStatus} = 'pending' and ${table.finding} = 'insufficient' and ${table.claimAction} = 'no_change')`,
    ),
    check(
      'evidence_review_decisions_action_event_shape',
      sql`(${table.claimAction} = 'no_change' and ${table.verificationEventId} is null and ${table.fromClaimStatus} = ${table.toClaimStatus}) or (${table.claimAction} <> 'no_change' and ${table.disposition} = 'accepted' and ${table.verificationEventId} is not null)`,
    ),
    check(
      'evidence_review_decisions_confirm_shape',
      sql`${table.claimAction} <> 'confirm' or (${table.finding} = 'supports_claim' and ${table.fromClaimStatus} in ('candidate', 'confirmed', 'stale') and ${table.toClaimStatus} = 'confirmed' and ${table.nextReviewAt} is not null and ${table.nextReviewAt} > ${table.decidedAt})`,
    ),
    check(
      'evidence_review_decisions_stale_shape',
      sql`${table.claimAction} <> 'mark_stale' or (${table.finding} = 'contradicts_claim' and ${table.fromClaimStatus} = 'confirmed' and ${table.toClaimStatus} = 'stale' and ${table.nextReviewAt} is not null and ${table.nextReviewAt} > ${table.decidedAt})`,
    ),
    check(
      'evidence_review_decisions_end_shape',
      sql`${table.claimAction} <> 'end' or (${table.finding} = 'contradicts_claim' and ${table.fromClaimStatus} in ('confirmed', 'stale') and ${table.toClaimStatus} = 'ended' and ${table.endedReason} is not null)`,
    ),
    check(
      'evidence_review_decisions_reject_shape',
      sql`${table.claimAction} <> 'reject' or (${table.finding} = 'contradicts_claim' and ${table.fromClaimStatus} = 'candidate' and ${table.toClaimStatus} = 'rejected')`,
    ),
    check(
      'evidence_review_decisions_optional_action_fields',
      sql`(${table.claimAction} in ('confirm', 'mark_stale') or ${table.nextReviewAt} is null) and (${table.claimAction} = 'end' or ${table.endedReason} is null)`,
    ),
  ],
);

export type EvidenceReviewDecision = typeof evidenceReviewDecisions.$inferSelect;
export type NewEvidenceReviewDecision = typeof evidenceReviewDecisions.$inferInsert;
