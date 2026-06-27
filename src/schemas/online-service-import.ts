import { z } from 'zod';
import { acceptanceScopeValues, routeTypeValues } from '../db/schema';

const nullableTrimmedString = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const safeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted in legacy imports.');
const httpUrlSchema = z
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Use an HTTP or HTTPS URL.',
  );
const sourceLabelSchema = z.string().trim().min(1).max(160);

export const legacyOnlineRecordTypeValues = [
  'online_service',
  'payment_processor',
  'payment_program',
  'platform',
  'crypto_card',
  'gift_card',
  'bill_payment',
  'exchange',
  'atm',
] as const;
export const importableOnlineCandidateTypeValues = [
  'online_service',
  'payment_processor',
  'payment_program',
  'platform',
] as const;

export const legacyOnlineRecordTypeSchema = z.enum(legacyOnlineRecordTypeValues);
export const legacyOnlineAcceptanceScopeSchema = z.enum(acceptanceScopeValues);
export const legacyOnlineRouteTypeSchema = z.enum(routeTypeValues);

export const legacyOnlineServiceRecordSchema = z
  .object({
    legacyId: safeTextSchema(256),
    legacyPath: z
      .string()
      .trim()
      .regex(/^\/[^?#]*$/, 'Use a legacy path without a query or fragment.')
      .nullable(),
    recordType: legacyOnlineRecordTypeSchema,
    name: safeTextSchema(200),
    websiteUrl: httpUrlSchema.nullable(),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{2}$/.test(value), 'Use an ISO 3166-1 alpha-2 country code.')
      .nullable(),
    category: nullableTrimmedString(120),
    acceptanceScope: legacyOnlineAcceptanceScopeSchema.nullable(),
    routeType: legacyOnlineRouteTypeSchema.nullable(),
    processorName: nullableTrimmedString(200),
    processorUrl: httpUrlSchema.nullable(),
    assetLabels: z.array(sourceLabelSchema).max(100),
    networkLabels: z.array(sourceLabelSchema).max(100),
    paymentMethodLabels: z.array(sourceLabelSchema).max(100),
    scopeNotes: nullableTrimmedString(2_000),
    howToPay: nullableTrimmedString(3_000),
    evidenceUrls: z.array(httpUrlSchema).max(20),
    observedAt: z.iso.datetime({ offset: true }).nullable(),
    sourceUrl: httpUrlSchema.nullable(),
    legacyVerificationLabel: nullableTrimmedString(120),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      record.routeType === 'direct_wallet' &&
      (record.processorName !== null || record.processorUrl !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['processorName'],
        message: 'Direct-wallet source rows cannot name a checkout processor.',
      });
    }
  });

export const onlineServiceImportEnvelopeSchema = z
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

export type LegacyOnlineServiceRecord = z.infer<typeof legacyOnlineServiceRecordSchema>;
export type OnlineServiceImportEnvelope = z.infer<typeof onlineServiceImportEnvelopeSchema>;
export type ImportableOnlineCandidateType = (typeof importableOnlineCandidateTypeValues)[number];
