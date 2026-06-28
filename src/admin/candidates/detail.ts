import { z } from 'zod';
import {
  acceptanceScopeValues,
  candidateSourceRelationshipValues,
  candidateStatusValues,
  candidateTypeValues,
  duplicateGroupStatusValues,
  importKindValues,
  routeTypeValues,
  sourceTypeValues,
} from '../../db/schema';
import { importableOnlineCandidateTypeValues } from '../../schemas/online-service-import';

const candidateReadCapabilitySchema = z.literal('candidate:read');
const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));
const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

export const candidateDetailContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(220),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(candidateReadCapabilitySchema).min(1),
  })
  .strict();

const physicalSourceSnapshotSchema = z
  .object({
    kind: z.literal('physical_place'),
    name: z.string().trim().min(1).max(200),
    addressLine: nullableText(500),
    locality: nullableText(120),
    region: nullableText(120),
    postalCode: nullableText(32),
    countryCode: z.string().length(2),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    category: nullableText(120),
    websiteUrl: httpUrlSchema.nullable(),
    osmType: z.enum(['node', 'way', 'relation']).nullable(),
    osmId: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .nullable(),
    paymentTags: z.record(z.string().max(160), z.string().max(160)),
    legacyVerificationLabel: nullableText(120),
  })
  .strict();

const onlineSourceSnapshotSchema = z
  .object({
    kind: z.literal('online_service'),
    recordType: z.enum(importableOnlineCandidateTypeValues),
    name: z.string().trim().min(1).max(200),
    websiteUrl: httpUrlSchema.nullable(),
    countryCode: z.string().length(2).nullable(),
    category: nullableText(120),
    acceptanceScope: z.enum(acceptanceScopeValues).nullable(),
    routeType: z.enum(routeTypeValues).nullable(),
    processorName: nullableText(200),
    processorUrl: httpUrlSchema.nullable(),
    assetLabels: z.array(z.string().trim().min(1).max(160)).max(100),
    networkLabels: z.array(z.string().trim().min(1).max(160)).max(100),
    paymentMethodLabels: z.array(z.string().trim().min(1).max(160)).max(100),
    scopeNotes: nullableText(2_000),
    howToPay: nullableText(3_000),
    evidenceUrls: z.array(httpUrlSchema).max(20),
    legacyVerificationLabel: nullableText(120),
  })
  .strict();

export const candidateSourceSnapshotSchema = z.discriminatedUnion('kind', [
  physicalSourceSnapshotSchema,
  onlineSourceSnapshotSchema,
]);

export const candidateDetailSourceSchema = z
  .object({
    id: z.uuid(),
    relationship: z.enum(candidateSourceRelationshipValues),
    sourceName: z.string().trim().min(1).max(160),
    sourceType: z.enum(sourceTypeValues),
    sourceActive: z.boolean(),
    sourceUrl: httpUrlSchema.nullable(),
    archiveUrl: httpUrlSchema.nullable(),
    observedAt: timestampSchema.nullable(),
    publishedAt: timestampSchema.nullable(),
    fetchedAt: timestampSchema,
    license: z
      .object({
        slug: z.string().trim().min(1).max(96),
        name: z.string().trim().min(1).max(160),
        version: nullableText(64),
        attributionRequired: z.boolean(),
        shareAlike: z.boolean(),
      })
      .strict()
      .nullable(),
    snapshot: candidateSourceSnapshotSchema.nullable(),
  })
  .strict();

export const candidateDetailDataSchema = z
  .object({
    candidate: z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(200),
        candidateType: z.enum(candidateTypeValues),
        status: z.enum(candidateStatusValues),
        priority: z.number().int().min(0).max(1_000).nullable(),
        firstSeenAt: timestampSchema,
        lastSeenAt: timestampSchema,
        createdAt: timestampSchema,
        updatedAt: timestampSchema,
        duplicateSignal: z.boolean(),
        duplicateGroupId: z.uuid().nullable(),
        duplicateGroupStatus: z.enum(duplicateGroupStatusValues).nullable(),
        linkedEntity: z.boolean(),
        linkedLocation: z.boolean(),
      })
      .strict(),
    importOrigin: z
      .object({
        importKind: z.enum(importKindValues),
        sourceName: z.string().trim().min(1).max(160),
        sourceType: z.enum(sourceTypeValues),
        sourceSchemaVersion: z.string().trim().min(1).max(96),
        importerVersion: z.string().trim().min(1).max(32),
        completedAt: timestampSchema,
      })
      .strict()
      .nullable(),
    sources: z.array(candidateDetailSourceSchema).max(100),
    sourcesTruncated: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.candidate.duplicateSignal !== (value.candidate.duplicateGroupId !== null) ||
      (value.candidate.duplicateGroupId === null && value.candidate.duplicateGroupStatus !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['candidate', 'duplicateGroupId'],
        message: 'Duplicate signal, group identity, and group status must remain consistent.',
      });
    }
    if (value.candidate.linkedLocation && value.candidate.candidateType !== 'physical_place') {
      context.addIssue({
        code: 'custom',
        path: ['candidate', 'linkedLocation'],
        message: 'Only physical-place Candidates may link to a location.',
      });
    }
  });

export const candidateDetailResponseSchema = candidateDetailDataSchema.safeExtend({
  generatedAt: timestampSchema,
});

export type CandidateDetailContext = z.infer<typeof candidateDetailContextSchema>;
export type CandidateSourceSnapshot = z.infer<typeof candidateSourceSnapshotSchema>;
export type CandidateDetailSource = z.infer<typeof candidateDetailSourceSchema>;
export type CandidateDetailData = z.infer<typeof candidateDetailDataSchema>;
export type CandidateDetailResponse = z.infer<typeof candidateDetailResponseSchema>;

export interface CandidateDetailBackend {
  loadDetail(candidateId: string, asOf: Date): Promise<CandidateDetailData | null>;
}

export type CandidateDetailErrorCode =
  | 'unauthorized'
  | 'invalid_candidate_id'
  | 'not_found'
  | 'invalid_detail'
  | 'backend_failure';

export class CandidateDetailError extends Error {
  readonly code: CandidateDetailErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: CandidateDetailErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidateDetailError';
    this.code = code;
    this.issues = issues;
  }
}

export async function loadCandidateDetail(
  context: CandidateDetailContext,
  backend: CandidateDetailBackend,
  candidateId: string,
  asOf = new Date(),
): Promise<CandidateDetailResponse> {
  const contextResult = candidateDetailContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('candidate:read')) {
    throw new CandidateDetailError(
      'unauthorized',
      'The actor is not authorized to read Candidate details.',
    );
  }

  const candidateIdResult = z.uuid().safeParse(candidateId);
  if (!candidateIdResult.success || Number.isNaN(asOf.getTime())) {
    throw new CandidateDetailError('invalid_candidate_id', 'The Candidate identifier is invalid.');
  }

  let detail: CandidateDetailData | null;
  try {
    detail = await backend.loadDetail(candidateIdResult.data, asOf);
  } catch (error) {
    if (error instanceof CandidateDetailError) throw error;
    throw new CandidateDetailError(
      'backend_failure',
      'The Candidate detail could not be loaded.',
      [],
      { cause: error },
    );
  }

  if (detail === null) {
    throw new CandidateDetailError('not_found', 'The Candidate detail was not found.');
  }

  const result = candidateDetailResponseSchema.safeParse({
    ...detail,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new CandidateDetailError(
      'invalid_detail',
      'The Candidate detail backend returned an invalid response.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  return result.data;
}
