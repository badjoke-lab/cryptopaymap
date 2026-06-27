import { z } from 'zod';

const nullableTrimmedString = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable();

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

export const legacyPhysicalPlaceRecordSchema = z
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
    websiteUrl: httpUrlSchema.nullable(),
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
