import { z } from 'zod';
import { routeTypeValues } from '../db/schema/enums';
import { paymentMethodValues } from '../db/schema/payment-registries';
import { canonicalLocationSocialLinkSchema } from '../schemas/canonical-identity';
import {
  countryCodeSchema,
  dateOnlySchema,
  httpsUrlSchema,
  publicSlugSchema,
} from '../schemas/core';
import {
  commonSubmissionIntakeSchema,
  submissionEvidenceUrlSchema,
  type CommonSubmissionIntake,
} from './contract';

const boundedPlainText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const existingReportTargetTypeValues = ['entity', 'location', 'claim'] as const;
export const existingReportTargetTypeSchema = z.enum(existingReportTargetTypeValues);

export const paymentReportResultValues = ['successful', 'failed'] as const;
export const paymentReportResultSchema = z.enum(paymentReportResultValues);

export const paymentReportContextValues = [
  'terminal',
  'qr_code',
  'invoice',
  'payment_link',
  'hosted_checkout',
  'other',
] as const;
export const paymentReportContextSchema = z.enum(paymentReportContextValues);

export const paymentReportProcessorSchema = z
  .object({
    name: boundedPlainText(160),
    websiteUrl: httpsUrlSchema.nullable(),
  })
  .strict();

export const paymentReportDetailsSchema = z
  .object({
    assetSlug: publicSlugSchema.nullable(),
    networkSlug: publicSlugSchema.nullable(),
    routeType: z.enum(routeTypeValues).nullable(),
    paymentMethod: z.enum(paymentMethodValues).nullable(),
    processor: paymentReportProcessorSchema.nullable(),
    context: paymentReportContextSchema.nullable(),
    observedSteps: boundedPlainText(2_000).nullable(),
  })
  .strict()
  .superRefine((details, context) => {
    if (
      details.assetSlug === null &&
      details.networkSlug === null &&
      details.routeType === null &&
      details.paymentMethod === null &&
      details.processor === null &&
      details.context === null &&
      details.observedSteps === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Payment reports require at least one concrete payment detail.',
      });
    }
    if (details.routeType === 'processor_checkout' && details.processor === null) {
      context.addIssue({
        code: 'custom',
        path: ['processor'],
        message: 'Known processor-checkout reports require processor information.',
      });
    }
    if (details.routeType === 'direct_wallet' && details.processor !== null) {
      context.addIssue({
        code: 'custom',
        path: ['processor'],
        message: 'Direct-wallet reports must not attach processor information.',
      });
    }
  });

export const paymentReportOriginalPayloadSchema = z
  .object({
    schemaVersion: z.literal('payment-report-v1'),
    result: paymentReportResultSchema,
    paymentDate: dateOnlySchema,
    payment: paymentReportDetailsSchema,
    privateTransactionUrl: submissionEvidenceUrlSchema.nullable(),
    notes: boundedPlainText(2_000).nullable(),
  })
  .strict();

export const paymentReportSubmissionIntakeSchema = commonSubmissionIntakeSchema
  .safeExtend({
    submissionType: z.literal('payment_report'),
    targetType: existingReportTargetTypeSchema,
    targetId: z.uuid(),
    relationship: z.null(),
    originalPayload: paymentReportOriginalPayloadSchema,
  })
  .strict();

export const problemReportTypeValues = [
  'no_longer_accepts_crypto',
  'business_closed',
  'payment_failed',
  'wrong_asset',
  'wrong_network',
  'wrong_instructions',
  'wrong_address',
  'duplicate',
  'unauthorized_image',
  'privacy_issue',
  'other',
] as const;
export const problemReportTypeSchema = z.enum(problemReportTypeValues);

export const problemReportDuplicateTargetSchema = z
  .object({
    targetType: existingReportTargetTypeSchema,
    targetId: z.uuid(),
  })
  .strict();

export const problemLocationProfileCorrectionSchema = z
  .object({
    kind: z.literal('location_profile'),
    addressLine: boundedPlainText(500).nullable(),
    locality: boundedPlainText(120).nullable(),
    region: boundedPlainText(120).nullable(),
    postalCode: boundedPlainText(32).nullable(),
    countryCode: countryCodeSchema.nullable(),
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    websiteUrl: httpsUrlSchema.nullable(),
    phone: boundedPlainText(64).nullable(),
    description: boundedPlainText(5_000).nullable(),
    openingHours: boundedPlainText(2_000).nullable(),
    amenities: z
      .array(boundedPlainText(80))
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
    const proposedValues = [
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
      correction.amenities,
      correction.socialLinks,
    ];
    if (proposedValues.every((value) => value === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Location profile corrections require at least one proposed field.',
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

export const problemReportCorrectionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('asset'),
      assetSlug: publicSlugSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('network'),
      networkSlug: publicSlugSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('instructions'),
      howToPay: boundedPlainText(2_000),
    })
    .strict(),
  problemLocationProfileCorrectionSchema,
  z
    .object({
      kind: z.literal('other'),
      description: boundedPlainText(5_000),
    })
    .strict(),
]);

export const problemReportOriginalPayloadSchema = z
  .object({
    schemaVersion: z.literal('problem-report-v1'),
    reportType: problemReportTypeSchema,
    observedAt: dateOnlySchema,
    explanation: boundedPlainText(5_000),
    proposedCorrection: problemReportCorrectionSchema.nullable(),
    duplicateTarget: problemReportDuplicateTargetSchema.nullable(),
    privateEvidenceUrl: submissionEvidenceUrlSchema.nullable(),
  })
  .strict()
  .superRefine((payload, context) => {
    const allowedCorrectionKinds: Partial<
      Record<z.infer<typeof problemReportTypeSchema>, readonly string[]>
    > = {
      wrong_asset: ['asset'],
      wrong_network: ['network'],
      wrong_instructions: ['instructions'],
      wrong_address: ['location_profile'],
      other: ['location_profile', 'other'],
    };
    const allowedKinds = allowedCorrectionKinds[payload.reportType] ?? [];
    if (
      payload.proposedCorrection !== null &&
      !allowedKinds.includes(payload.proposedCorrection.kind)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['proposedCorrection'],
        message: 'The proposed correction does not match the selected problem report type.',
      });
    }
    if (payload.reportType !== 'duplicate' && payload.duplicateTarget !== null) {
      context.addIssue({
        code: 'custom',
        path: ['duplicateTarget'],
        message: 'Duplicate target information is only accepted for duplicate reports.',
      });
    }
  });

export const problemReportSubmissionIntakeSchema = commonSubmissionIntakeSchema
  .safeExtend({
    submissionType: z.literal('problem_report'),
    targetType: existingReportTargetTypeSchema,
    targetId: z.uuid(),
    relationship: z.null(),
    originalPayload: problemReportOriginalPayloadSchema,
  })
  .strict()
  .superRefine((intake, context) => {
    const duplicateTarget = intake.originalPayload.duplicateTarget;
    if (
      duplicateTarget !== null &&
      duplicateTarget.targetType === intake.targetType &&
      duplicateTarget.targetId === intake.targetId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['originalPayload', 'duplicateTarget'],
        message: 'A duplicate report must not point to the same target twice.',
      });
    }
  });

export const reportSubmissionIntakeSchema = z.discriminatedUnion('submissionType', [
  paymentReportSubmissionIntakeSchema,
  problemReportSubmissionIntakeSchema,
]);

export interface PaymentReportReviewProjection {
  reportKind: 'payment_report';
  targetType: z.infer<typeof existingReportTargetTypeSchema>;
  targetId: string;
  result: z.infer<typeof paymentReportResultSchema>;
  paymentDate: string;
  payment: z.infer<typeof paymentReportDetailsSchema>;
  notes: string | null;
  evidenceLinks: CommonSubmissionIntake['evidenceLinks'];
  restrictedEvidence: Readonly<{ privateTransactionUrlPresent: boolean }>;
}

export interface ProblemReportReviewProjection {
  reportKind: 'problem_report';
  targetType: z.infer<typeof existingReportTargetTypeSchema>;
  targetId: string;
  reportType: z.infer<typeof problemReportTypeSchema>;
  observedAt: string;
  explanation: string;
  proposedCorrection: z.infer<typeof problemReportCorrectionSchema> | null;
  duplicateTarget: z.infer<typeof problemReportDuplicateTargetSchema> | null;
  evidenceLinks: CommonSubmissionIntake['evidenceLinks'];
  restrictedEvidence: Readonly<{ privateEvidenceUrlPresent: boolean }>;
}

export type PaymentReportSubmissionIntake = z.infer<typeof paymentReportSubmissionIntakeSchema>;
export type ProblemReportSubmissionIntake = z.infer<typeof problemReportSubmissionIntakeSchema>;
export type ReportSubmissionIntake = z.infer<typeof reportSubmissionIntakeSchema>;
export type ReportReviewProjection = PaymentReportReviewProjection | ProblemReportReviewProjection;

export function normalizeParsedPaymentReportSubmissionIntake(
  intake: PaymentReportSubmissionIntake,
): PaymentReportReviewProjection {
  const payload = intake.originalPayload;
  return {
    reportKind: 'payment_report',
    targetType: intake.targetType,
    targetId: intake.targetId,
    result: payload.result,
    paymentDate: payload.paymentDate,
    payment: payload.payment,
    notes: payload.notes,
    evidenceLinks: intake.evidenceLinks,
    restrictedEvidence: {
      privateTransactionUrlPresent: payload.privateTransactionUrl !== null,
    },
  };
}

export function normalizePaymentReportSubmissionIntake(
  raw: unknown,
): PaymentReportReviewProjection {
  return normalizeParsedPaymentReportSubmissionIntake(
    paymentReportSubmissionIntakeSchema.parse(raw),
  );
}

export function normalizeParsedProblemReportSubmissionIntake(
  intake: ProblemReportSubmissionIntake,
): ProblemReportReviewProjection {
  const payload = intake.originalPayload;
  return {
    reportKind: 'problem_report',
    targetType: intake.targetType,
    targetId: intake.targetId,
    reportType: payload.reportType,
    observedAt: payload.observedAt,
    explanation: payload.explanation,
    proposedCorrection: payload.proposedCorrection,
    duplicateTarget: payload.duplicateTarget,
    evidenceLinks: intake.evidenceLinks,
    restrictedEvidence: {
      privateEvidenceUrlPresent: payload.privateEvidenceUrl !== null,
    },
  };
}

export function normalizeProblemReportSubmissionIntake(
  raw: unknown,
): ProblemReportReviewProjection {
  return normalizeParsedProblemReportSubmissionIntake(
    problemReportSubmissionIntakeSchema.parse(raw),
  );
}

export function normalizeReportSubmissionIntake(raw: unknown): ReportReviewProjection {
  const intake = reportSubmissionIntakeSchema.parse(raw);
  return intake.submissionType === 'payment_report'
    ? normalizeParsedPaymentReportSubmissionIntake(intake)
    : normalizeParsedProblemReportSubmissionIntake(intake);
}
