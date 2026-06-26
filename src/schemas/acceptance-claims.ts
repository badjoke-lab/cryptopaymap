import { z } from 'zod';
import {
  acceptanceClaimStatusValues,
  acceptanceScopeValues,
  claimRegionInclusionValues,
  claimScopeValues,
  merchantReceivesValues,
  routeTypeValues,
} from '../db/schema';
import {
  claimVisibilitySchema,
  countryCodeSchema,
  publicSlugSchema,
} from './core';

export const claimScopeSchema = z.enum(claimScopeValues);
export const acceptanceScopeSchema = z.enum(acceptanceScopeValues);
export const merchantReceivesSchema = z.enum(merchantReceivesValues);
export const claimRegionInclusionSchema = z.enum(claimRegionInclusionValues);
export const acceptanceClaimStatusSchema = z.enum(acceptanceClaimStatusValues);
export const acceptanceClaimRouteSchema = z.enum(routeTypeValues);

const timestampSchema = z.iso.datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const nullableUuidSchema = z.uuid().nullable();

export const acceptanceClaimInputSchema = z
  .object({
    entityId: z.uuid(),
    locationId: nullableUuidSchema,
    claimScope: claimScopeSchema,
    routeType: acceptanceClaimRouteSchema,
    acceptanceScope: acceptanceScopeSchema,
    claimStatus: acceptanceClaimStatusSchema,
    visibility: claimVisibilitySchema,
    customerPaysCrypto: z.boolean(),
    merchantExplicitlyAcceptsCrypto: z.boolean(),
    processorId: nullableUuidSchema,
    howToPay: z.string().trim().min(1).max(2_000).nullable(),
    instructionsLanguage: z
      .string()
      .trim()
      .min(2)
      .max(35)
      .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, 'Use a BCP 47 language tag.'),
    merchantReceives: merchantReceivesSchema,
    restrictions: z.string().trim().min(1).max(2_000).nullable(),
    firstConfirmedAt: nullableTimestampSchema,
    lastConfirmedAt: nullableTimestampSchema,
    nextReviewAt: nullableTimestampSchema,
    endedAt: nullableTimestampSchema,
    endedReason: z.string().trim().min(1).max(1_000).nullable(),
  })
  .superRefine((claim, context) => {
    const locationSpecific = claim.claimScope === 'location_specific';
    if (locationSpecific !== (claim.locationId !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['locationId'],
        message: 'Only location-specific claims may reference a physical location.',
      });
    }

    if (claim.routeType === 'processor_checkout' && claim.processorId === null) {
      context.addIssue({
        code: 'custom',
        path: ['processorId'],
        message: 'Processor checkout claims require a processor entity.',
      });
    }

    if (claim.claimStatus === 'ended' && claim.endedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'Ended claims require an ended timestamp.',
      });
    }

    if (
      claim.claimStatus === 'confirmed' &&
      (claim.howToPay === null ||
        claim.firstConfirmedAt === null ||
        claim.lastConfirmedAt === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['claimStatus'],
        message: 'Confirmed claims require instructions and confirmation timestamps.',
      });
    }

    if (
      claim.visibility === 'public' &&
      !['confirmed', 'stale', 'ended'].includes(claim.claimStatus)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['visibility'],
        message: 'Candidate and rejected claims cannot be public.',
      });
    }

    if (
      claim.visibility === 'public' &&
      (!claim.customerPaysCrypto || !claim.merchantExplicitlyAcceptsCrypto)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['visibility'],
        message: 'Public claims require direct customer crypto payment and explicit acceptance.',
      });
    }

    if (
      claim.firstConfirmedAt !== null &&
      claim.lastConfirmedAt !== null &&
      Date.parse(claim.firstConfirmedAt) > Date.parse(claim.lastConfirmedAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lastConfirmedAt'],
        message: 'Last confirmation cannot precede first confirmation.',
      });
    }
  });

export const claimRegionInputSchema = z.object({
  countryCode: countryCodeSchema,
  regionCode: publicSlugSchema.nullable(),
  inclusionType: claimRegionInclusionSchema,
  notes: z.string().trim().min(1).max(500).nullable(),
});

export const acceptanceClaimTransitions = {
  candidate: ['confirmed', 'rejected'],
  confirmed: ['stale', 'ended'],
  stale: ['confirmed', 'ended'],
  ended: [],
  rejected: [],
} as const satisfies Record<
  (typeof acceptanceClaimStatusValues)[number],
  readonly (typeof acceptanceClaimStatusValues)[number][]
>;

export function canTransitionAcceptanceClaim(
  from: (typeof acceptanceClaimStatusValues)[number],
  to: (typeof acceptanceClaimStatusValues)[number],
): boolean {
  return (acceptanceClaimTransitions[from] as readonly string[]).includes(to);
}

export type AcceptanceClaimInput = z.infer<typeof acceptanceClaimInputSchema>;
export type ClaimRegionInput = z.infer<typeof claimRegionInputSchema>;
