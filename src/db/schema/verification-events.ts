import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { acceptanceClaims } from './acceptance-claims';
import { acceptanceClaimStatusEnum, claimVisibilityEnum } from './enums';
import { evidence } from './evidence';

export const verificationEventTypeValues = [
  'confirmed',
  'reconfirmed',
  'marked_stale',
  'ended',
  'restored',
  'corrected',
  'hidden',
  'unhidden',
] as const;
export const verificationActorTypeValues = ['operator', 'system', 'import'] as const;
export const verificationEvidenceRelationshipValues = [
  'basis',
  'contradiction',
  'context',
  'superseded',
] as const;

export const verificationEventTypeEnum = pgEnum(
  'verification_event_type',
  verificationEventTypeValues,
);
export const verificationActorTypeEnum = pgEnum(
  'verification_actor_type',
  verificationActorTypeValues,
);
export const verificationEvidenceRelationshipEnum = pgEnum(
  'verification_evidence_relationship',
  verificationEvidenceRelationshipValues,
);

export const verificationEvents = pgTable(
  'verification_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => acceptanceClaims.id, { onDelete: 'restrict' }),
    eventType: verificationEventTypeEnum('event_type').notNull(),
    fromStatus: acceptanceClaimStatusEnum('from_status'),
    toStatus: acceptanceClaimStatusEnum('to_status'),
    fromVisibility: claimVisibilityEnum('from_visibility'),
    toVisibility: claimVisibilityEnum('to_visibility'),
    reasonCode: varchar('reason_code', { length: 96 }).notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    publicSummary: text('public_summary'),
    internalNote: text('internal_note'),
    actorType: verificationActorTypeEnum('actor_type').default('operator').notNull(),
    actorId: uuid('actor_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('verification_events_claim_effective_idx').on(table.claimId, table.effectiveAt),
    index('verification_events_type_idx').on(table.eventType),
    index('verification_events_reason_idx').on(table.reasonCode),
    check('verification_events_reason_nonempty', sql`length(trim(${table.reasonCode})) > 0`),
    check(
      'verification_events_public_summary_nonempty',
      sql`${table.publicSummary} is null or length(trim(${table.publicSummary})) > 0`,
    ),
    check(
      'verification_events_internal_note_nonempty',
      sql`${table.internalNote} is null or length(trim(${table.internalNote})) > 0`,
    ),
    check(
      'verification_events_operator_actor',
      sql`${table.actorType} <> 'operator' or ${table.actorId} is not null`,
    ),
    check(
      'verification_events_transition_present',
      sql`${table.toStatus} is not null or ${table.toVisibility} is not null or ${table.eventType} = 'corrected'`,
    ),
    check(
      'verification_events_status_event_shape',
      sql`${table.eventType} not in ('confirmed', 'reconfirmed', 'marked_stale', 'ended', 'restored') or (${table.fromVisibility} is null and ${table.toVisibility} is null)`,
    ),
    check(
      'verification_events_visibility_event_shape',
      sql`${table.eventType} not in ('hidden', 'unhidden') or (${table.fromStatus} is null and ${table.toStatus} is null)`,
    ),
    check(
      'verification_events_corrected_shape',
      sql`${table.eventType} <> 'corrected' or (${table.fromStatus} is null and ${table.toStatus} is null and ${table.fromVisibility} is null and ${table.toVisibility} is null and (${table.publicSummary} is not null or ${table.internalNote} is not null))`,
    ),
    check(
      'verification_events_confirmed_transition',
      sql`${table.eventType} <> 'confirmed' or (${table.toStatus} = 'confirmed' and (${table.fromStatus} is null or ${table.fromStatus} = 'candidate'))`,
    ),
    check(
      'verification_events_reconfirmed_transition',
      sql`${table.eventType} <> 'reconfirmed' or (${table.fromStatus} = 'confirmed' and ${table.toStatus} = 'confirmed')`,
    ),
    check(
      'verification_events_stale_transition',
      sql`${table.eventType} <> 'marked_stale' or (${table.fromStatus} = 'confirmed' and ${table.toStatus} = 'stale')`,
    ),
    check(
      'verification_events_ended_transition',
      sql`${table.eventType} <> 'ended' or (${table.fromStatus} in ('confirmed', 'stale') and ${table.toStatus} = 'ended')`,
    ),
    check(
      'verification_events_restored_transition',
      sql`${table.eventType} <> 'restored' or (${table.fromStatus} = 'stale' and ${table.toStatus} = 'confirmed')`,
    ),
    check(
      'verification_events_hidden_transition',
      sql`${table.eventType} <> 'hidden' or (${table.toVisibility} in ('hidden', 'temporarily_hidden') and (${table.fromVisibility} is null or ${table.fromVisibility} = 'public'))`,
    ),
    check(
      'verification_events_unhidden_transition',
      sql`${table.eventType} <> 'unhidden' or (${table.fromVisibility} in ('hidden', 'temporarily_hidden') and ${table.toVisibility} = 'public')`,
    ),
  ],
);

export const verificationEventEvidence = pgTable(
  'verification_event_evidence',
  {
    verificationEventId: uuid('verification_event_id')
      .notNull()
      .references(() => verificationEvents.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'restrict' }),
    relationship: verificationEvidenceRelationshipEnum('relationship').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'verification_event_evidence_pk',
      columns: [table.verificationEventId, table.evidenceId],
    }),
    index('verification_event_evidence_evidence_idx').on(table.evidenceId),
  ],
);

export type VerificationEvent = typeof verificationEvents.$inferSelect;
export type NewVerificationEvent = typeof verificationEvents.$inferInsert;
export type VerificationEventEvidence = typeof verificationEventEvidence.$inferSelect;
export type NewVerificationEventEvidence = typeof verificationEventEvidence.$inferInsert;
