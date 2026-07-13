import { z } from 'zod';
import { canonicalLocationSocialLinkSchema } from '../schemas/canonical-identity';
import { countryCodeSchema, httpsUrlSchema } from '../schemas/core';
import {
  commonSubmissionIntakeSchema,
  submissionEvidenceUrlSchema,
  type CommonSubmissionIntake,
} from './contract';
import { suggestPaymentProposalsSchema } from './suggest-contract';

const boundedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const businessClaimTargetTypeValues = ['entity', 'location'] as const;
export const businessClaimTargetTypeSchema = z.enum(businessClaimTargetTypeValues);

export const businessClaimantRoleValues = [
  'owner',
  'authorized_representative',
  'authorized_employee',
] as const;
export const businessClaimantRoleSchema = z.enum(businessClaimantRoleValues);

export const businessClaimRequestedScopeValues = [
  'representative_relationship',
  'entity_profile',
  'location_profile',
  'payment_information',
] as const;
export const businessClaimRequestedScopeSchema = z.enum(businessClaimRequestedScopeValues);
export const businessClaimRequestedScopesSchema = z
  .array(businessClaimRequestedScopeSchema)
  .min(1)
  .max(businessClaimRequestedScopeValues.length)
  .transform((values) => [...new Set(values)])
  .refine(
    (values) => values.includes('representative_relationship'),
    'Business claims must request a representative relationship.',
  );

export const ownershipVerificationMethodValues = [
  'official_domain_email',
  'website_code',
  'dns_txt',
  'official_social',
  'assisted_verification',
] as const;
export const ownershipVerificationMethodSchema = z.enum(ownershipVerificationMethodValues);

const officialDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Use a registrable-looking lowercase domain name.',
  );

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

export const businessClaimVerificationRequestSchema = z
  .object({
    method: ownershipVerificationMethodSchema,
    officialDomain: officialDomainSchema.nullable(),
    officialContactEmail: z.email().max(320).nullable(),
    officialWebsiteUrl: httpsUrlSchema.nullable(),
    officialSocialUrl: httpsUrlSchema.nullable(),
    assistedVerifierReference: boundedText(200).nullable(),
    privateProofUrl: submissionEvidenceUrlSchema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.method === 'official_domain_email') {
      if (request.officialDomain === null || request.officialContactEmail === null) {
        context.addIssue({
          code: 'custom',
          message: 'Official-domain email verification requires a domain and contact email.',
        });
      } else {
        const domain = emailDomain(request.officialContactEmail);
        if (domain !== request.officialDomain && !domain.endsWith(`.${request.officialDomain}`)) {
          context.addIssue({
            code: 'custom',
            path: ['officialContactEmail'],
            message: 'The official contact email must belong to the declared official domain.',
          });
        }
      }
    }
    if (request.method === 'website_code' && request.officialWebsiteUrl === null) {
      context.addIssue({
        code: 'custom',
        path: ['officialWebsiteUrl'],
        message: 'Website-code verification requires an official HTTPS website URL.',
      });
    }
    if (request.method === 'dns_txt' && request.officialDomain === null) {
      context.addIssue({
        code: 'custom',
        path: ['officialDomain'],
        message: 'DNS verification requires an official domain.',
      });
    }
    if (request.method === 'official_social' && request.officialSocialUrl === null) {
      context.addIssue({
        code: 'custom',
        path: ['officialSocialUrl'],
        message: 'Official-social verification requires an official social URL.',
      });
    }
    if (
      request.method === 'assisted_verification' &&
      request.assistedVerifierReference === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['assistedVerifierReference'],
        message: 'Assisted verification requires a bounded verifier reference.',
      });
    }
  });

export const businessClaimEntityCorrectionSchema = z
  .object({
    name: boundedText(160).nullable(),
    legalName: boundedText(200).nullable(),
    websiteUrl: httpsUrlSchema.nullable(),
    countryCode: countryCodeSchema.nullable(),
  })
  .strict()
  .refine(
    (correction) => Object.values(correction).some((value) => value !== null),
    'Entity corrections require at least one proposed field.',
  );

export const businessClaimLocationCorrectionSchema = z
  .object({
    name: boundedText(160).nullable(),
    addressLine: boundedText(500).nullable(),
    locality: boundedText(120).nullable(),
    region: boundedText(120).nullable(),
    postalCode: boundedText(32).nullable(),
    countryCode: countryCodeSchema.nullable(),
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    websiteUrl: httpsUrlSchema.nullable(),
    phone: boundedText(64).nullable(),
    description: boundedText(5_000).nullable(),
    openingHours: boundedText(2_000).nullable(),
    amenities: z.array(boundedText(80)).max(100).transform((values) => [...new Set(values)]),
    socialLinks: z
      .array(canonicalLocationSocialLinkSchema)
      .max(30)
      .superRefine((links, context) => {
        const seen = new Set<string>();
        links.forEach((link, index) => {
          const key = `${link.platform}:${link.url}`;
          if (seen.has(key)) {
            context.addIssue({
              code: 'custom',
              path: [index],
              message: 'Duplicate social links are not allowed.',
            });
          }
          seen.add(key);
        });
      }),
  })
  .strict()
  .superRefine((correction, context) => {
    const scalarValues = [
      correction.name,
      correction.addressLine,
      correction.locality,
      correction.region,
      correction.postalCode,
      correction.countryCode,
      correction.latitude,
      correction.longitude,
      correction.websiteUrl,
      correction.phone,
      correction.description,
      correction.openingHours,
    ];
    if (
      scalarValues.every((value) => value === null) &&
      correction.amenities.length === 0 &&
      correction.socialLinks.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Location corrections require at least one proposed field.',
      });
    }
    if ((correction.latitude === null) !== (correction.longitude === null)) {
      context.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Latitude and longitude corrections must be supplied together.',
      });
    }
  });

export const businessClaimProposedChangesSchema = z
  .object({
    entity: businessClaimEntityCorrectionSchema.nullable(),
    location: businessClaimLocationCorrectionSchema.nullable(),
    paymentProposals: suggestPaymentProposalsSchema.nullable(),
  })
  .strict();

export const businessClaimOriginalPayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-v1'),
    claimantRole: businessClaimantRoleSchema,
    requestedScopes: businessClaimRequestedScopesSchema,
    verification: businessClaimVerificationRequestSchema,
    proposedChanges: businessClaimProposedChangesSchema,
    authorityStatement: boundedText(1_000),
  })
  .strict();

export const businessClaimSubmissionIntakeSchema = commonSubmissionIntakeSchema
  .safeExtend({
    submissionType: z.literal('claim'),
    targetType: businessClaimTargetTypeSchema,
    targetId: z.uuid(),
    relationship: z.literal('owner_or_authorized_representative'),
    originalPayload: businessClaimOriginalPayloadSchema,
  })
  .strict()
  .superRefine((intake, context) => {
    const { requestedScopes, proposedChanges } = intake.originalPayload;
    if (intake.targetType === 'entity') {
      if (requestedScopes.includes('location_profile') || proposedChanges.location !== null) {
        context.addIssue({
          code: 'custom',
          path: ['originalPayload', 'proposedChanges', 'location'],
          message: 'Entity-targeted claims must not include location-profile changes.',
        });
      }
    }
    if (intake.targetType === 'location') {
      if (requestedScopes.includes('entity_profile') || proposedChanges.entity !== null) {
        context.addIssue({
          code: 'custom',
          path: ['originalPayload', 'proposedChanges', 'entity'],
          message: 'Location-targeted claims must not include entity-profile changes.',
        });
      }
    }
    if (proposedChanges.entity !== null && !requestedScopes.includes('entity_profile')) {
      context.addIssue({
        code: 'custom',
        path: ['originalPayload', 'requestedScopes'],
        message: 'Entity changes require the entity-profile scope.',
      });
    }
    if (proposedChanges.location !== null && !requestedScopes.includes('location_profile')) {
      context.addIssue({
        code: 'custom',
        path: ['originalPayload', 'requestedScopes'],
        message: 'Location changes require the location-profile scope.',
      });
    }
    if (
      proposedChanges.paymentProposals !== null &&
      !requestedScopes.includes('payment_information')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['originalPayload', 'requestedScopes'],
        message: 'Payment changes require the payment-information scope.',
      });
    }
  });

export interface BusinessClaimReviewProjection {
  targetType: z.infer<typeof businessClaimTargetTypeSchema>;
  targetId: string;
  claimantRole: z.infer<typeof businessClaimantRoleSchema>;
  requestedScopes: z.infer<typeof businessClaimRequestedScopesSchema>;
  verification: Readonly<{
    method: z.infer<typeof ownershipVerificationMethodSchema>;
    officialDomain: string | null;
    officialContactEmailPresent: boolean;
    officialWebsiteUrl: string | null;
    officialSocialUrl: string | null;
    assistedVerifierReferencePresent: boolean;
    privateProofPresent: boolean;
  }>;
  proposedChanges: z.infer<typeof businessClaimProposedChangesSchema>;
  authorityStatement: string;
  evidenceLinks: CommonSubmissionIntake['evidenceLinks'];
}

export type BusinessClaimSubmissionIntake = z.infer<
  typeof businessClaimSubmissionIntakeSchema
>;

export function normalizeParsedBusinessClaimSubmissionIntake(
  intake: BusinessClaimSubmissionIntake,
): BusinessClaimReviewProjection {
  const payload = intake.originalPayload;
  return {
    targetType: intake.targetType,
    targetId: intake.targetId,
    claimantRole: payload.claimantRole,
    requestedScopes: payload.requestedScopes,
    verification: {
      method: payload.verification.method,
      officialDomain: payload.verification.officialDomain,
      officialContactEmailPresent: payload.verification.officialContactEmail !== null,
      officialWebsiteUrl: payload.verification.officialWebsiteUrl,
      officialSocialUrl: payload.verification.officialSocialUrl,
      assistedVerifierReferencePresent:
        payload.verification.assistedVerifierReference !== null,
      privateProofPresent: payload.verification.privateProofUrl !== null,
    },
    proposedChanges: payload.proposedChanges,
    authorityStatement: payload.authorityStatement,
    evidenceLinks: intake.evidenceLinks,
  };
}

export function normalizeBusinessClaimSubmissionIntake(
  raw: unknown,
): BusinessClaimReviewProjection {
  return normalizeParsedBusinessClaimSubmissionIntake(
    businessClaimSubmissionIntakeSchema.parse(raw),
  );
}
