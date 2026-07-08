import { z } from 'zod';

const nullableTrimmedString = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

const httpUrlSchema = z
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Use an HTTP or HTTPS URL.',
  );

const safeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted in legacy imports.');

function firstDefined<T>(values: readonly (T | null | undefined)[]): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function normalizeAmenityInput(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;

  let values: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      values = Array.isArray(parsed) ? parsed : trimmed.split(/\r?\n|,/).map((item) => item.trim());
    } catch {
      values = trimmed.split(/\r?\n|,/).map((item) => item.trim());
    }
  }

  if (!Array.isArray(values)) return values;
  const normalized: unknown[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    if (typeof item !== 'string') {
      normalized.push(item);
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized.length === 0 ? null : normalized;
}

const legacyAmenitiesInputSchema = z.preprocess(
  normalizeAmenityInput,
  z.array(z.string().trim().min(1).max(80)).max(100).nullable(),
);

const legacySocialValueTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        context.addIssue({
          code: 'custom',
          message: 'Legacy social URLs must use HTTP or HTTPS.',
        });
      }
    } catch {
      if (value.length > 120) {
        context.addIssue({
          code: 'custom',
          message: 'Legacy social handles must be 120 characters or fewer.',
        });
      }
    }
  });

const legacySocialValueSchema = legacySocialValueTextSchema.nullable().optional();

export const physicalPlaceReviewSocialLinkSchema = z
  .object({
    platform: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use a stable lowercase social platform key.'),
    url: httpUrlSchema.nullable(),
    handle: nullableTrimmedString(120),
  })
  .strict()
  .superRefine((link, context) => {
    if (link.url === null && link.handle === null) {
      context.addIssue({
        code: 'custom',
        message: 'A review social link requires a URL or handle.',
      });
    }
  });

const physicalPlaceReviewSocialLinkInputSchema = z
  .object({
    platform: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use a stable lowercase social platform key.'),
    url: httpUrlSchema.nullable().optional(),
    handle: nullableTrimmedString(120).optional(),
  })
  .strict()
  .superRefine((link, context) => {
    if ((link.url ?? null) === null && (link.handle ?? null) === null) {
      context.addIssue({
        code: 'custom',
        message: 'A review social link requires a URL or handle.',
      });
    }
  });

export type PhysicalPlaceReviewSocialLink = z.infer<typeof physicalPlaceReviewSocialLinkSchema>;

function legacySocialLink(
  platform: string,
  value: string | null | undefined,
): PhysicalPlaceReviewSocialLink | null {
  if (value === null || value === undefined) return null;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol)) {
      return { platform, url: value, handle: null };
    }
  } catch {
    // A non-URL legacy value is preserved as a review-only handle.
  }
  return { platform, url: null, handle: value };
}

function dedupeSocialLinks(
  links: readonly (PhysicalPlaceReviewSocialLink | null)[],
): PhysicalPlaceReviewSocialLink[] {
  const seen = new Set<string>();
  const result: PhysicalPlaceReviewSocialLink[] = [];
  for (const link of links) {
    if (link === null) continue;
    const parsed = physicalPlaceReviewSocialLinkSchema.parse(link);
    const key = `${parsed.platform}:${parsed.url ?? ''}:${parsed.handle ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed);
  }
  return result;
}

export const legacyOsmElementTypeValues = ['node', 'way', 'relation'] as const;
export const legacyOsmElementTypeSchema = z.enum(legacyOsmElementTypeValues);

export const legacyPaymentTagSchema = z.record(
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^payment:[a-z0-9:_-]+$/, 'Legacy payment keys must use the payment:* namespace.'),
  z.string().trim().min(1).max(160),
);

const legacyPhysicalPlaceRecordInputSchema = z
  .object({
    legacyId: safeTextSchema(256),
    legacyPath: z
      .string()
      .trim()
      .regex(/^\/[^?#]*$/, 'Use a legacy path without a query or fragment.')
      .nullable(),
    name: safeTextSchema(200),
    addressLine: nullableTrimmedString(500),
    locality: nullableTrimmedString(120),
    region: nullableTrimmedString(120),
    postalCode: nullableTrimmedString(32),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{2}$/.test(value), 'Use an ISO 3166-1 alpha-2 country code.'),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    category: nullableTrimmedString(120),
    websiteUrl: httpUrlSchema.nullable().optional(),
    website: httpUrlSchema.nullable().optional(),
    socialWebsite: httpUrlSchema.nullable().optional(),
    social_website: httpUrlSchema.nullable().optional(),
    phone: nullableTrimmedString(64).optional(),
    description: nullableTrimmedString(5_000).optional(),
    about: nullableTrimmedString(5_000).optional(),
    aboutShort: nullableTrimmedString(5_000).optional(),
    about_short: nullableTrimmedString(5_000).optional(),
    openingHours: nullableTrimmedString(2_000).optional(),
    opening_hours: nullableTrimmedString(2_000).optional(),
    amenities: legacyAmenitiesInputSchema.optional(),
    socialLinks: z.array(physicalPlaceReviewSocialLinkInputSchema).max(30).optional(),
    twitter: legacySocialValueSchema,
    socialTwitter: legacySocialValueSchema,
    social_twitter: legacySocialValueSchema,
    instagram: legacySocialValueSchema,
    socialInstagram: legacySocialValueSchema,
    social_instagram: legacySocialValueSchema,
    facebook: legacySocialValueSchema,
    socialFacebook: legacySocialValueSchema,
    social_facebook: legacySocialValueSchema,
    osmType: legacyOsmElementTypeSchema.nullable(),
    osmId: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]*$/, 'OSM IDs must be positive decimal strings.')
      .nullable(),
    paymentTags: legacyPaymentTagSchema,
    observedAt: z.iso.datetime({ offset: true }).nullable(),
    sourceUrl: httpUrlSchema.nullable(),
    legacyVerificationLabel: nullableTrimmedString(120),
  })
  .strict()
  .superRefine((record, context) => {
    if ((record.osmType === null) !== (record.osmId === null)) {
      context.addIssue({
        code: 'custom',
        path: ['osmId'],
        message: 'OSM type and ID must either both be present or both be absent.',
      });
    }
  });

export const legacyPhysicalPlaceRecordSchema = legacyPhysicalPlaceRecordInputSchema.transform(
  (record) => ({
    legacyId: record.legacyId,
    legacyPath: record.legacyPath,
    name: record.name,
    addressLine: record.addressLine,
    locality: record.locality,
    region: record.region,
    postalCode: record.postalCode,
    countryCode: record.countryCode,
    latitude: record.latitude,
    longitude: record.longitude,
    category: record.category,
    websiteUrl: firstDefined([
      record.websiteUrl,
      record.website,
      record.socialWebsite,
      record.social_website,
    ]),
    phone: record.phone ?? null,
    description: firstDefined([
      record.description,
      record.about,
      record.aboutShort,
      record.about_short,
    ]),
    openingHours: firstDefined([record.openingHours, record.opening_hours]),
    amenities: record.amenities ?? null,
    socialLinks: dedupeSocialLinks([
      ...(record.socialLinks ?? []).map((link) => ({
        platform: link.platform,
        url: link.url ?? null,
        handle: link.handle ?? null,
      })),
      legacySocialLink('x', record.twitter),
      legacySocialLink('x', record.socialTwitter),
      legacySocialLink('x', record.social_twitter),
      legacySocialLink('instagram', record.instagram),
      legacySocialLink('instagram', record.socialInstagram),
      legacySocialLink('instagram', record.social_instagram),
      legacySocialLink('facebook', record.facebook),
      legacySocialLink('facebook', record.socialFacebook),
      legacySocialLink('facebook', record.social_facebook),
    ]),
    osmType: record.osmType,
    osmId: record.osmId,
    paymentTags: record.paymentTags,
    observedAt: record.observedAt,
    sourceUrl: record.sourceUrl,
    legacyVerificationLabel: record.legacyVerificationLabel,
  }),
);

export const physicalPlaceImportEnvelopeSchema = z
  .object({
    sourceId: z.uuid(),
    licenseId: z.uuid().nullable(),
    importBatchId: z.uuid(),
    fetchedAt: z.iso.datetime({ offset: true }),
    importerVersion: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/, 'Use a semantic importer version.'),
    records: z.array(z.unknown()).min(1).max(10_000),
  })
  .strict();

export type LegacyPhysicalPlaceRecord = z.infer<typeof legacyPhysicalPlaceRecordSchema>;
export type PhysicalPlaceImportEnvelope = z.infer<typeof physicalPlaceImportEnvelopeSchema>;
