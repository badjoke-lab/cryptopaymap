import { z } from 'zod';
import {
  acceptanceClaimStatusValues,
  claimVisibilityValues,
  verificationActorTypeValues,
  verificationEventTypeValues,
  verificationEvidenceRelationshipValues,
} from '../db/schema';

export const verificationEventTypeSchema = z.enum(verificationEventTypeValues);
export const verificationActorTypeSchema = z.enum(verificationActorTypeValues);
export const verificationEvidenceRelationshipSchema = z.enum(
  verificationEvidenceRelationshipValues,
);

const claimStatusSchema = z.enum(acceptanceClaimStatusValues);
const claimVisibilitySchema = z.enum(claimVisibilityValues);
const nullableClaimStatusSchema = claimStatusSchema.nullable();
const nullableClaimVisibilitySchema = claimVisibilitySchema.nullable();
const statusEventTypes = new Set<(typeof verificationEventTypeValues)[number]>([
  'confirmed',
  'reconfirmed',
  'marked_stale',
  'ended',
  'restored',
]);
const visibilityEventTypes = new Set<(typeof verificationEventTypeValues)[number]>([
  'hidden',
  'unhidden',
]);

export const verificationEventInputSchema = z
  .object({
    claimId: z.uuid(),
    eventType: verificationEventTypeSchema,
    fromStatus: nullableClaimStatusSchema,
    toStatus: nullableClaimStatusSchema,
    fromVisibility: nullableClaimVisibilitySchema,
    toVisibility: nullableClaimVisibilitySchema,
    reasonCode: z
      .string()
      .trim()
      .min(1)
      .max(96)
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'Use a lowercase machine-readable reason code.'),
    effectiveAt: z.iso.datetime({ offset: true }),
    publicSummary: z.string().trim().min(1).max(1_000).nullable(),
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
    actorType: verificationActorTypeSchema,
    actorId: z.uuid().nullable(),
  })
  .superRefine((event, context) => {
    if (
      event.toStatus === null &&
      event.toVisibility === null &&
      event.eventType !== 'corrected'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'A verification event must change status, visibility, or record a correction.',
      });
    }

    if (event.actorType === 'operator' && event.actorId === null) {
      context.addIssue({
        code: 'custom',
        path: ['actorId'],
        message: 'Operator events require an actor identifier.',
      });
    }

    if (
      statusEventTypes.has(event.eventType) &&
      (event.fromVisibility !== null || event.toVisibility !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toVisibility'],
        message: 'Status events cannot also change visibility.',
      });
    }

    if (
      visibilityEventTypes.has(event.eventType) &&
      (event.fromStatus !== null || event.toStatus !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toStatus'],
        message: 'Visibility events cannot also change verification status.',
      });
    }

    if (
      event.eventType === 'corrected' &&
      (event.fromStatus !== null ||
        event.toStatus !== null ||
        event.fromVisibility !== null ||
        event.toVisibility !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'Corrected events record metadata corrections and do not change claim state.',
      });
    }

    if (
      event.eventType === 'confirmed' &&
      (event.toStatus !== 'confirmed' ||
        (event.fromStatus !== null && event.fromStatus !== 'candidate'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toStatus'],
        message: 'Confirmed events transition a new or candidate claim to confirmed.',
      });
    }

    if (
      event.eventType === 'reconfirmed' &&
      (event.fromStatus !== 'confirmed' || event.toStatus !== 'confirmed')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toStatus'],
        message: 'Reconfirmed events keep a confirmed claim confirmed.',
      });
    }

    if (
      event.eventType === 'marked_stale' &&
      (event.fromStatus !== 'confirmed' || event.toStatus !== 'stale')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toStatus'],
        message: 'Marked-stale events transition confirmed claims to stale.',
      });
    }

    if (
      event.eventType === 'ended' &&
      (!['confirmed', 'stale'].includes(event.fromStatus ?? '') || event.toStatus !== 'ended')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toStatus'],
        message: 'Ended events transition confirmed or stale claims to ended.',
      });
    }

    if (
      event.eventType === 'restored' &&
      (event.fromStatus !== 'stale' || event.toStatus !== 'confirmed')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toStatus'],
        message: 'Restored events transition stale claims to confirmed.',
      });
    }

    if (
      event.eventType === 'hidden' &&
      (!['hidden', 'temporarily_hidden'].includes(event.toVisibility ?? '') ||
        (event.fromVisibility !== null && event.fromVisibility !== 'public'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toVisibility'],
        message: 'Hidden events move a public claim to a hidden state.',
      });
    }

    if (
      event.eventType === 'unhidden' &&
      (!['hidden', 'temporarily_hidden'].includes(event.fromVisibility ?? '') ||
        event.toVisibility !== 'public')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toVisibility'],
        message: 'Unhidden events restore a hidden claim to public visibility.',
      });
    }

    if (
      event.eventType === 'corrected' &&
      event.publicSummary === null &&
      event.internalNote === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['internalNote'],
        message: 'Corrected events require a public summary or internal note.',
      });
    }
  });

export const verificationEventEvidenceInputSchema = z.object({
  evidenceId: z.uuid(),
  relationship: verificationEvidenceRelationshipSchema,
});

export const verificationDecisionInputSchema = z
  .object({
    event: verificationEventInputSchema,
    evidenceLinks: z.array(verificationEventEvidenceInputSchema),
  })
  .superRefine((decision, context) => {
    const evidenceIds = new Set<string>();
    for (const [index, link] of decision.evidenceLinks.entries()) {
      if (evidenceIds.has(link.evidenceId)) {
        context.addIssue({
          code: 'custom',
          path: ['evidenceLinks', index],
          message: 'The same evidence cannot be linked twice to one event.',
        });
      }
      evidenceIds.add(link.evidenceId);
    }

    if (
      ['confirmed', 'reconfirmed', 'restored'].includes(decision.event.eventType) &&
      !decision.evidenceLinks.some((link) => link.relationship === 'basis')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['evidenceLinks'],
        message: 'Confirmation events require at least one basis evidence link.',
      });
    }

    if (
      ['marked_stale', 'ended'].includes(decision.event.eventType) &&
      !decision.evidenceLinks.some((link) =>
        ['basis', 'contradiction'].includes(link.relationship),
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['evidenceLinks'],
        message: 'Stale and ended events require decision evidence.',
      });
    }
  });

export interface ClaimStateProjection {
  status: (typeof acceptanceClaimStatusValues)[number];
  visibility: (typeof claimVisibilityValues)[number];
}

export function projectClaimState(
  initial: ClaimStateProjection,
  events: readonly z.infer<typeof verificationEventInputSchema>[],
): ClaimStateProjection {
  let projection = { ...initial };
  let lastEffectiveAt = Number.NEGATIVE_INFINITY;

  for (const eventInput of events) {
    const event = verificationEventInputSchema.parse(eventInput);
    const effectiveAt = Date.parse(event.effectiveAt);
    if (effectiveAt < lastEffectiveAt) {
      throw new Error('Verification events must be supplied in effective-time order.');
    }

    if (event.fromStatus !== null && event.fromStatus !== projection.status) {
      throw new Error('Verification event status history does not match the current projection.');
    }
    if (event.fromVisibility !== null && event.fromVisibility !== projection.visibility) {
      throw new Error('Verification event visibility history does not match the current projection.');
    }

    if (event.toStatus !== null) {
      projection.status = event.toStatus;
    }
    if (event.toVisibility !== null) {
      projection.visibility = event.toVisibility;
    }
    lastEffectiveAt = effectiveAt;
  }

  return projection;
}

export type VerificationEventInput = z.infer<typeof verificationEventInputSchema>;
export type VerificationDecisionInput = z.infer<typeof verificationDecisionInputSchema>;
