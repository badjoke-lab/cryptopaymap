import { z } from 'zod';
import {
  acceptanceClaimStatusValues,
  claimVisibilityValues,
  paymentMethodValues,
  routeTypeValues,
  submissionResolutionValues,
  submissionWorkflowStatusValues,
} from '../db/schema';

export const publicSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, 'Use a public lowercase slug.');

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use an ISO 3166-1 alpha-2 country code.');

export const dateOnlySchema = z.iso.date();

export const httpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'Use an HTTPS URL.');

export const acceptanceClaimStatusSchema = z.enum(acceptanceClaimStatusValues);
export const claimVisibilitySchema = z.enum(claimVisibilityValues);
export const routeTypeSchema = z.enum(routeTypeValues);
export const submissionWorkflowStatusSchema = z.enum(submissionWorkflowStatusValues);
export const submissionResolutionSchema = z.enum(submissionResolutionValues);
export const paymentMethodSchema = z.enum(paymentMethodValues);

export const foundationPlaceSchema = z.object({
  id: publicSlugSchema,
  slug: publicSlugSchema,
  name: z.string().trim().min(1).max(160),
  status: z.literal('confirmed'),
  asset: z.string().trim().min(1).max(16),
  network: publicSlugSchema,
  route: routeTypeSchema,
  lastConfirmed: dateOnlySchema,
  howToPay: z.string().trim().min(1).max(1_000),
});

export type FoundationPlace = z.infer<typeof foundationPlaceSchema>;
