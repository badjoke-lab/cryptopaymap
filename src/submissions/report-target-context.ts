import { z } from 'zod';
import {
  acceptanceClaimStatusValues,
  claimVisibilityValues,
  routeTypeValues,
} from '../db/schema/enums';
import { acceptanceScopeValues, claimScopeValues } from '../db/schema/acceptance-claims';
import { entityStatusValues, entityTypeValues } from '../db/schema/entities';
import { locationStatusValues } from '../db/schema/locations';
import { paymentMethodValues } from '../db/schema/payment-registries';
import type {
  PaymentReportReviewProjection,
  ProblemReportReviewProjection,
  ReportReviewProjection,
} from './report-contract';

const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));
const nullableTimestampSchema = timestampSchema.nullable();

export const reportTargetEntitySnapshotSchema = z
  .object({
    id: z.uuid(),
    entityType: z.enum(entityTypeValues),
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().min(1).max(64).nullable(),
    websiteUrl: httpUrlSchema.nullable(),
    countryCode: z.string().length(2).nullable(),
    entityStatus: z.enum(entityStatusValues),
    visibility: z.enum(claimVisibilityValues),
    updatedAt: timestampSchema,
  })
  .strict();

export const reportTargetLocationSnapshotSchema = z
  .object({
    id: z.uuid(),
    entityId: z.uuid(),
    name: z.string().trim().min(1).max(160).nullable(),
    slug: z.string().trim().min(1).max(64),
    addressLine: z.string().trim().min(1).max(500).nullable(),
    locality: z.string().trim().min(1).max(120).nullable(),
    region: z.string().trim().min(1).max(120).nullable(),
    postalCode: z.string().trim().min(1).max(32).nullable(),
    countryCode: z.string().length(2),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    locationStatus: z.enum(locationStatusValues),
    visibility: z.enum(claimVisibilityValues),
    websiteUrl: httpUrlSchema.nullable(),
    updatedAt: timestampSchema,
  })
  .strict();

export const reportTargetClaimOptionSchema = z
  .object({
    assetSlug: z.string().trim().min(1).max(64),
    networkSlug: z.string().trim().min(1).max(64),
    paymentMethod: z.enum(paymentMethodValues),
    isPrimary: z.boolean(),
  })
  .strict();

export const reportTargetClaimSnapshotSchema = z
  .object({
    id: z.uuid(),
    entityId: z.uuid(),
    locationId: z.uuid().nullable(),
    claimScope: z.enum(claimScopeValues),
    routeType: z.enum(routeTypeValues),
    acceptanceScope: z.enum(acceptanceScopeValues),
    claimStatus: z.enum(acceptanceClaimStatusValues),
    visibility: z.enum(claimVisibilityValues),
    processorName: z.string().trim().min(1).max(160).nullable(),
    howToPay: z.string().trim().min(1).max(2_000).nullable(),
    restrictions: z.string().trim().min(1).max(2_000).nullable(),
    firstConfirmedAt: nullableTimestampSchema,
    lastConfirmedAt: nullableTimestampSchema,
    nextReviewAt: nullableTimestampSchema,
    endedAt: nullableTimestampSchema,
    updatedAt: timestampSchema,
    options: z.array(reportTargetClaimOptionSchema).max(100),
  })
  .strict()
  .superRefine((claim, context) => {
    if (claim.claimScope === 'location_specific' && claim.locationId === null) {
      context.addIssue({
        code: 'custom',
        path: ['locationId'],
        message: 'Location-specific Claim context requires a Location ID.',
      });
    }
    if (claim.claimScope !== 'location_specific' && claim.locationId !== null) {
      context.addIssue({
        code: 'custom',
        path: ['locationId'],
        message: 'Non-location Claim context must not include a Location ID.',
      });
    }
    if (claim.routeType === 'processor_checkout' && claim.processorName === null) {
      context.addIssue({
        code: 'custom',
        path: ['processorName'],
        message: 'Processor-checkout Claim context requires a processor name.',
      });
    }
    const optionKeys = claim.options.map(
      (option) => `${option.assetSlug}:${option.networkSlug}:${option.paymentMethod}`,
    );
    if (new Set(optionKeys).size !== optionKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Claim context payment options must be unique.',
      });
    }
    if (claim.options.filter((option) => option.isPrimary).length > 1) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Claim context may contain at most one primary payment option.',
      });
    }
  });

export const reportCanonicalTargetMaterialSchema = z
  .object({
    targetType: z.enum(['entity', 'location', 'claim']),
    targetId: z.uuid(),
    entity: reportTargetEntitySnapshotSchema,
    location: reportTargetLocationSnapshotSchema.nullable(),
    claims: z.array(reportTargetClaimSnapshotSchema).max(100),
    selectedClaimId: z.uuid().nullable(),
  })
  .strict()
  .superRefine((material, context) => {
    if (material.location !== null && material.location.entityId !== material.entity.id) {
      context.addIssue({
        code: 'custom',
        path: ['location', 'entityId'],
        message: 'Location context must belong to the returned Entity.',
      });
    }
    const claimIds = material.claims.map((claim) => claim.id);
    if (new Set(claimIds).size !== claimIds.length) {
      context.addIssue({ code: 'custom', path: ['claims'], message: 'Claim IDs must be unique.' });
    }
    for (const [index, claim] of material.claims.entries()) {
      if (claim.entityId !== material.entity.id) {
        context.addIssue({
          code: 'custom',
          path: ['claims', index, 'entityId'],
          message: 'Claim context must belong to the returned Entity.',
        });
      }
      if (
        claim.locationId !== null &&
        (material.location === null || claim.locationId !== material.location.id)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['claims', index, 'locationId'],
          message: 'Location-specific Claim context must match the returned Location.',
        });
      }
    }

    if (material.targetType === 'entity') {
      if (material.targetId !== material.entity.id || material.selectedClaimId !== null) {
        context.addIssue({
          code: 'custom',
          message: 'Entity target identity does not match the returned material.',
        });
      }
    }
    if (material.targetType === 'location') {
      if (
        material.location === null ||
        material.targetId !== material.location.id ||
        material.selectedClaimId !== null
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Location target identity does not match the returned material.',
        });
      }
    }
    if (material.targetType === 'claim') {
      if (
        material.selectedClaimId !== material.targetId ||
        !material.claims.some((claim) => claim.id === material.targetId)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Claim target identity does not match the returned Claim set.',
        });
      }
    }
  });

export const reportTargetContextSignalReasonValues = [
  'selected_target_claim',
  'target_level_claim_context',
  'same_route_type',
  'same_asset',
  'same_network',
  'same_payment_method',
  'same_processor_name',
  'problem_may_affect_payment_claim',
] as const;
export const reportTargetContextSignalReasonSchema = z.enum(
  reportTargetContextSignalReasonValues,
);

export const reportTargetContextResponseSchema = z
  .object({
    generatedAt: timestampSchema,
    target: z
      .object({
        targetType: z.enum(['entity', 'location', 'claim']),
        targetId: z.uuid(),
        canonicalPath: z
          .string()
          .regex(/^\/(place|service)\/[^/?#]+$/)
          .nullable(),
        entity: reportTargetEntitySnapshotSchema,
        location: reportTargetLocationSnapshotSchema.nullable(),
        selectedClaimId: z.uuid().nullable(),
      })
      .strict(),
    reportability: z
      .object({
        publiclyReachable: z.boolean(),
        reasons: z
          .array(
            z.enum([
              'missing_public_path',
              'entity_not_public',
              'entity_not_active',
              'location_not_public',
              'location_not_active',
              'claim_not_public',
              'claim_not_reportable_status',
            ]),
          )
          .max(7),
      })
      .strict(),
    claimSignals: z
      .array(
        z
          .object({
            claimId: z.uuid(),
            claimStatus: z.enum(acceptanceClaimStatusValues),
            visibility: z.enum(claimVisibilityValues),
            reasons: z.array(reportTargetContextSignalReasonSchema).min(1).max(8),
          })
          .strict(),
      )
      .max(100),
    coverage: z
      .object({
        targetLookupComplete: z.literal(true),
        claimContextComplete: z.literal(true),
        absenceIsConclusive: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type ReportCanonicalTargetMaterial = z.infer<typeof reportCanonicalTargetMaterialSchema>;
export type ReportTargetContextResponse = z.infer<typeof reportTargetContextResponseSchema>;

export interface ReportCanonicalTargetContextBackend {
  loadTarget(
    targetType: ReportReviewProjection['targetType'],
    targetId: string,
  ): Promise<ReportCanonicalTargetMaterial | null>;
}

export class ReportTargetContextError extends Error {
  constructor(
    readonly code:
      | 'invalid_projection'
      | 'target_not_found'
      | 'backend_failure'
      | 'invalid_response',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ReportTargetContextError';
  }
}

function canonicalPath(material: ReportCanonicalTargetMaterial): string | null {
  if (material.location !== null) return `/place/${material.location.slug}`;
  if (material.entity.entityType === 'online_service' && material.entity.slug !== null) {
    return `/service/${material.entity.slug}`;
  }
  return null;
}

function reportability(material: ReportCanonicalTargetMaterial, path: string | null) {
  const reasons: Array<
    | 'missing_public_path'
    | 'entity_not_public'
    | 'entity_not_active'
    | 'location_not_public'
    | 'location_not_active'
    | 'claim_not_public'
    | 'claim_not_reportable_status'
  > = [];
  if (path === null) reasons.push('missing_public_path');
  if (material.entity.visibility !== 'public') reasons.push('entity_not_public');
  if (material.entity.entityStatus !== 'active') reasons.push('entity_not_active');
  if (material.location !== null) {
    if (material.location.visibility !== 'public') reasons.push('location_not_public');
    if (!['active', 'temporarily_closed'].includes(material.location.locationStatus)) {
      reasons.push('location_not_active');
    }
  }
  if (material.selectedClaimId !== null) {
    const claim = material.claims.find((candidate) => candidate.id === material.selectedClaimId);
    if (claim?.visibility !== 'public') reasons.push('claim_not_public');
    if (claim === undefined || !['confirmed', 'stale', 'ended'].includes(claim.claimStatus)) {
      reasons.push('claim_not_reportable_status');
    }
  }
  return { publiclyReachable: reasons.length === 0, reasons };
}

function normalizedProcessorName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function paymentSignalReasons(
  report: PaymentReportReviewProjection,
  material: ReportCanonicalTargetMaterial,
  claim: ReportCanonicalTargetMaterial['claims'][number],
): Array<(typeof reportTargetContextSignalReasonValues)[number]> {
  const reasons: Array<(typeof reportTargetContextSignalReasonValues)[number]> = [];
  if (material.selectedClaimId === claim.id) reasons.push('selected_target_claim');
  if (material.targetType !== 'claim') reasons.push('target_level_claim_context');
  if (report.payment.routeType !== null && claim.routeType === report.payment.routeType) {
    reasons.push('same_route_type');
  }
  if (
    report.payment.assetSlug !== null &&
    claim.options.some((option) => option.assetSlug === report.payment.assetSlug)
  ) {
    reasons.push('same_asset');
  }
  if (
    report.payment.networkSlug !== null &&
    claim.options.some((option) => option.networkSlug === report.payment.networkSlug)
  ) {
    reasons.push('same_network');
  }
  if (
    report.payment.paymentMethod !== null &&
    claim.options.some((option) => option.paymentMethod === report.payment.paymentMethod)
  ) {
    reasons.push('same_payment_method');
  }
  if (
    report.payment.processor !== null &&
    claim.processorName !== null &&
    normalizedProcessorName(claim.processorName) ===
      normalizedProcessorName(report.payment.processor.name)
  ) {
    reasons.push('same_processor_name');
  }
  return [...new Set(reasons)];
}

function problemSignalReasons(
  report: ProblemReportReviewProjection,
  material: ReportCanonicalTargetMaterial,
  claim: ReportCanonicalTargetMaterial['claims'][number],
): Array<(typeof reportTargetContextSignalReasonValues)[number]> {
  const reasons: Array<(typeof reportTargetContextSignalReasonValues)[number]> = [];
  if (material.selectedClaimId === claim.id) reasons.push('selected_target_claim');
  if (material.targetType !== 'claim') reasons.push('target_level_claim_context');
  if (
    [
      'no_longer_accepts_crypto',
      'payment_failed',
      'wrong_asset',
      'wrong_network',
      'wrong_instructions',
    ].includes(report.reportType)
  ) {
    reasons.push('problem_may_affect_payment_claim');
  }
  return [...new Set(reasons)];
}

export async function generateReportTargetContext(
  report: ReportReviewProjection,
  backend: ReportCanonicalTargetContextBackend,
  asOf = new Date(),
): Promise<ReportTargetContextResponse> {
  if (Number.isNaN(asOf.getTime())) {
    throw new ReportTargetContextError('invalid_projection', 'Report target context time is invalid.');
  }

  let rawMaterial: ReportCanonicalTargetMaterial | null;
  try {
    rawMaterial = await backend.loadTarget(report.targetType, report.targetId);
  } catch (error) {
    throw new ReportTargetContextError(
      'backend_failure',
      'Report target context could not be loaded.',
      { cause: error },
    );
  }
  if (rawMaterial === null) {
    throw new ReportTargetContextError('target_not_found', 'The report target does not exist.');
  }

  const parsedMaterial = reportCanonicalTargetMaterialSchema.safeParse(rawMaterial);
  if (
    !parsedMaterial.success ||
    parsedMaterial.data.targetType !== report.targetType ||
    parsedMaterial.data.targetId !== report.targetId
  ) {
    throw new ReportTargetContextError(
      'invalid_response',
      'Report target context backend returned invalid target material.',
      { cause: parsedMaterial.success ? undefined : parsedMaterial.error },
    );
  }

  const material = parsedMaterial.data;
  const path = canonicalPath(material);
  const claimSignals = material.claims
    .map((claim) => ({
      claimId: claim.id,
      claimStatus: claim.claimStatus,
      visibility: claim.visibility,
      reasons:
        report.reportKind === 'payment_report'
          ? paymentSignalReasons(report, material, claim)
          : problemSignalReasons(report, material, claim),
    }))
    .filter((signal) => signal.reasons.length > 0)
    .sort((left, right) => left.claimId.localeCompare(right.claimId));

  const result = reportTargetContextResponseSchema.safeParse({
    generatedAt: asOf.toISOString(),
    target: {
      targetType: material.targetType,
      targetId: material.targetId,
      canonicalPath: path,
      entity: material.entity,
      location: material.location,
      selectedClaimId: material.selectedClaimId,
    },
    reportability: reportability(material, path),
    claimSignals,
    coverage: {
      targetLookupComplete: true,
      claimContextComplete: true,
      absenceIsConclusive: false,
    },
  });
  if (!result.success) {
    throw new ReportTargetContextError(
      'invalid_response',
      'Report target context could not be reduced to a bounded response.',
      { cause: result.error },
    );
  }
  return result.data;
}
