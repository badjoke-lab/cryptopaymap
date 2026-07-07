import { z } from 'zod';
import {
  entityStatusValues,
  entityTypeValues,
  locationStatusValues,
  osmElementTypeValues,
} from '../db/schema';
import { claimVisibilitySchema, countryCodeSchema, httpsUrlSchema, publicSlugSchema } from './core';

export const entityTypeSchema = z.enum(entityTypeValues);
export const entityStatusSchema = z.enum(entityStatusValues);
export const locationStatusSchema = z.enum(locationStatusValues);
export const osmElementTypeSchema = z.enum(osmElementTypeValues);

export const canonicalLocationSocialLinkSchema = z
  .object({
    platform: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use a stable lowercase social platform key.'),
    url: httpsUrlSchema,
    handle: z.string().trim().min(1).max(120).nullable(),
  })
  .strict();

export const canonicalEntitySchema = z.object({
  entityType: entityTypeSchema,
  name: z.string().trim().min(1).max(160),
  slug: publicSlugSchema.nullable(),
  legalName: z.string().trim().min(1).max(200).nullable(),
  websiteUrl: httpsUrlSchema.nullable(),
  countryCode: countryCodeSchema.nullable(),
  entityStatus: entityStatusSchema,
  visibility: claimVisibilitySchema,
});

export const canonicalLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(160).nullable(),
    slug: publicSlugSchema,
    addressLine: z.string().trim().min(1).max(500).nullable(),
    locality: z.string().trim().min(1).max(120).nullable(),
    region: z.string().trim().min(1).max(120).nullable(),
    postalCode: z.string().trim().min(1).max(32).nullable(),
    countryCode: countryCodeSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    locationStatus: locationStatusSchema,
    visibility: claimVisibilitySchema,
    websiteUrl: httpsUrlSchema.nullable(),
    phone: z.string().trim().min(1).max(64).nullable(),
    description: z.string().trim().min(1).max(5_000).nullable().optional(),
    openingHours: z.string().trim().min(1).max(2_000).nullable().optional(),
    amenities: z
      .array(z.string().trim().min(1).max(80))
      .max(100)
      .transform((values) => [...new Set(values)])
      .optional(),
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
      .optional(),
    osmType: osmElementTypeSchema.nullable(),
    osmId: z.number().int().positive().nullable(),
  })
  .superRefine((location, context) => {
    if ((location.osmType === null) !== (location.osmId === null)) {
      context.addIssue({
        code: 'custom',
        path: ['osmType'],
        message: 'OSM type and OSM ID must either both be present or both be absent.',
      });
    }
  });

export type CanonicalEntityInput = z.infer<typeof canonicalEntitySchema>;
export type CanonicalLocationInput = z.infer<typeof canonicalLocationSchema>;
export type CanonicalLocationSocialLink = z.infer<typeof canonicalLocationSocialLinkSchema>;
