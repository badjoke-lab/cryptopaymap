import { z } from 'zod';
import { routeTypeValues } from '../db/schema/enums';
import { paymentMethodValues } from '../db/schema/payment-registries';
import { canonicalLocationSocialLinkSchema } from '../schemas/canonical-identity';
import { countryCodeSchema, dateOnlySchema, httpsUrlSchema, publicSlugSchema } from '../schemas/core';
import {
  commonSubmissionIntakeSchema,
  submissionRelationshipSchema,
  type CommonSubmissionIntake,
} from './contract';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const suggestionKindValues = ['physical_place', 'online_service'] as const;
export const suggestionKindSchema = z.enum(suggestionKindValues);

export const suggestEntityProposalSchema = z
  .object({
    name: boundedText(160),
    legalName: boundedText(200).nullable(),
    websiteUrl: httpsUrlSchema.nullable(),
    countryCode: countryCodeSchema.nullable(),
  })
  .strict();

export const suggestPlaceProposalSchema = z
  .object({
    branchName: boundedText(160).nullable(),
    addressLine: boundedText(500).nullable(),
    locality: boundedText(120).nullable(),
    region: boundedText(120).nullable(),
    postalCode: boundedText(32).nullable(),
    countryCode: countryCodeSchema,
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    websiteUrl: httpsUrlSchema.nullable(),
    phone: boundedText(64).nullable(),
    description: boundedText(5_000).nullable(),
    openingHours: boundedText(2_000).nullable(),
    amenities: z
      .array(boundedText(80))
      .max(100)
      .transform((values) => [...new Set(values)]),
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
  .superRefine((place, context) => {
    const hasCoordinates = place.latitude !== null || place.longitude !== null;
    if ((place.latitude === null) !== (place.longitude === null)) {
      context.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Latitude and longitude must either both be present or both be absent.',
      });
    }
    if (place.addressLine === null && !hasCoordinates) {
      context.addIssue({
        code: 'custom',
        path: ['addressLine'],
        message: 'Place suggestions require an address or a coordinate pair.',
      });
    }
  });

export const suggestCategoryProposalSchema = z
  .object({
    slug: publicSlugSchema,
    isPrimary: z.boolean(),
  })
  .strict();

export const suggestCategoryProposalsSchema = z
  .array(suggestCategoryProposalSchema)
  .max(20)
  .superRefine((categories, context) => {
    const seen = new Set<string>();
    let primaryCount = 0;
    categories.forEach((category, index) => {
      if (seen.has(category.slug)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'slug'],
          message: 'Duplicate category proposals are not allowed.',
        });
      }
      seen.add(category.slug);
      if (category.isPrimary) primaryCount += 1;
    });
    if (primaryCount > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Suggestion category proposals may contain at most one primary category.',
      });
    }
  });

export const suggestProcessorProposalSchema = z
  .object({
    name: boundedText(160),
    websiteUrl: httpsUrlSchema.nullable(),
  })
  .strict();

export const suggestPaymentProposalSchema = z
  .object({
    assetSlug: publicSlugSchema.nullable(),
    networkSlug: publicSlugSchema.nullable(),
    routeType: z.enum(routeTypeValues).nullable(),
    paymentMethod: z.enum(paymentMethodValues).nullable(),
    processor: suggestProcessorProposalSchema.nullable(),
    contractAddress: boundedText(200).nullable(),
    howToPay: boundedText(1_000).nullable(),
    restrictions: boundedText(1_000).nullable(),
    isPrimary: z.boolean(),
  })
  .strict()
  .superRefine((proposal, context) => {
    if (
      proposal.assetSlug === null &&
      proposal.networkSlug === null &&
      proposal.routeType === null &&
      proposal.paymentMethod === null &&
      proposal.processor === null &&
      proposal.contractAddress === null &&
      proposal.howToPay === null &&
      proposal.restrictions === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Payment proposals require at least one concrete payment detail.',
      });
    }
    if (proposal.routeType === 'processor_checkout' && proposal.processor === null) {
      context.addIssue({
        code: 'custom',
        path: ['processor'],
        message: 'Known processor-checkout routes require a processor proposal.',
      });
    }
    if (proposal.routeType === 'direct_wallet' && proposal.processor !== null) {
      context.addIssue({
        code: 'custom',
        path: ['processor'],
        message: 'Direct-wallet proposals must not attach a processor proposal.',
      });
    }
  });

export const suggestPaymentProposalsSchema = z
  .array(suggestPaymentProposalSchema)
  .min(1)
  .max(20)
  .superRefine((proposals, context) => {
    const seen = new Set<string>();
    let primaryCount = 0;
    proposals.forEach((proposal, index) => {
      const key = [
        proposal.assetSlug ?? '',
        proposal.networkSlug ?? '',
        proposal.routeType ?? '',
        proposal.paymentMethod ?? '',
        proposal.processor?.name ?? '',
        proposal.contractAddress ?? '',
        proposal.howToPay ?? '',
      ].join(':');
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Duplicate payment proposals are not allowed.',
        });
      }
      seen.add(key);
      if (proposal.isPrimary) primaryCount += 1;
    });
    if (primaryCount > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Suggestion payment proposals may contain at most one primary payment option.',
      });
    }
  });

const sharedSuggestionFields = {
  schemaVersion: z.literal('suggest-v1'),
  entity: suggestEntityProposalSchema,
  categories: suggestCategoryProposalsSchema,
  paymentProposals: suggestPaymentProposalsSchema,
  observedAt: dateOnlySchema,
};

export const physicalPlaceSuggestionPayloadSchema = z
  .object({
    ...sharedSuggestionFields,
    suggestionKind: z.literal('physical_place'),
    place: suggestPlaceProposalSchema,
  })
  .strict();

export const onlineServiceSuggestionPayloadSchema = z
  .object({
    ...sharedSuggestionFields,
    suggestionKind: z.literal('online_service'),
    place: z.null(),
  })
  .strict();

export const suggestOriginalPayloadSchema = z
  .discriminatedUnion('suggestionKind', [
    physicalPlaceSuggestionPayloadSchema,
    onlineServiceSuggestionPayloadSchema,
  ])
  .superRefine((payload, context) => {
    if (payload.suggestionKind === 'online_service' && payload.entity.websiteUrl === null) {
      context.addIssue({
        code: 'custom',
        path: ['entity', 'websiteUrl'],
        message: 'Online Service suggestions require an official HTTPS website URL.',
      });
    }
  });

export const suggestSubmissionIntakeSchema = commonSubmissionIntakeSchema
  .extend({
    submissionType: z.literal('suggest'),
    targetType: z.null(),
    targetId: z.null(),
    relationship: submissionRelationshipSchema,
    originalPayload: suggestOriginalPayloadSchema,
  })
  .strict();

export interface SuggestReviewProjection {
  suggestionKind: z.infer<typeof suggestionKindSchema>;
  entityType: 'merchant' | 'online_service';
  entity: z.infer<typeof suggestEntityProposalSchema>;
  place: z.infer<typeof suggestPlaceProposalSchema> | null;
  categories: z.infer<typeof suggestCategoryProposalsSchema>;
  paymentProposals: z.infer<typeof suggestPaymentProposalsSchema>;
  observedAt: string;
  relationship: z.infer<typeof submissionRelationshipSchema>;
  evidenceLinks: CommonSubmissionIntake['evidenceLinks'];
}

export function normalizeSuggestSubmissionIntake(raw: unknown): SuggestReviewProjection {
  const intake = suggestSubmissionIntakeSchema.parse(raw);
  const payload = intake.originalPayload;
  return {
    suggestionKind: payload.suggestionKind,
    entityType: payload.suggestionKind === 'physical_place' ? 'merchant' : 'online_service',
    entity: payload.entity,
    place: payload.place,
    categories: payload.categories,
    paymentProposals: payload.paymentProposals,
    observedAt: payload.observedAt,
    relationship: intake.relationship,
    evidenceLinks: intake.evidenceLinks,
  };
}

export type SuggestionKind = z.infer<typeof suggestionKindSchema>;
export type SuggestOriginalPayload = z.infer<typeof suggestOriginalPayloadSchema>;
export type SuggestSubmissionIntake = z.infer<typeof suggestSubmissionIntakeSchema>;
