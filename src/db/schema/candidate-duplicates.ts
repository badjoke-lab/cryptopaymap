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
import { adminActorTypeEnum, importBatches } from './import-batches';
import { candidateDuplicateGroups, sourceCandidates } from './source-provenance';

export const candidateDuplicateSignalReasonValues = [
  'shared_osm_identity',
  'same_name_and_coordinates',
  'shared_official_domain',
  'same_normalized_name',
] as const;
export const candidateDuplicateSignalStrengthValues = ['strong', 'review'] as const;
export const candidateDuplicateDecisionActionValues = [
  'confirm_duplicate',
  'dismiss_signal',
] as const;
export const candidateDuplicateDecisionReasonValues = [
  'same_osm_identity',
  'same_physical_location',
  'same_official_domain',
  'same_online_service',
  'manual_match',
  'different_location',
  'different_business',
  'different_service',
  'insufficient_evidence',
  'stale_signal',
  'other',
] as const;

export const candidateDuplicateSignalReasonEnum = pgEnum(
  'candidate_duplicate_signal_reason',
  candidateDuplicateSignalReasonValues,
);
export const candidateDuplicateSignalStrengthEnum = pgEnum(
  'candidate_duplicate_signal_strength',
  candidateDuplicateSignalStrengthValues,
);
export const candidateDuplicateDecisionActionEnum = pgEnum(
  'candidate_duplicate_decision_action',
  candidateDuplicateDecisionActionValues,
);
export const candidateDuplicateDecisionReasonEnum = pgEnum(
  'candidate_duplicate_decision_reason',
  candidateDuplicateDecisionReasonValues,
);

export interface CandidateDuplicateDecisionMemberState {
  candidateId: string;
  candidateStatus: string;
  candidateType: string;
  updatedAt: string;
}

export const candidateDuplicateSignals = pgTable(
  'candidate_duplicate_signals',
  {
    id: uuid('id').primaryKey(),
    duplicateGroupId: uuid('duplicate_group_id')
      .notNull()
      .references(() => candidateDuplicateGroups.id, { onDelete: 'restrict' }),
    leftCandidateId: uuid('left_candidate_id')
      .notNull()
      .references(() => sourceCandidates.id, { onDelete: 'restrict' }),
    rightCandidateId: uuid('right_candidate_id')
      .notNull()
      .references(() => sourceCandidates.id, { onDelete: 'restrict' }),
    reason: candidateDuplicateSignalReasonEnum('reason').notNull(),
    strength: candidateDuplicateSignalStrengthEnum('strength').notNull(),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('candidate_duplicate_signals_identity_unique').on(
      table.duplicateGroupId,
      table.leftCandidateId,
      table.rightCandidateId,
      table.reason,
    ),
    index('candidate_duplicate_signals_group_idx').on(table.duplicateGroupId, table.createdAt),
    index('candidate_duplicate_signals_left_idx').on(table.leftCandidateId),
    index('candidate_duplicate_signals_right_idx').on(table.rightCandidateId),
    index('candidate_duplicate_signals_import_batch_idx').on(table.importBatchId),
    check(
      'candidate_duplicate_signals_distinct_candidates',
      sql`${table.leftCandidateId} <> ${table.rightCandidateId}`,
    ),
    check(
      'candidate_duplicate_signals_ordered_candidates',
      sql`${table.leftCandidateId} < ${table.rightCandidateId}`,
    ),
  ],
);

export const candidateDuplicateDecisions = pgTable(
  'candidate_duplicate_decisions',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    duplicateGroupId: uuid('duplicate_group_id')
      .notNull()
      .references(() => candidateDuplicateGroups.id, { onDelete: 'restrict' }),
    action: candidateDuplicateDecisionActionEnum('action').notNull(),
    primaryCandidateId: uuid('primary_candidate_id').references(() => sourceCandidates.id, {
      onDelete: 'restrict',
    }),
    memberCandidateIds: jsonb('member_candidate_ids').$type<string[]>().notNull(),
    previousMemberStates: jsonb('previous_member_states')
      .$type<CandidateDuplicateDecisionMemberState[]>()
      .notNull(),
    reasonCode: candidateDuplicateDecisionReasonEnum('reason_code').notNull(),
    note: text('note'),
    actorId: varchar('actor_id', { length: 200 }).notNull(),
    actorType: adminActorTypeEnum('actor_type').notNull(),
    expectedGroupUpdatedAt: timestamp('expected_group_updated_at', { withTimezone: true }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    decisionFingerprint: varchar('decision_fingerprint', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('candidate_duplicate_decisions_request_unique').on(table.requestId),
    uniqueIndex('candidate_duplicate_decisions_group_unique').on(table.duplicateGroupId),
    uniqueIndex('candidate_duplicate_decisions_fingerprint_unique').on(table.decisionFingerprint),
    index('candidate_duplicate_decisions_actor_idx').on(table.actorId, table.decidedAt),
    index('candidate_duplicate_decisions_primary_idx').on(table.primaryCandidateId),
    check('candidate_duplicate_decisions_actor_nonempty', sql`length(trim(${table.actorId})) > 0`),
    check(
      'candidate_duplicate_decisions_note_nonempty',
      sql`${table.note} is null or length(trim(${table.note})) > 0`,
    ),
    check(
      'candidate_duplicate_decisions_members_array',
      sql`jsonb_typeof(${table.memberCandidateIds}) = 'array' and jsonb_array_length(${table.memberCandidateIds}) between 2 and 50`,
    ),
    check(
      'candidate_duplicate_decisions_previous_states_array',
      sql`jsonb_typeof(${table.previousMemberStates}) = 'array' and jsonb_array_length(${table.previousMemberStates}) = jsonb_array_length(${table.memberCandidateIds})`,
    ),
    check(
      'candidate_duplicate_decisions_action_shape',
      sql`(${table.action} = 'confirm_duplicate' and ${table.primaryCandidateId} is not null) or (${table.action} = 'dismiss_signal' and ${table.primaryCandidateId} is null)`,
    ),
    check(
      'candidate_duplicate_decisions_fingerprint_sha256',
      sql`${table.decisionFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export type CandidateDuplicateSignal = typeof candidateDuplicateSignals.$inferSelect;
export type NewCandidateDuplicateSignal = typeof candidateDuplicateSignals.$inferInsert;
export type CandidateDuplicateDecision = typeof candidateDuplicateDecisions.$inferSelect;
export type NewCandidateDuplicateDecision = typeof candidateDuplicateDecisions.$inferInsert;
