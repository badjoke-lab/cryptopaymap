import { z } from 'zod';
import {
  evidenceClassValues,
  evidenceKindValues,
  evidenceOriginRoleValues,
  evidencePolarityValues,
  evidenceReviewStatusValues,
  evidenceSourceTypeValues,
  evidenceVisibilityValues,
} from '../db/schema';

export const evidenceKindSchema = z.enum(evidenceKindValues);
export const evidenceClassSchema = z.enum(evidenceClassValues);
export const evidenceReviewStatusSchema = z.enum(evidenceReviewStatusValues);
export const evidenceVisibilitySchema = z.enum(evidenceVisibilityValues);
export const evidencePolaritySchema = z.enum(evidencePolarityValues);
export const evidenceOriginRoleSchema = z.enum(evidenceOriginRoleValues);
export const evidenceSourceTypeSchema = z.enum(evidenceSourceTypeValues);

const nullableUuidSchema = z.uuid().nullable();
const nullableTimestampSchema = z.iso.datetime({ offset: true }).nullable();
const nullableWebUrlSchema = z
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Use an HTTP or HTTPS URL.',
  )
  .nullable();

const classAKinds = new Set<(typeof evidenceKindValues)[number]>([
  'live_checkout',
  'official_payment_page',
  'verified_representative',
  'payment_proof',
]);
const classBKinds = new Set<(typeof evidenceKindValues)[number]>([
  'official_social',
  'processor_case_study',
  'dated_osm_observation',
  'independent_user_report',
]);
const classCKinds = new Set<(typeof evidenceKindValues)[number]>([
  'directory_listing',
  'undated_osm_tag',
  'article',
  'search_snippet',
  'platform_capability',
  'other',
]);

export const evidenceInputSchema = z
  .object({
    claimId: nullableUuidSchema,
    submissionId: nullableUuidSchema,
    sourceRecordId: nullableUuidSchema,
    evidenceKind: evidenceKindSchema,
    evidenceClass: evidenceClassSchema,
    sourceType: evidenceSourceTypeSchema,
    originRole: evidenceOriginRoleSchema,
    polarity: evidencePolaritySchema,
    sourceName: z.string().trim().min(1).max(160).nullable(),
    sourceUrl: nullableWebUrlSchema,
    sourceNativeId: z.string().trim().min(1).max(256).nullable(),
    observedAt: nullableTimestampSchema,
    publishedAt: nullableTimestampSchema,
    fetchedAt: nullableTimestampSchema,
    summary: z.string().trim().min(1).max(2_000),
    visibility: evidenceVisibilitySchema,
    reviewStatus: evidenceReviewStatusSchema,
    archiveUrl: nullableWebUrlSchema,
    contentHash: z.string().trim().min(1).max(128).nullable(),
    licenseId: z.string().trim().min(1).max(96).nullable(),
    attribution: z.string().trim().min(1).max(500).nullable(),
    independenceKey: z.string().trim().min(1).max(160).nullable(),
  })
  .superRefine((item, context) => {
    if (item.claimId === null && item.submissionId === null && item.sourceRecordId === null) {
      context.addIssue({
        code: 'custom',
        path: ['claimId'],
        message: 'Evidence must belong to a claim, submission, or source record.',
      });
    }

    const compatible =
      (item.evidenceClass === 'a' && classAKinds.has(item.evidenceKind)) ||
      (item.evidenceClass === 'b' && classBKinds.has(item.evidenceKind)) ||
      (item.evidenceClass === 'c' && classCKinds.has(item.evidenceKind));

    if (!compatible) {
      context.addIssue({
        code: 'custom',
        path: ['evidenceClass'],
        message: 'Evidence kind and evidence class are not compatible.',
      });
    }

    if (item.visibility === 'public' && item.reviewStatus !== 'accepted') {
      context.addIssue({
        code: 'custom',
        path: ['visibility'],
        message: 'Only accepted evidence may be public.',
      });
    }

    if (
      item.reviewStatus === 'accepted' &&
      item.evidenceClass !== 'c' &&
      item.observedAt === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['observedAt'],
        message: 'Accepted Class A and B evidence requires an observation time.',
      });
    }

    if (
      item.reviewStatus === 'accepted' &&
      item.evidenceClass === 'b' &&
      item.independenceKey === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['independenceKey'],
        message: 'Accepted Class B evidence requires an independence key.',
      });
    }

    if (item.sourceUrl !== null && item.fetchedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['fetchedAt'],
        message: 'A captured source URL requires a fetched time.',
      });
    }

    if (item.archiveUrl !== null && item.sourceUrl === null) {
      context.addIssue({
        code: 'custom',
        path: ['archiveUrl'],
        message: 'An archive URL requires an original source URL.',
      });
    }
  });

export const evidenceThresholdItemSchema = z.object({
  evidenceClass: evidenceClassSchema,
  originRole: evidenceOriginRoleSchema,
  polarity: evidencePolaritySchema,
  reviewStatus: evidenceReviewStatusSchema,
  independenceKey: z.string().trim().min(1).max(160).nullable(),
  observedAt: nullableTimestampSchema,
});

export type EvidenceThresholdBasis = 'single_a' | 'independent_b_pair';

export interface EvidenceThresholdResult {
  eligible: boolean;
  basis: EvidenceThresholdBasis | null;
  supportingIndexes: number[];
  latestContradictionAt: string | null;
}

const merchantSideRoles = new Set<(typeof evidenceOriginRoleValues)[number]>([
  'merchant_side',
  'processor_side',
]);
const usageSideRoles = new Set<(typeof evidenceOriginRoleValues)[number]>([
  'usage_side',
  'on_ground',
  'osm_side',
]);

export function evaluateEvidenceThreshold(
  input: readonly z.infer<typeof evidenceThresholdItemSchema>[],
): EvidenceThresholdResult {
  const reviewed = input.map((item, index) => ({
    ...evidenceThresholdItemSchema.parse(item),
    index,
  }));

  const contradictionTimes = reviewed
    .filter(
      (item) =>
        item.reviewStatus === 'accepted' &&
        item.polarity === 'contradicting' &&
        item.evidenceClass !== 'c' &&
        item.observedAt !== null,
    )
    .map((item) => Date.parse(item.observedAt as string));
  const contradictionCutoff =
    contradictionTimes.length === 0 ? Number.NEGATIVE_INFINITY : Math.max(...contradictionTimes);

  const eligibleSupporting = reviewed.filter(
    (item) =>
      item.reviewStatus === 'accepted' &&
      item.polarity === 'supporting' &&
      item.evidenceClass !== 'c' &&
      item.observedAt !== null &&
      Date.parse(item.observedAt) > contradictionCutoff,
  );

  const classA = eligibleSupporting.find((item) => item.evidenceClass === 'a');
  if (classA) {
    return {
      eligible: true,
      basis: 'single_a',
      supportingIndexes: [classA.index],
      latestContradictionAt:
        contradictionCutoff === Number.NEGATIVE_INFINITY
          ? null
          : new Date(contradictionCutoff).toISOString(),
    };
  }

  const classB = eligibleSupporting.filter(
    (item) => item.evidenceClass === 'b' && item.independenceKey !== null,
  );

  for (let left = 0; left < classB.length; left += 1) {
    for (let right = left + 1; right < classB.length; right += 1) {
      const first = classB[left];
      const second = classB[right];
      if (!first || !second || first.independenceKey === second.independenceKey) {
        continue;
      }

      const complementaryRoles =
        (merchantSideRoles.has(first.originRole) && usageSideRoles.has(second.originRole)) ||
        (merchantSideRoles.has(second.originRole) && usageSideRoles.has(first.originRole));

      if (complementaryRoles) {
        return {
          eligible: true,
          basis: 'independent_b_pair',
          supportingIndexes: [first.index, second.index],
          latestContradictionAt:
            contradictionCutoff === Number.NEGATIVE_INFINITY
              ? null
              : new Date(contradictionCutoff).toISOString(),
        };
      }
    }
  }

  return {
    eligible: false,
    basis: null,
    supportingIndexes: [],
    latestContradictionAt:
      contradictionCutoff === Number.NEGATIVE_INFINITY
        ? null
        : new Date(contradictionCutoff).toISOString(),
  };
}

export type EvidenceInput = z.infer<typeof evidenceInputSchema>;
export type EvidenceThresholdItem = z.infer<typeof evidenceThresholdItemSchema>;
