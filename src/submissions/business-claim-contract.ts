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
    officialWebsiteUrl: httpsUrlSchema.nullable(),
    officialSocialUrl: httpsUrlSchema.nullable(),
    assistedVerifierReference: boundedText(200).nullable(),
    privateProofUrl: submissionEvidenceUrlSchema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.method === 'official_domain_email' && request.officialDomain === null) {
      context.addIssue({
        code: 'custom',
        path: ['officialDomain'],
        message: 'Official-domain email verification requires an official domain.',
      });
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
    if (request.method === 'assisted_verification' && request.assistedVerifierReference === null) {
      context.addIssue({
        code: 'custom',
        path: ['assistedVerifierReference'],
        message: 'Assisted verification requires a bounded verifier reference.',
      });
    }
  });

export const businessClaimEntityFieldValues = [
  'name',
  'legalName',
  'websiteUrl',
  'countryCode',
] as const;
export const businessClaimEntityFieldSchema = z.enum(businessClaimEntityFieldValues);

export const businessClaimEntityCorrectionSchema = z
  .object({
    changedFields: z
      .array(businessClaimEntityFieldSchema)
      .min(1)
      .max(businessClaimEntityFieldValues.length)
      .transform((values) => [...new Set(values)]),
    name: boundedText(160).nullable(),
    legalName: boundedText(200).nullable(),
    websiteUrl: httpsUrlSchema.nullable(),
    countryCode: countryCodeSchema.nullable(),
  })
  .strict()
  .superRefine((correction, context) => {
    for (const field of businessClaimEntityFieldValues) {
      const changed = correction.changedFields.includes(field);
      const value = correction[field];
      if (!changed && value !== null) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Unchanged Entity fields must use null placeholders.',
        });
      }
    }
    if (correction.changedFields.includes('name') && correction.name === null) {
      context.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Entity name cannot be cleared.',
      });
    }
  });

export const businessClaimLocationFieldValues = [
  'name',
  'addressLine',
  'locality',
  'region',
  'postalCode',
  'countryCode',
  'latitude',
  'longitude',
  'websiteUrl',
  'phone',
  'description',
  'openingHours',
  'amenities',
  'socialLinks',
] as const;
export const businessClaimLocationFieldSchema = z.enum(businessClaimLocationFieldValues);

export const businessClaimLocationCorrectionSchema = z
  .object({
    changedFields: z
      .array(businessClaimLocationFieldSchema)
      .min(1)
      .max(businessClaimLocationFieldValues.length)
      .transform((values) => [...new Set(values)]),
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
    amenities: z
      .array(boundedText(80))
      .max(100)
      .transform((values) => [...new Set(values)])
      .nullable(),
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
      })
      .nullable(),
  })
  .strict()
  .superRefine((correction, context) => {
    for (const field of businessClaimLocationFieldValues) {
      const changed = correction.changedFields.includes(field);
      const value = correction[field];
      if (!changed && value !== null) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Unchanged Location fields must use null placeholders.',
        });
      }
    }

    if (correction.changedFields.includes('countryCode') && correction.countryCode === null) {
      context.addIssue({
        code: 'custom',
        path: ['countryCode'],
        message: 'Location country code cannot be cleared.',
      });
    }

    const changesLatitude = correction.changedFields.includes('latitude');
    const changesLongitude = correction.changedFields.includes('longitude');
    if (changesLatitude !== changesLongitude) {
      context.addIssue({
        code: 'custom',
        path: ['changedFields'],
        message: 'Latitude and longitude corrections must be requested together.',
      });
    }
    if (changesLatitude && (correction.latitude === null || correction.longitude === null)) {
      context.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Latitude and longitude corrections require a complete coordinate pair.',
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
    const { requestedScopes, proposedChanges, verification } = intake.originalPayload;

    if (verification.method === 'official_domain_email') {
      if (intake.contact === null || !intake.contact.contactAllowed) {
        context.addIssue({
          code: 'custom',
          path: ['contact'],
          message: 'Official-domain email verification requires protected follow-up contact.',
        });
      } else if (verification.officialDomain !== null) {
        const domain = emailDomain(intake.contact.email);
        if (
          domain !== verification.officialDomain &&
          !domain.endsWith(`.${verification.officialDomain}`)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['contact', 'email'],
            message: 'The protected contact email must belong to the declared official domain.',
          });
        }
      }
    }

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
    protectedContactPresent: boolean;
    officialWebsiteUrl: string | null;
    officialSocialUrl: string | null;
    assistedVerifierReferencePresent: boolean;
    privateProofPresent: boolean;
  }>;
  proposedChanges: z.infer<typeof businessClaimProposedChangesSchema>;
  authorityStatement: string;
  evidenceLinks: CommonSubmissionIntake['evidenceLinks'];
}

export type BusinessClaimSubmissionIntake = z.infer<typeof businessClaimSubmissionIntakeSchema>;

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
      protectedContactPresent: intake.contact !== null,
      officialWebsiteUrl: payload.verification.officialWebsiteUrl,
      officialSocialUrl: payload.verification.officialSocialUrl,
      assistedVerifierReferencePresent: payload.verification.assistedVerifierReference !== null,
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
