import { z } from 'zod';
import {
  acceptanceScopeValues,
  claimScopeValues,
  entityStatusValues,
  evidenceClassValues,
  evidenceKindValues,
  evidencePolarityValues,
  evidenceSourceTypeValues,
  locationStatusValues,
  mediaRoleValues,
  merchantReceivesValues,
  osmElementTypeValues,
  paymentMethodValues,
  routeTypeValues,
} from '../db/schema';
import { countryCodeSchema, publicSlugSchema } from './core';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Use a lowercase SHA-256 digest.');
const timestampSchema = z.iso.datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const publicUrlSchema = z
  .url()
  .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol), 'Use an HTTP(S) URL.');
const publicHttpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'Use an HTTPS URL.');
const languageTagSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, 'Use a BCP 47 language tag.');

export const publicIdentifierSchema = publicSlugSchema.refine(
  (value) => !uuidShape.test(value),
  'Public identifiers must not expose internal UUIDs.',
);

export const publicClaimStatusSchema = z.enum(['confirmed', 'stale', 'ended']);
export const publicPinStatusSchema = z.enum(['confirmed', 'stale']);
export const publicMediaRoleSchema = z.enum(
  mediaRoleValues.filter(
    (role) => role !== 'evidence_image' && role !== 'owner_verification_proof',
  ) as [
    Exclude<(typeof mediaRoleValues)[number], 'evidence_image' | 'owner_verification_proof'>,
    ...Exclude<(typeof mediaRoleValues)[number], 'evidence_image' | 'owner_verification_proof'>[],
  ],
);

const publicFileHeaderSchema = z
  .object({
    schemaVersion: z.string().trim().min(1).max(32),
    generatedAt: timestampSchema,
  })
  .strict();

export const publicAssetRegistryRecordSchema = z
  .object({
    slug: publicIdentifierSchema,
    symbol: z.string().trim().min(1).max(16),
    name: z.string().trim().min(1).max(120),
    aliases: z.array(z.string().trim().min(1).max(120)).max(50),
    assetType: z.enum(['native', 'token', 'other']),
    isStablecoin: z.boolean(),
    isWrapped: z.boolean(),
    defaultDecimals: z.number().int().min(0).max(255).nullable(),
    status: z.enum(['active', 'deprecated']),
  })
  .strict();

export const publicNetworkRegistryRecordSchema = z
  .object({
    slug: publicIdentifierSchema,
    name: z.string().trim().min(1).max(120),
    aliases: z.array(z.string().trim().min(1).max(120)).max(50),
    status: z.enum(['active', 'deprecated']),
  })
  .strict();

export const publicPaymentAssetSchema = z
  .object({
    assetSlug: publicIdentifierSchema,
    assetSymbol: z.string().trim().min(1).max(16),
    networkSlug: publicIdentifierSchema,
    paymentMethod: z.enum(paymentMethodValues),
    contractAddress: z.string().trim().min(1).max(512).nullable(),
    isPrimary: z.boolean(),
    notes: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict();

export const publicEvidenceSchema = z
  .object({
    kind: z.enum(evidenceKindValues),
    evidenceClass: z.enum(evidenceClassValues),
    sourceType: z.enum(evidenceSourceTypeValues),
    polarity: z.enum(evidencePolarityValues),
    sourceName: z.string().trim().min(1).max(160).nullable(),
    sourceUrl: publicUrlSchema.nullable(),
    archiveUrl: publicUrlSchema.nullable(),
    observedAt: nullableTimestampSchema,
    publishedAt: nullableTimestampSchema,
    summary: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.sourceUrl === null && evidence.archiveUrl === null) {
      context.addIssue({
        code: 'custom',
        path: ['sourceUrl'],
        message: 'Public evidence requires a source or archive URL.',
      });
    }
  });

export const publicMediaSchema = z
  .object({
    role: publicMediaRoleSchema,
    url: publicHttpsUrlSchema,
    mimeType: z.enum(['image/jpeg', 'image/webp']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    altText: z.string().trim().min(1).max(500),
    attribution: z.string().trim().min(1).max(1_000).nullable(),
    licenseSlug: publicIdentifierSchema.nullable(),
  })
  .strict();

export const publicSocialLinkSchema = z
  .object({
    platform: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use a stable lowercase social platform key.'),
    url: publicHttpsUrlSchema,
    handle: z.string().trim().min(1).max(120).nullable(),
  })
  .strict();

export const publicProvenanceSchema = z
  .object({
    sourceName: z.string().trim().min(1).max(160),
    sourceUrl: publicUrlSchema.nullable(),
    licenseSlug: publicIdentifierSchema.nullable(),
    attribution: z.string().trim().min(1).max(1_000).nullable(),
    fields: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  })
  .strict();

export const publicAcceptanceClaimSchema = z
  .object({
    claimKey: publicIdentifierSchema,
    entitySlug: publicIdentifierSchema,
    locationSlug: publicIdentifierSchema.nullable(),
    claimScope: z.enum(claimScopeValues),
    acceptanceScope: z.enum(acceptanceScopeValues),
    status: publicClaimStatusSchema,
    routeType: z.enum(routeTypeValues),
    processorSlug: publicIdentifierSchema.nullable(),
    howToPay: z.string().trim().min(1).max(2_000),
    instructionsLanguage: languageTagSchema,
    merchantReceives: z.enum(merchantReceivesValues),
    restrictions: z.string().trim().min(1).max(2_000).nullable(),
    firstConfirmedAt: timestampSchema,
    lastConfirmedAt: timestampSchema,
    nextReviewAt: nullableTimestampSchema,
    endedAt: nullableTimestampSchema,
    endedReason: z.string().trim().min(1).max(1_000).nullable(),
    paymentAssets: z.array(publicPaymentAssetSchema).min(1).max(250),
    evidence: z.array(publicEvidenceSchema).min(1).max(250),
  })
  .strict()
  .superRefine((claim, context) => {
    const locationSpecific = claim.claimScope === 'location_specific';
    if (locationSpecific !== (claim.locationSlug !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['locationSlug'],
        message: 'Only location-specific claims may identify a location.',
      });
    }

    const processorCheckout = claim.routeType === 'processor_checkout';
    if (processorCheckout !== (claim.processorSlug !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['processorSlug'],
        message:
          'Processor checkout requires a processor and direct wallet routes cannot name one.',
      });
    }

    if (claim.status === 'ended') {
      if (claim.endedAt === null || claim.endedReason === null) {
        context.addIssue({
          code: 'custom',
          path: ['endedAt'],
          message: 'Ended claims require an end time and public reason.',
        });
      }
    } else if (claim.endedAt !== null || claim.endedReason !== null) {
      context.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'Only ended claims may contain end metadata.',
      });
    }

    if (Date.parse(claim.firstConfirmedAt) > Date.parse(claim.lastConfirmedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['lastConfirmedAt'],
        message: 'Last confirmation cannot precede first confirmation.',
      });
    }

    const combinations = new Set<string>();
    for (const [index, payment] of claim.paymentAssets.entries()) {
      const key = [
        payment.assetSlug,
        payment.networkSlug,
        payment.paymentMethod,
        payment.contractAddress ?? '',
      ].join(':');
      if (combinations.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['paymentAssets', index],
          message: 'Public payment combinations must be unique.',
        });
      }
      combinations.add(key);
    }
  });

export const publicOsmLocationSchema = z
  .object({
    locationSlug: publicIdentifierSchema,
    name: z.string().trim().min(1).max(160).nullable(),
    addressLine: z.string().trim().min(1).max(500).nullable(),
    locality: z.string().trim().min(1).max(120).nullable(),
    region: z.string().trim().min(1).max(120).nullable(),
    postalCode: z.string().trim().min(1).max(32).nullable(),
    countryCode: countryCodeSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    osmType: z.enum(osmElementTypeValues),
    osmId: z.string().regex(/^\d+$/, 'OSM identifiers are serialized as decimal strings.'),
    websiteUrl: publicUrlSchema.nullable(),
    sourceUrl: publicUrlSchema,
    attribution: z.string().trim().min(1).max(1_000),
    licenseSlug: z.literal('odbl-1-0'),
  })
  .strict();

export const publicPlacePinSchema = z
  .object({
    placeSlug: publicIdentifierSchema,
    name: z.string().trim().min(1).max(160),
    categorySlug: publicIdentifierSchema,
    countryCode: countryCodeSchema,
    locality: z.string().trim().min(1).max(120).nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    status: publicPinStatusSchema,
    assetSlugs: z.array(publicIdentifierSchema).min(1).max(100),
    networkSlugs: z.array(publicIdentifierSchema).min(1).max(100),
    routeTypes: z.array(z.enum(routeTypeValues)).min(1).max(routeTypeValues.length),
    lastConfirmedAt: timestampSchema,
    thumbnail: publicMediaSchema.nullable(),
  })
  .strict()
  .superRefine((pin, context) => {
    for (const [path, values] of [
      ['assetSlugs', pin.assetSlugs],
      ['networkSlugs', pin.networkSlugs],
      ['routeTypes', pin.routeTypes],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'Map-pin facets must not contain duplicates.',
        });
      }
    }
  });

export const publicPlaceSchema = z
  .object({
    placeSlug: publicIdentifierSchema,
    entitySlug: publicIdentifierSchema,
    name: z.string().trim().min(1).max(160),
    categorySlug: publicIdentifierSchema,
    entityStatus: z.enum(entityStatusValues),
    locationStatus: z.enum(locationStatusValues),
    addressLine: z.string().trim().min(1).max(500).nullable(),
    locality: z.string().trim().min(1).max(120).nullable(),
    region: z.string().trim().min(1).max(120).nullable(),
    postalCode: z.string().trim().min(1).max(32).nullable(),
    countryCode: countryCodeSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    websiteUrl: publicUrlSchema.nullable(),
    phone: z.string().trim().min(1).max(64).nullable().optional(),
    description: z.string().trim().min(1).max(5_000).nullable().optional(),
    openingHours: z.string().trim().min(1).max(2_000).nullable().optional(),
    amenities: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
    socialLinks: z.array(publicSocialLinkSchema).max(30).optional(),
    claims: z.array(publicAcceptanceClaimSchema).min(1).max(100),
    media: z.array(publicMediaSchema).max(100),
    provenance: z.array(publicProvenanceSchema).min(1).max(250),
  })
  .strict()
  .superRefine((place, context) => {
    if (place.claims.some((claim) => claim.locationSlug !== place.placeSlug)) {
      context.addIssue({
        code: 'custom',
        path: ['claims'],
        message: 'A public place can contain only claims for that location.',
      });
    }

    const amenities = place.amenities ?? [];
    if (new Set(amenities).size !== amenities.length) {
      context.addIssue({
        code: 'custom',
        path: ['amenities'],
        message: 'Public Place amenities must not contain duplicates.',
      });
    }

    const socialLinks = new Set<string>();
    for (const [index, link] of (place.socialLinks ?? []).entries()) {
      const key = `${link.platform}:${link.url}`;
      if (socialLinks.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['socialLinks', index],
          message: 'Public Place social links must not contain duplicates.',
        });
      }
      socialLinks.add(key);
    }
  });

export const publicOnlineServiceSchema = z
  .object({
    serviceSlug: publicIdentifierSchema,
    name: z.string().trim().min(1).max(160),
    categorySlug: publicIdentifierSchema,
    entityStatus: z.enum(entityStatusValues),
    countryCode: countryCodeSchema.nullable(),
    websiteUrl: publicHttpsUrlSchema,
    claims: z.array(publicAcceptanceClaimSchema).min(1).max(100),
    media: z.array(publicMediaSchema).max(100),
    provenance: z.array(publicProvenanceSchema).min(1).max(250),
  })
  .strict()
  .superRefine((service, context) => {
    if (
      service.claims.some(
        (claim) =>
          claim.entitySlug !== service.serviceSlug ||
          claim.locationSlug !== null ||
          claim.claimScope !== 'online_service',
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['claims'],
        message: 'Online-service exports may contain only that service’s online claims.',
      });
    }
  });

const publicGeoJsonPropertiesSchema = z
  .object({
    placeSlug: publicIdentifierSchema,
    name: z.string().trim().min(1).max(160),
    categorySlug: publicIdentifierSchema,
    countryCode: countryCodeSchema,
    locality: z.string().trim().min(1).max(120).nullable(),
    status: publicPinStatusSchema,
    assetSlugs: z.array(publicIdentifierSchema).min(1).max(100),
    networkSlugs: z.array(publicIdentifierSchema).min(1).max(100),
    routeTypes: z.array(z.enum(routeTypeValues)).min(1).max(routeTypeValues.length),
    lastConfirmedAt: timestampSchema,
    thumbnail: publicMediaSchema.nullable(),
  })
  .strict();

export const publicGeoJsonFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    geometry: z
      .object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      })
      .strict(),
    properties: publicGeoJsonPropertiesSchema,
  })
  .strict();

export const publicUpdateSchema = z
  .object({
    updateKey: publicIdentifierSchema,
    updateType: z.enum([
      'newly_confirmed',
      'reconfirmed',
      'payment_method_changed',
      'marked_stale',
      'ended',
      'new_online_service',
    ]),
    subjectType: z.enum(['place', 'online_service']),
    subjectSlug: publicIdentifierSchema,
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2_000),
    effectiveAt: timestampSchema,
  })
  .strict();

const publicCountBreakdownSchema = z
  .object({
    key: publicIdentifierSchema,
    count: z.number().int().nonnegative(),
  })
  .strict();

export const publicStatsSchema = z
  .object({
    confirmedPhysicalPlaces: z.number().int().nonnegative(),
    confirmedOnlineServices: z.number().int().nonnegative(),
    countries: z.number().int().nonnegative(),
    cities: z.number().int().nonnegative(),
    staleRecords: z.number().int().nonnegative(),
    endedRecords: z.number().int().nonnegative(),
    directWalletClaims: z.number().int().nonnegative(),
    processorCheckoutClaims: z.number().int().nonnegative(),
    howToPayCoverage: z.number().min(0).max(1),
    networkSpecifiedRate: z.number().min(0).max(1),
    evidenceBackedRate: z.number().min(0).max(1),
    reconfirmedWithin90Days: z.number().min(0).max(1),
    reconfirmedWithin180Days: z.number().min(0).max(1),
    staleRate: z.number().min(0).max(1),
    topAssets: z.array(publicCountBreakdownSchema).max(100),
    topNetworks: z.array(publicCountBreakdownSchema).max(100),
  })
  .strict();

export const publicExportPaths = [
  '/data/locations-osm.json',
  '/data/acceptance-claims.json',
  '/data/place-pins.json',
  '/data/places.json',
  '/data/places.geojson',
  '/data/online-services.json',
  '/data/stats.json',
  '/data/updates.json',
  '/data/assets.json',
  '/data/networks.json',
  '/data/manifest.json',
  '/version.json',
] as const;
export type PublicExportPath = (typeof publicExportPaths)[number];

export const publicManifestFileEntrySchema = z
  .object({
    path: z.enum(publicExportPaths),
    mediaType: z.enum(['application/json', 'application/geo+json']),
    schemaVersion: z.string().trim().min(1).max(32),
    recordCount: z.number().int().nonnegative(),
    sha256: sha256Schema,
    licenses: z.array(publicIdentifierSchema).min(1).max(20),
  })
  .strict();

export const publicVersionSchema = z
  .object({
    projectId: z.literal('cryptopaymap'),
    siteName: z.literal('CryptoPayMap'),
    registryType: z.literal('crypto_payment_acceptance'),
    datasetVersion: z.string().trim().min(1).max(64),
    schemaVersion: z.string().trim().min(1).max(32),
    generatedAt: timestampSchema,
    canonicalOnly: z.literal(true),
    verificationMarker: z.literal('reviewed_public_records_only'),
  })
  .strict();

const recordsFileSchema = <T extends z.ZodType>(recordSchema: T) =>
  publicFileHeaderSchema.extend({ records: z.array(recordSchema) }).strict();

export const publicLocationsOsmFileSchema = recordsFileSchema(publicOsmLocationSchema);
export const publicAcceptanceClaimsFileSchema = recordsFileSchema(publicAcceptanceClaimSchema);
export const publicPlacePinsFileSchema = recordsFileSchema(publicPlacePinSchema);
export const publicPlacesFileSchema = recordsFileSchema(publicPlaceSchema);
export const publicPlacesGeoJsonFileSchema = publicFileHeaderSchema
  .extend({
    type: z.literal('FeatureCollection'),
    features: z.array(publicGeoJsonFeatureSchema),
  })
  .strict();
export const publicOnlineServicesFileSchema = recordsFileSchema(publicOnlineServiceSchema);
export const publicStatsFileSchema = publicFileHeaderSchema
  .extend({ stats: publicStatsSchema })
  .strict();
export const publicUpdatesFileSchema = recordsFileSchema(publicUpdateSchema);
export const publicAssetsFileSchema = recordsFileSchema(publicAssetRegistryRecordSchema);
export const publicNetworksFileSchema = recordsFileSchema(publicNetworkRegistryRecordSchema);
export const publicManifestFileSchema = publicFileHeaderSchema
  .extend({
    datasetVersion: z.string().trim().min(1).max(64),
    canonicalOnly: z.literal(true),
    files: z.array(publicManifestFileEntrySchema).min(1),
  })
  .strict();

export const publicExportSchemaByPath: Record<PublicExportPath, z.ZodType> = {
  '/data/locations-osm.json': publicLocationsOsmFileSchema,
  '/data/acceptance-claims.json': publicAcceptanceClaimsFileSchema,
  '/data/place-pins.json': publicPlacePinsFileSchema,
  '/data/places.json': publicPlacesFileSchema,
  '/data/places.geojson': publicPlacesGeoJsonFileSchema,
  '/data/online-services.json': publicOnlineServicesFileSchema,
  '/data/stats.json': publicStatsFileSchema,
  '/data/updates.json': publicUpdatesFileSchema,
  '/data/assets.json': publicAssetsFileSchema,
  '/data/networks.json': publicNetworksFileSchema,
  '/data/manifest.json': publicManifestFileSchema,
  '/version.json': publicVersionSchema,
};

export function parsePublicExport(path: PublicExportPath, value: unknown): unknown {
  return publicExportSchemaByPath[path].parse(value);
}
