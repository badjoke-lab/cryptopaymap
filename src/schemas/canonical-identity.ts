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
