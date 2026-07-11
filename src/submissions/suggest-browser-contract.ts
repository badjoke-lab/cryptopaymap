import { z } from 'zod';
import { submissionRelationshipSchema } from './contract';
import {
  suggestionKindSchema,
  suggestSubmissionIntakeSchema,
  type SuggestSubmissionIntake,
} from './suggest-contract';

const optionalTrimmed = (value: string): string | null => {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

const optionalSlug = (value: string): string | null => {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 ? null : normalized;
};

export const suggestBrowserFormValuesSchema = z
  .object({
    suggestionKind: suggestionKindSchema,
    name: z.string().max(160),
    websiteUrl: z.string().max(2_048),
    countryCode: z.string().max(2),
    addressLine: z.string().max(500),
    locality: z.string().max(120),
    region: z.string().max(120),
    postalCode: z.string().max(32),
    categorySlug: z.string().max(64),
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
    howToPay: z.string().max(1_000),
    restrictions: z.string().max(1_000),
    observedAt: z.string().max(10),
    evidenceUrl: z.string().max(2_048),
    evidenceSummary: z.string().max(1_000),
    relationship: submissionRelationshipSchema,
    contactEmail: z.string().max(320),
    contactAllowed: z.boolean(),
    privacyNoticeAccepted: z.boolean(),
    submissionTermsAccepted: z.boolean(),
  })
  .strict();

export type SuggestBrowserFormValues = z.infer<typeof suggestBrowserFormValuesSchema>;

export function emptySuggestBrowserFormValues(today: string): SuggestBrowserFormValues {
  return {
    suggestionKind: 'physical_place',
    name: '',
    websiteUrl: '',
    countryCode: '',
    addressLine: '',
    locality: '',
    region: '',
    postalCode: '',
    categorySlug: '',
    assetSlug: '',
    networkSlug: '',
    routeType: '',
    paymentMethod: '',
    processorName: '',
    processorWebsiteUrl: '',
    howToPay: '',
    restrictions: '',
    observedAt: today,
    evidenceUrl: '',
    evidenceSummary: '',
    relationship: 'customer',
    contactEmail: '',
    contactAllowed: false,
    privacyNoticeAccepted: false,
    submissionTermsAccepted: false,
  };
}

export function buildSuggestSubmissionIntakeFromBrowserForm(
  rawValues: SuggestBrowserFormValues,
): SuggestSubmissionIntake {
  const values = suggestBrowserFormValuesSchema.parse(rawValues);
  const websiteUrl = optionalTrimmed(values.websiteUrl);
  const countryCode = optionalTrimmed(values.countryCode)?.toUpperCase() ?? null;
  const routeType = values.routeType === '' ? null : values.routeType;
  const paymentMethod = values.paymentMethod === '' ? null : values.paymentMethod;
  const processorName = optionalTrimmed(values.processorName);
  const processor =
    routeType === 'processor_checkout' && processorName !== null
      ? {
          name: processorName,
          websiteUrl: optionalTrimmed(values.processorWebsiteUrl),
        }
      : null;
  const evidenceUrl = optionalTrimmed(values.evidenceUrl);
  const contactEmail = optionalTrimmed(values.contactEmail);

  const intake = {
    schemaVersion: 'submission-common-v1',
    submissionType: 'suggest',
    targetType: null,
    targetId: null,
    relationship: values.relationship,
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
    originalPayload: {
      schemaVersion: 'suggest-v1',
      suggestionKind: values.suggestionKind,
      entity: {
        name: values.name.trim(),
        legalName: null,
        websiteUrl,
        countryCode,
      },
      place:
        values.suggestionKind === 'physical_place'
          ? {
              branchName: null,
              addressLine: optionalTrimmed(values.addressLine),
              locality: optionalTrimmed(values.locality),
              region: optionalTrimmed(values.region),
              postalCode: optionalTrimmed(values.postalCode),
              countryCode: values.countryCode.trim().toUpperCase(),
              latitude: null,
              longitude: null,
              websiteUrl,
              phone: null,
              description: null,
              openingHours: null,
              amenities: [],
              socialLinks: [],
            }
          : null,
      categories:
        optionalSlug(values.categorySlug) === null
          ? []
          : [{ slug: optionalSlug(values.categorySlug) as string, isPrimary: true }],
      paymentProposals: [
        {
          assetSlug: optionalSlug(values.assetSlug),
          networkSlug: optionalSlug(values.networkSlug),
          routeType,
          paymentMethod,
          processor,
          contractAddress: null,
          howToPay: optionalTrimmed(values.howToPay),
          restrictions: optionalTrimmed(values.restrictions),
          isPrimary: true,
        },
      ],
      observedAt: values.observedAt,
    },
    acknowledgements: {
      privacyNoticeAccepted: values.privacyNoticeAccepted,
      submissionTermsAccepted: values.submissionTermsAccepted,
    },
  };

  return suggestSubmissionIntakeSchema.parse(intake);
}

export function browserSuggestValidationMessages(error: unknown): string[] {
  if (!(error instanceof z.ZodError)) return ['Check the form and try again.'];
  const messages = error.issues.map((issue) => issue.message);
  return [...new Set(messages)].slice(0, 6);
}
