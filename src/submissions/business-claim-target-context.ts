import { z } from 'zod';
import { claimVisibilityValues } from '../db/schema/enums';
import { entityStatusValues, entityTypeValues } from '../db/schema/entities';
import { locationStatusValues } from '../db/schema/locations';
import { canonicalLocationSocialLinkSchema } from '../schemas/canonical-identity';
import { countryCodeSchema, httpsUrlSchema, publicSlugSchema } from '../schemas/core';
import {
  businessClaimEntityFieldSchema,
  businessClaimLocationFieldSchema,
  businessClaimProposedChangesSchema,
  businessClaimRequestedScopesSchema,
  businessClaimTargetTypeSchema,
  businessClaimantRoleSchema,
  ownershipVerificationMethodSchema,
  type BusinessClaimReviewProjection,
} from './business-claim-contract';
import { submissionEvidenceLinkSchema } from './contract';
import { reportTargetClaimSnapshotSchema } from './report-target-context';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimReviewProjectionSchema = z
  .object({
    targetType: businessClaimTargetTypeSchema,
    targetId: z.uuid(),
    claimantRole: businessClaimantRoleSchema,
    requestedScopes: businessClaimRequestedScopesSchema,
    verification: z
      .object({
        method: ownershipVerificationMethodSchema,
        officialDomain: z.string().trim().min(1).max(253).nullable(),
        protectedContactPresent: z.boolean(),
        officialWebsiteUrl: httpsUrlSchema.nullable(),
        officialSocialUrl: httpsUrlSchema.nullable(),
        assistedVerifierReferencePresent: z.boolean(),
        privateProofPresent: z.boolean(),
      })
      .strict(),
    proposedChanges: businessClaimProposedChangesSchema,
    authorityStatement: z.string().trim().min(1).max(1_000),
    evidenceLinks: z.array(submissionEvidenceLinkSchema).max(10),
  })
  .strict();

export const businessClaimTargetEntitySnapshotSchema = z
  .object({
    id: z.uuid(),
    entityType: z.enum(entityTypeValues),
    name: z.string().trim().min(1).max(160),
    slug: publicSlugSchema.nullable(),
    legalName: z.string().trim().min(1).max(200).nullable(),
    websiteUrl: httpsUrlSchema.nullable(),
    countryCode: countryCodeSchema.nullable(),
    entityStatus: z.enum(entityStatusValues),
    visibility: z.enum(claimVisibilityValues),
    updatedAt: timestampSchema,
  })
  .strict();

export const businessClaimTargetLocationSnapshotSchema = z
  .object({
    id: z.uuid(),
    entityId: z.uuid(),
    name: z.string().trim().min(1).max(160).nullable(),
    slug: publicSlugSchema,
    addressLine: z.string().trim().min(1).max(500).nullable(),
    locality: z.string().trim().min(1).max(120).nullable(),
    region: z.string().trim().min(1).max(120).nullable(),
    postalCode: z.string().trim().min(1).max(32).nullable(),
    countryCode: countryCodeSchema,
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    locationStatus: z.enum(locationStatusValues),
    visibility: z.enum(claimVisibilityValues),
    websiteUrl: httpsUrlSchema.nullable(),
    phone: z.string().trim().min(1).max(64).nullable(),
    description: z.string().trim().min(1).max(5_000).nullable(),
    openingHours: z.string().trim().min(1).max(2_000).nullable(),
    amenities: z.array(z.string().trim().min(1).max(80)).max(100),
    socialLinks: z.array(canonicalLocationSocialLinkSchema).max(30),
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((location, context) => {
    const amenityKeys = location.amenities.map((value) => normalizedText(value));
    if (new Set(amenityKeys).size !== amenityKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['amenities'],
        message: 'Canonical target amenities must be unique after normalization.',
      });
    }
    const socialKeys = location.socialLinks.map(
      (link) => `${link.platform}:${normalizedUrl(link.url)}`,
    );
    if (new Set(socialKeys).size !== socialKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['socialLinks'],
        message: 'Canonical target social links must be unique after normalization.',
      });
    }
  });

export const businessClaimCanonicalTargetMaterialSchema = z
  .object({
    targetType: businessClaimTargetTypeSchema,
    targetId: z.uuid(),
    entity: businessClaimTargetEntitySnapshotSchema,
    location: businessClaimTargetLocationSnapshotSchema.nullable(),
    claims: z.array(reportTargetClaimSnapshotSchema).max(100),
  })
  .strict()
  .superRefine((material, context) => {
    if (material.location !== null && material.location.entityId !== material.entity.id) {
      context.addIssue({
        code: 'custom',
        path: ['location', 'entityId'],
        message: 'Location target context must belong to the returned Entity.',
      });
    }

    if (material.targetType === 'entity') {
      if (material.targetId !== material.entity.id || material.location !== null) {
        context.addIssue({
          code: 'custom',
          message: 'Entity target identity does not match the returned material.',
        });
      }
    } else if (material.location === null || material.targetId !== material.location.id) {
      context.addIssue({
        code: 'custom',
        message: 'Location target identity does not match the returned material.',
      });
    }

    const claimIds = material.claims.map((claim) => claim.id);
    if (new Set(claimIds).size !== claimIds.length) {
      context.addIssue({ code: 'custom', path: ['claims'], message: 'Claim IDs must be unique.' });
    }

    material.claims.forEach((claim, index) => {
      if (claim.entityId !== material.entity.id) {
        context.addIssue({
          code: 'custom',
          path: ['claims', index, 'entityId'],
          message: 'Claim context must belong to the returned Entity.',
        });
      }
      if (material.targetType === 'entity' && claim.locationId !== null) {
        context.addIssue({
          code: 'custom',
          path: ['claims', index, 'locationId'],
          message: 'Entity target context must not include branch-specific Claims.',
        });
      }
      if (
        material.targetType === 'location' &&
        claim.locationId !== null &&
        claim.locationId !== material.location?.id
      ) {
        context.addIssue({
          code: 'custom',
          path: ['claims', index, 'locationId'],
          message: 'Location target context must not include another Location Claim.',
        });
      }
    });
  });

export const businessClaimFieldComparisonValues = [
  'same',
  'different',
  'clear_requested',
] as const;
export const businessClaimFieldComparisonSchema = z.enum(businessClaimFieldComparisonValues);

export const businessClaimIdentityComparisonValues = [
  'not_requested',
  'match',
  'different',
  'unavailable',
] as const;
export const businessClaimIdentityComparisonSchema = z.enum(businessClaimIdentityComparisonValues);

export const businessClaimPaymentSignalReasonValues = [
  'target_claim_context',
  'same_route_type',
  'same_asset',
  'same_network',
  'same_payment_method',
  'same_processor_name',
  'same_how_to_pay',
  'same_restrictions',
] as const;
export const businessClaimPaymentSignalReasonSchema = z.enum(
  businessClaimPaymentSignalReasonValues,
);

export const businessClaimLifecycleReasonValues = [
  'entity_not_active',
  'entity_not_public',
  'location_not_active',
  'location_not_public',
  'no_relevant_payment_claims',
  'candidate_claim_context',
  'stale_claim_context',
  'ended_claim_context',
] as const;
export const businessClaimLifecycleReasonSchema = z.enum(businessClaimLifecycleReasonValues);

export const businessClaimTargetContextResponseSchema = z
  .object({
    generatedAt: timestampSchema,
    target: z
      .object({
        targetType: businessClaimTargetTypeSchema,
        targetId: z.uuid(),
        canonicalPath: z
          .string()
          .regex(/^\/(place|service)\/[^/?#]+$/)
          .nullable(),
        entity: businessClaimTargetEntitySnapshotSchema,
        location: businessClaimTargetLocationSnapshotSchema.nullable(),
      })
      .strict(),
    identityComparisons: z
      .object({
        officialDomain: businessClaimIdentityComparisonSchema,
        officialWebsite: businessClaimIdentityComparisonSchema,
        officialSocial: businessClaimIdentityComparisonSchema,
      })
      .strict(),
    fieldComparisons: z
      .object({
        entity: z
          .array(
            z
              .object({
                field: businessClaimEntityFieldSchema,
                comparison: businessClaimFieldComparisonSchema,
              })
              .strict(),
          )
          .max(4),
        location: z
          .array(
            z
              .object({
                field: businessClaimLocationFieldSchema,
                comparison: businessClaimFieldComparisonSchema,
              })
              .strict(),
          )
          .max(14),
      })
      .strict(),
    paymentClaimSignals: z
      .array(
        z
          .object({
            claimId: z.uuid(),
            claimStatus: reportTargetClaimSnapshotSchema.shape.claimStatus,
            visibility: reportTargetClaimSnapshotSchema.shape.visibility,
            reasons: z.array(businessClaimPaymentSignalReasonSchema).min(1).max(8),
          })
          .strict(),
      )
      .max(100),
    lifecycleReasons: z.array(businessClaimLifecycleReasonSchema).max(8),
    coverage: z
      .object({
        targetLookupComplete: z.literal(true),
        entityComparisonComplete: z.boolean(),
        locationComparisonComplete: z.boolean(),
        paymentContextComplete: z.literal(true),
        socialComparisonComplete: z.boolean(),
        absenceIsConclusive: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type BusinessClaimCanonicalTargetMaterial = z.infer<
  typeof businessClaimCanonicalTargetMaterialSchema
>;
export type BusinessClaimTargetContextResponse = z.infer<
  typeof businessClaimTargetContextResponseSchema
>;

export interface BusinessClaimCanonicalTargetContextBackend {
  loadTarget(
    targetType: BusinessClaimReviewProjection['targetType'],
    targetId: string,
  ): Promise<BusinessClaimCanonicalTargetMaterial | null>;
}

export class BusinessClaimTargetContextError extends Error {
  constructor(
    readonly code:
      | 'invalid_projection'
      | 'target_not_found'
      | 'backend_failure'
      | 'invalid_response',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimTargetContextError';
  }
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function normalizedUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  if (url.pathname === '/') url.pathname = '';
  return url.href.replace(/\/$/, '');
}

function normalizedWebsiteHost(value: string): string {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
}

function canonicalPath(material: BusinessClaimCanonicalTargetMaterial): string | null {
  if (material.location !== null) return `/place/${material.location.slug}`;
  if (material.entity.entityType === 'online_service' && material.entity.slug !== null) {
    return `/service/${material.entity.slug}`;
  }
  return null;
}

function targetWebsite(material: BusinessClaimCanonicalTargetMaterial): string | null {
  return material.location?.websiteUrl ?? material.entity.websiteUrl;
}

function domainComparison(
  requestedDomain: string | null,
  canonicalWebsite: string | null,
): z.infer<typeof businessClaimIdentityComparisonSchema> {
  if (requestedDomain === null) return 'not_requested';
  if (canonicalWebsite === null) return 'unavailable';
  const canonicalHost = normalizedWebsiteHost(canonicalWebsite);
  const domain = requestedDomain.toLowerCase().replace(/^www\./, '');
  return canonicalHost === domain || canonicalHost.endsWith(`.${domain}`) ? 'match' : 'different';
}

function websiteComparison(
  requestedWebsite: string | null,
  canonicalWebsite: string | null,
): z.infer<typeof businessClaimIdentityComparisonSchema> {
  if (requestedWebsite === null) return 'not_requested';
  if (canonicalWebsite === null) return 'unavailable';
  return normalizedWebsiteHost(requestedWebsite) === normalizedWebsiteHost(canonicalWebsite)
    ? 'match'
    : 'different';
}

function socialComparison(
  requestedSocial: string | null,
  material: BusinessClaimCanonicalTargetMaterial,
): z.infer<typeof businessClaimIdentityComparisonSchema> {
  if (requestedSocial === null) return 'not_requested';
  if (material.location === null) return 'unavailable';
  const requested = normalizedUrl(requestedSocial);
  return material.location.socialLinks.some((link) => normalizedUrl(link.url) === requested)
    ? 'match'
    : 'different';
}

function normalizedComparable(field: string, value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (field === 'websiteUrl') return normalizedUrl(value);
    if (field === 'countryCode') return value.toUpperCase();
    return normalizedText(value);
  }
  if (field === 'amenities' && Array.isArray(value)) {
    return JSON.stringify(value.map((item) => normalizedText(String(item))).sort());
  }
  if (field === 'socialLinks' && Array.isArray(value)) {
    return JSON.stringify(
      value
        .map((item) => {
          const link = canonicalLocationSocialLinkSchema.parse(item);
          return {
            platform: link.platform,
            url: normalizedUrl(link.url),
            handle: link.handle === null ? null : normalizedText(link.handle),
          };
        })
        .sort((left, right) =>
          `${left.platform}:${left.url}:${left.handle ?? ''}`.localeCompare(
            `${right.platform}:${right.url}:${right.handle ?? ''}`,
          ),
        ),
    );
  }
  return JSON.stringify(value);
}

function compareField(
  field: string,
  proposedValue: unknown,
  currentValue: unknown,
): z.infer<typeof businessClaimFieldComparisonSchema> {
  if (proposedValue === null && currentValue !== null && currentValue !== undefined) {
    return 'clear_requested';
  }
  return normalizedComparable(field, proposedValue) === normalizedComparable(field, currentValue)
    ? 'same'
    : 'different';
}

function entityFieldComparisons(
  claim: BusinessClaimReviewProjection,
  material: BusinessClaimCanonicalTargetMaterial,
) {
  const correction = claim.proposedChanges.entity;
  if (correction === null) return [];
  return correction.changedFields.map((field) => ({
    field,
    comparison: compareField(field, correction[field], material.entity[field]),
  }));
}

function locationFieldComparisons(
  claim: BusinessClaimReviewProjection,
  material: BusinessClaimCanonicalTargetMaterial,
) {
  const correction = claim.proposedChanges.location;
  if (correction === null || material.location === null) return [];
  return correction.changedFields.map((field) => ({
    field,
    comparison: compareField(field, correction[field], material.location?.[field]),
  }));
}

function normalizedProcessorName(value: string): string {
  return normalizedText(value);
}

function paymentSignalReasons(
  claim: BusinessClaimReviewProjection,
  canonicalClaim: BusinessClaimCanonicalTargetMaterial['claims'][number],
): Array<(typeof businessClaimPaymentSignalReasonValues)[number]> {
  const proposals = claim.proposedChanges.paymentProposals;
  if (proposals === null) return [];
  const reasons: Array<(typeof businessClaimPaymentSignalReasonValues)[number]> = [
    'target_claim_context',
  ];
  for (const proposal of proposals) {
    if (proposal.routeType !== null && proposal.routeType === canonicalClaim.routeType) {
      reasons.push('same_route_type');
    }
    if (
      proposal.assetSlug !== null &&
      canonicalClaim.options.some((option) => option.assetSlug === proposal.assetSlug)
    ) {
      reasons.push('same_asset');
    }
    if (
      proposal.networkSlug !== null &&
      canonicalClaim.options.some((option) => option.networkSlug === proposal.networkSlug)
    ) {
      reasons.push('same_network');
    }
    if (
      proposal.paymentMethod !== null &&
      canonicalClaim.options.some((option) => option.paymentMethod === proposal.paymentMethod)
    ) {
      reasons.push('same_payment_method');
    }
    if (
      proposal.processor !== null &&
      canonicalClaim.processorName !== null &&
      normalizedProcessorName(proposal.processor.name) ===
        normalizedProcessorName(canonicalClaim.processorName)
    ) {
      reasons.push('same_processor_name');
    }
    if (
      proposal.howToPay !== null &&
      canonicalClaim.howToPay !== null &&
      normalizedText(proposal.howToPay) === normalizedText(canonicalClaim.howToPay)
    ) {
      reasons.push('same_how_to_pay');
    }
    if (
      proposal.restrictions !== null &&
      canonicalClaim.restrictions !== null &&
      normalizedText(proposal.restrictions) === normalizedText(canonicalClaim.restrictions)
    ) {
      reasons.push('same_restrictions');
    }
  }
  return [...new Set(reasons)];
}

function lifecycleReasons(
  claim: BusinessClaimReviewProjection,
  material: BusinessClaimCanonicalTargetMaterial,
): Array<(typeof businessClaimLifecycleReasonValues)[number]> {
  const reasons: Array<(typeof businessClaimLifecycleReasonValues)[number]> = [];
  if (material.entity.entityStatus !== 'active') reasons.push('entity_not_active');
  if (material.entity.visibility !== 'public') reasons.push('entity_not_public');
  if (material.location !== null) {
    if (!['active', 'temporarily_closed'].includes(material.location.locationStatus)) {
      reasons.push('location_not_active');
    }
    if (material.location.visibility !== 'public') reasons.push('location_not_public');
  }
  if (claim.proposedChanges.paymentProposals !== null && material.claims.length === 0) {
    reasons.push('no_relevant_payment_claims');
  }
  if (material.claims.some((candidate) => candidate.claimStatus === 'candidate')) {
    reasons.push('candidate_claim_context');
  }
  if (material.claims.some((candidate) => candidate.claimStatus === 'stale')) {
    reasons.push('stale_claim_context');
  }
  if (material.claims.some((candidate) => candidate.claimStatus === 'ended')) {
    reasons.push('ended_claim_context');
  }
  return reasons;
}

export async function generateBusinessClaimTargetContext(
  rawClaim: BusinessClaimReviewProjection,
  backend: BusinessClaimCanonicalTargetContextBackend,
  asOf = new Date(),
): Promise<BusinessClaimTargetContextResponse> {
  if (Number.isNaN(asOf.getTime())) {
    throw new BusinessClaimTargetContextError(
      'invalid_projection',
      'Business Claim target context time is invalid.',
    );
  }

  const parsedClaim = businessClaimReviewProjectionSchema.safeParse(rawClaim);
  if (!parsedClaim.success) {
    throw new BusinessClaimTargetContextError(
      'invalid_projection',
      'Business Claim review projection is invalid.',
      { cause: parsedClaim.error },
    );
  }
  const claim = parsedClaim.data;

  let rawMaterial: BusinessClaimCanonicalTargetMaterial | null;
  try {
    rawMaterial = await backend.loadTarget(claim.targetType, claim.targetId);
  } catch (error) {
    throw new BusinessClaimTargetContextError(
      'backend_failure',
      'Business Claim target context could not be loaded.',
      { cause: error },
    );
  }
  if (rawMaterial === null) {
    throw new BusinessClaimTargetContextError(
      'target_not_found',
      'The Business Claim target does not exist.',
    );
  }

  const parsedMaterial = businessClaimCanonicalTargetMaterialSchema.safeParse(rawMaterial);
  if (
    !parsedMaterial.success ||
    parsedMaterial.data.targetType !== claim.targetType ||
    parsedMaterial.data.targetId !== claim.targetId
  ) {
    throw new BusinessClaimTargetContextError(
      'invalid_response',
      'Business Claim target backend returned invalid canonical material.',
      { cause: parsedMaterial.success ? undefined : parsedMaterial.error },
    );
  }
  const material = parsedMaterial.data;
  const canonicalWebsite = targetWebsite(material);
  const result = businessClaimTargetContextResponseSchema.safeParse({
    generatedAt: asOf.toISOString(),
    target: {
      targetType: material.targetType,
      targetId: material.targetId,
      canonicalPath: canonicalPath(material),
      entity: material.entity,
      location: material.location,
    },
    identityComparisons: {
      officialDomain: domainComparison(claim.verification.officialDomain, canonicalWebsite),
      officialWebsite: websiteComparison(
        claim.verification.officialWebsiteUrl,
        canonicalWebsite,
      ),
      officialSocial: socialComparison(claim.verification.officialSocialUrl, material),
    },
    fieldComparisons: {
      entity: entityFieldComparisons(claim, material),
      location: locationFieldComparisons(claim, material),
    },
    paymentClaimSignals: material.claims
      .map((canonicalClaim) => ({
        claimId: canonicalClaim.id,
        claimStatus: canonicalClaim.claimStatus,
        visibility: canonicalClaim.visibility,
        reasons: paymentSignalReasons(claim, canonicalClaim),
      }))
      .filter((signal) => signal.reasons.length > 0)
      .sort((left, right) => left.claimId.localeCompare(right.claimId)),
    lifecycleReasons: lifecycleReasons(claim, material),
    coverage: {
      targetLookupComplete: true,
      entityComparisonComplete:
        claim.proposedChanges.entity === null || material.targetType === 'entity',
      locationComparisonComplete:
        claim.proposedChanges.location === null || material.location !== null,
      paymentContextComplete: true,
      socialComparisonComplete:
        claim.verification.officialSocialUrl === null || material.location !== null,
      absenceIsConclusive: false,
    },
  });
  if (!result.success) {
    throw new BusinessClaimTargetContextError(
      'invalid_response',
      'Business Claim target context could not be reduced to a bounded response.',
      { cause: result.error },
    );
  }
  return result.data;
}
