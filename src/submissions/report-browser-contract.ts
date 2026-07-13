import { z } from 'zod';
import {
  existingReportTargetTypeSchema,
  paymentReportContextSchema,
  paymentReportResultSchema,
  problemReportTypeSchema,
  reportSubmissionIntakeSchema,
  type PaymentReportReviewProjection,
} from './report-contract';

const optionalTrimmed = (value: string): string | null => {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

const optionalSlug = (value: string): string | null => {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 ? null : normalized;
};

export const reportBrowserFormValuesSchema = z
  .object({
    submissionType: z.enum(['payment_report', 'problem_report']),
    targetType: existingReportTargetTypeSchema,
    targetId: z.string().max(64),
    evidenceUrl: z.string().max(2_048),
    evidenceSummary: z.string().max(1_000),
    contactEmail: z.string().max(320),
    contactAllowed: z.boolean(),
    privacyNoticeAccepted: z.boolean(),
    submissionTermsAccepted: z.boolean(),

    paymentResult: paymentReportResultSchema,
    paymentDate: z.string().max(10),
    assetSlug: z.string().max(64),
    networkSlug: z.string().max(64),
    routeType: z.enum(['', 'direct_wallet', 'processor_checkout']),
    paymentMethod: z.enum([
      '',
      'onchain',
      'lightning_invoice',
      'lightning_nfc',
      'wallet_qr',
      'processor_checkout',
      'pos_terminal',
      'invoice',
      'payment_link',
    ]),
    processorName: z.string().max(160),
    processorWebsiteUrl: z.string().max(2_048),
    paymentContext: z.union([z.literal(''), paymentReportContextSchema]),
    observedSteps: z.string().max(2_000),
    privateTransactionUrl: z.string().max(2_048),
    paymentNotes: z.string().max(2_000),

    problemType: problemReportTypeSchema,
    problemObservedAt: z.string().max(10),
    explanation: z.string().max(5_000),
    correctionValue: z.string().max(5_000),
    addressLine: z.string().max(500),
    locality: z.string().max(120),
    region: z.string().max(120),
    postalCode: z.string().max(32),
    countryCode: z.string().max(2),
    websiteUrl: z.string().max(2_048),
    phone: z.string().max(64),
    description: z.string().max(5_000),
    openingHours: z.string().max(2_000),
    duplicateTargetType: z.union([z.literal(''), existingReportTargetTypeSchema]),
    duplicateTargetId: z.string().max(64),
    privateEvidenceUrl: z.string().max(2_048),
  })
  .strict();

export type ReportBrowserFormValues = z.infer<typeof reportBrowserFormValuesSchema>;
export type ReportSubmissionIntake = z.infer<typeof reportSubmissionIntakeSchema>;

export function emptyReportBrowserFormValues(
  today: string,
  targetType: ReportBrowserFormValues['targetType'] = 'entity',
  targetId = '',
): ReportBrowserFormValues {
  return {
    submissionType: 'payment_report',
    targetType,
    targetId,
    evidenceUrl: '',
    evidenceSummary: '',
    contactEmail: '',
    contactAllowed: false,
    privacyNoticeAccepted: false,
    submissionTermsAccepted: false,

    paymentResult: 'successful',
    paymentDate: today,
    assetSlug: '',
    networkSlug: '',
    routeType: '',
    paymentMethod: '',
    processorName: '',
    processorWebsiteUrl: '',
    paymentContext: '',
    observedSteps: '',
    privateTransactionUrl: '',
    paymentNotes: '',

    problemType: 'no_longer_accepts_crypto',
    problemObservedAt: today,
    explanation: '',
    correctionValue: '',
    addressLine: '',
    locality: '',
    region: '',
    postalCode: '',
    countryCode: '',
    websiteUrl: '',
    phone: '',
    description: '',
    openingHours: '',
    duplicateTargetType: '',
    duplicateTargetId: '',
    privateEvidenceUrl: '',
  };
}

function commonEnvelope(values: ReportBrowserFormValues) {
  const evidenceUrl = optionalTrimmed(values.evidenceUrl);
  const contactEmail = optionalTrimmed(values.contactEmail);
  return {
    schemaVersion: 'submission-common-v1' as const,
    targetType: values.targetType,
    targetId: values.targetId.trim(),
    relationship: null,
    contact:
      contactEmail === null
        ? null
        : {
            email: contactEmail,
            contactAllowed: values.contactAllowed,
          },
    evidenceLinks:
      evidenceUrl === null
        ? []
        : [
            {
              url: evidenceUrl,
              observedAt: null,
              summary: optionalTrimmed(values.evidenceSummary),
            },
          ],
    acknowledgements: {
      privacyNoticeAccepted: values.privacyNoticeAccepted,
      submissionTermsAccepted: values.submissionTermsAccepted,
    },
  };
}

function paymentDetails(values: ReportBrowserFormValues): PaymentReportReviewProjection['payment'] {
  const routeType = values.routeType === '' ? null : values.routeType;
  const processorName = optionalTrimmed(values.processorName);
  return {
    assetSlug: optionalSlug(values.assetSlug),
    networkSlug: optionalSlug(values.networkSlug),
    routeType,
    paymentMethod: values.paymentMethod === '' ? null : values.paymentMethod,
    processor:
      routeType === 'processor_checkout' && processorName !== null
        ? {
            name: processorName,
            websiteUrl: optionalTrimmed(values.processorWebsiteUrl),
          }
        : null,
    context: values.paymentContext === '' ? null : values.paymentContext,
    observedSteps: optionalTrimmed(values.observedSteps),
  };
}

function problemCorrection(values: ReportBrowserFormValues): unknown {
  if (values.problemType === 'wrong_asset') {
    const assetSlug = optionalSlug(values.correctionValue);
    return assetSlug === null ? null : { kind: 'asset', assetSlug };
  }
  if (values.problemType === 'wrong_network') {
    const networkSlug = optionalSlug(values.correctionValue);
    return networkSlug === null ? null : { kind: 'network', networkSlug };
  }
  if (values.problemType === 'wrong_instructions') {
    const howToPay = optionalTrimmed(values.correctionValue);
    return howToPay === null ? null : { kind: 'instructions', howToPay };
  }
  if (values.problemType === 'wrong_address') {
    const correction = {
      kind: 'location_profile' as const,
      addressLine: optionalTrimmed(values.addressLine),
      locality: optionalTrimmed(values.locality),
      region: optionalTrimmed(values.region),
      postalCode: optionalTrimmed(values.postalCode),
      countryCode: optionalTrimmed(values.countryCode)?.toUpperCase() ?? null,
      latitude: null,
      longitude: null,
      websiteUrl: optionalTrimmed(values.websiteUrl),
      phone: optionalTrimmed(values.phone),
      description: optionalTrimmed(values.description),
      openingHours: optionalTrimmed(values.openingHours),
      amenities: null,
      socialLinks: null,
    };
    return Object.values(correction).slice(1).every((value) => value === null) ? null : correction;
  }
  if (values.problemType === 'other') {
    const description = optionalTrimmed(values.correctionValue);
    return description === null ? null : { kind: 'other', description };
  }
  return null;
}

export function buildReportSubmissionIntakeFromBrowserForm(
  rawValues: ReportBrowserFormValues,
): ReportSubmissionIntake {
  const values = reportBrowserFormValuesSchema.parse(rawValues);
  const envelope = commonEnvelope(values);

  if (values.submissionType === 'payment_report') {
    return reportSubmissionIntakeSchema.parse({
      ...envelope,
      submissionType: 'payment_report',
      originalPayload: {
        schemaVersion: 'payment-report-v1',
        result: values.paymentResult,
        paymentDate: values.paymentDate,
        payment: paymentDetails(values),
        privateTransactionUrl: optionalTrimmed(values.privateTransactionUrl),
        notes: optionalTrimmed(values.paymentNotes),
      },
    });
  }

  const duplicateTarget =
    values.problemType === 'duplicate' &&
    values.duplicateTargetType !== '' &&
    optionalTrimmed(values.duplicateTargetId) !== null
      ? {
          targetType: values.duplicateTargetType,
          targetId: values.duplicateTargetId.trim(),
        }
      : null;

  return reportSubmissionIntakeSchema.parse({
    ...envelope,
    submissionType: 'problem_report',
    originalPayload: {
      schemaVersion: 'problem-report-v1',
      reportType: values.problemType,
      observedAt: values.problemObservedAt,
      explanation: values.explanation.trim(),
      proposedCorrection: problemCorrection(values),
      duplicateTarget,
      privateEvidenceUrl: optionalTrimmed(values.privateEvidenceUrl),
    },
  });
}

export function browserReportValidationMessages(error: unknown): string[] {
  if (!(error instanceof z.ZodError)) return ['Check the form and try again.'];
  return [...new Set(error.issues.map((issue) => issue.message))].slice(0, 6);
}
