import { z } from 'zod';
import {
  candidateSourceRelationshipValues,
  candidateStatusValues,
  candidateTypeValues,
  duplicateGroupStatusValues,
  provenanceRoleValues,
  provenanceSubjectTypeValues,
  sourceTypeValues,
} from '../db/schema';
import { publicSlugSchema } from './core';

export const sourceTypeSchema = z.enum(sourceTypeValues);
export const candidateTypeSchema = z.enum(candidateTypeValues);
export const candidateStatusSchema = z.enum(candidateStatusValues);
export const duplicateGroupStatusSchema = z.enum(duplicateGroupStatusValues);
export const candidateSourceRelationshipSchema = z.enum(candidateSourceRelationshipValues);
export const provenanceSubjectTypeSchema = z.enum(provenanceSubjectTypeValues);
export const provenanceRoleSchema = z.enum(provenanceRoleValues);

const nullableUuidSchema = z.uuid().nullable();
const nullableTimestampSchema = z.iso.datetime({ offset: true }).nullable();
const webUrlSchema = z
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Use an HTTP or HTTPS URL.',
  );
const nullableWebUrlSchema = webUrlSchema.nullable();

export const licenseInputSchema = z.object({
  slug: publicSlugSchema,
  name: z.string().trim().min(1).max(160),
  version: z.string().trim().min(1).max(64).nullable(),
  url: nullableWebUrlSchema,
  attributionRequired: z.boolean(),
  shareAlike: z.boolean(),
  notes: z.string().trim().min(1).max(1_000).nullable(),
});

export const sourceInputSchema = z.object({
  sourceType: sourceTypeSchema,
  name: z.string().trim().min(1).max(160),
  baseUrl: nullableWebUrlSchema,
  defaultLicenseId: nullableUuidSchema,
  attributionText: z.string().trim().min(1).max(1_000).nullable(),
  isActive: z.boolean(),
});

export const sourceLicenseContextSchema = z
  .object({
    source: sourceInputSchema,
    defaultLicense: licenseInputSchema.nullable(),
  })
  .superRefine((contextValue, context) => {
    if (
      contextValue.defaultLicense?.attributionRequired === true &&
      contextValue.source.attributionText === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['source', 'attributionText'],
        message: 'Sources using an attribution-required license need attribution text.',
      });
    }

    if (contextValue.source.defaultLicenseId === null && contextValue.defaultLicense !== null) {
      context.addIssue({
        code: 'custom',
        path: ['source', 'defaultLicenseId'],
        message: 'A supplied default license requires a license identifier on the source.',
      });
    }
  });

export const sourceRecordInputSchema = z
  .object({
    sourceId: z.uuid(),
    externalId: z.string().trim().min(1).max(256).nullable(),
    sourceUrl: nullableWebUrlSchema,
    rawPayload: z.record(z.string(), z.unknown()),
    observedAt: nullableTimestampSchema,
    publishedAt: nullableTimestampSchema,
    fetchedAt: z.iso.datetime({ offset: true }),
    contentHash: z.string().trim().min(1).max(128).nullable(),
    archiveUrl: nullableWebUrlSchema,
    licenseId: nullableUuidSchema,
  })
  .superRefine((record, context) => {
    if (record.externalId === null && record.sourceUrl === null && record.contentHash === null) {
      context.addIssue({
        code: 'custom',
        path: ['externalId'],
        message: 'A source record requires an external ID, source URL, or content hash.',
      });
    }

    if (record.archiveUrl !== null && record.sourceUrl === null) {
      context.addIssue({
        code: 'custom',
        path: ['archiveUrl'],
        message: 'An archive URL requires an original source URL.',
      });
    }
  });

export const duplicateGroupInputSchema = z
  .object({
    status: duplicateGroupStatusSchema,
    resolutionNote: z.string().trim().min(1).max(2_000).nullable(),
    resolvedAt: nullableTimestampSchema,
  })
  .superRefine((group, context) => {
    const open = group.status === 'open';
    if (open !== (group.resolvedAt === null)) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedAt'],
        message: 'Open groups have no resolution time; resolved and dismissed groups require one.',
      });
    }
  });

export const sourceCandidateInputSchema = z
  .object({
    candidateType: candidateTypeSchema,
    normalizedName: z.string().trim().min(1).max(200),
    candidateStatus: candidateStatusSchema,
    priority: z.number().int().min(0).max(1_000).nullable(),
    duplicateGroupId: nullableUuidSchema,
    firstSeenAt: z.iso.datetime({ offset: true }),
    lastSeenAt: z.iso.datetime({ offset: true }),
    importBatchId: nullableUuidSchema,
    canonicalEntityId: nullableUuidSchema,
    canonicalLocationId: nullableUuidSchema,
  })
  .superRefine((candidate, context) => {
    if (candidate.normalizedName !== normalizeCandidateName(candidate.normalizedName)) {
      context.addIssue({
        code: 'custom',
        path: ['normalizedName'],
        message: 'Candidate names must be stored in normalized form.',
      });
    }

    if (Date.parse(candidate.firstSeenAt) > Date.parse(candidate.lastSeenAt)) {
      context.addIssue({
        code: 'custom',
        path: ['lastSeenAt'],
        message: 'Last seen time cannot precede first seen time.',
      });
    }

    if (candidate.canonicalLocationId !== null && candidate.candidateType !== 'physical_place') {
      context.addIssue({
        code: 'custom',
        path: ['canonicalLocationId'],
        message: 'Only physical-place candidates may link to a canonical location.',
      });
    }

    if (
      ['linked', 'promoted'].includes(candidate.candidateStatus) &&
      candidate.canonicalEntityId === null &&
      candidate.canonicalLocationId === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['candidateStatus'],
        message: 'Linked and promoted candidates require a canonical target.',
      });
    }

    if (
      candidate.candidateStatus === 'promoted' &&
      candidate.candidateType === 'physical_place' &&
      candidate.canonicalLocationId === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalLocationId'],
        message: 'Promoted physical-place candidates require a canonical location.',
      });
    }

    if (
      candidate.candidateStatus === 'promoted' &&
      candidate.candidateType !== 'physical_place' &&
      candidate.canonicalEntityId === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalEntityId'],
        message: 'Promoted non-physical candidates require a canonical entity.',
      });
    }

    if (candidate.candidateStatus === 'duplicate' && candidate.duplicateGroupId === null) {
      context.addIssue({
        code: 'custom',
        path: ['duplicateGroupId'],
        message: 'Duplicate candidates require a duplicate group.',
      });
    }
  });

export const candidateSourceRecordInputSchema = z.object({
  candidateId: z.uuid(),
  sourceRecordId: z.uuid(),
  relationship: candidateSourceRelationshipSchema,
});

export const provenanceLinkInputSchema = z
  .object({
    subjectType: provenanceSubjectTypeSchema,
    subjectId: z.uuid(),
    fieldPath: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/, 'Use a lowercase dot-separated field path.')
      .nullable(),
    sourceRecordId: z.uuid(),
    licenseId: nullableUuidSchema,
    provenanceRole: provenanceRoleSchema,
    effectiveFrom: nullableTimestampSchema,
    effectiveTo: nullableTimestampSchema,
  })
  .superRefine((link, context) => {
    if (
      link.effectiveFrom !== null &&
      link.effectiveTo !== null &&
      Date.parse(link.effectiveFrom) > Date.parse(link.effectiveTo)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Provenance end time cannot precede its start time.',
      });
    }
  });

export const candidateStatusTransitions = {
  new: ['triaged', 'duplicate', 'rejected', 'archived'],
  triaged: ['linked', 'duplicate', 'rejected', 'archived'],
  linked: ['promoted', 'duplicate', 'rejected', 'archived'],
  promoted: ['archived'],
  duplicate: ['triaged', 'archived'],
  rejected: ['triaged', 'archived'],
  archived: ['triaged'],
} as const satisfies Record<
  (typeof candidateStatusValues)[number],
  readonly (typeof candidateStatusValues)[number][]
>;

export function canTransitionCandidateStatus(
  from: (typeof candidateStatusValues)[number],
  to: (typeof candidateStatusValues)[number],
): boolean {
  return (candidateStatusTransitions[from] as readonly string[]).includes(to);
}

export function normalizeCandidateName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.searchParams.sort();
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

export function buildSourceRecordIdentity(record: {
  sourceId: string;
  externalId: string | null;
  sourceUrl: string | null;
  contentHash: string | null;
}): string {
  if (record.externalId !== null) {
    return `${record.sourceId}:external:${record.externalId.trim()}`;
  }
  if (record.sourceUrl !== null) {
    return `${record.sourceId}:url:${normalizeSourceUrl(record.sourceUrl)}`;
  }
  if (record.contentHash !== null) {
    return `${record.sourceId}:hash:${record.contentHash.trim().toLowerCase()}`;
  }
  throw new Error('A source record identity requires an external ID, source URL, or content hash.');
}

export interface CandidateDedupeInput {
  candidateId: string;
  candidateType: (typeof candidateTypeValues)[number];
  normalizedName: string;
  sourceIdentities: readonly string[];
}

export interface CandidateDuplicateSignal {
  leftCandidateId: string;
  rightCandidateId: string;
  reason: 'shared_source_identity' | 'same_normalized_name';
  strength: 'strong' | 'review';
}

export function findCandidateDuplicateSignals(
  candidates: readonly CandidateDedupeInput[],
): CandidateDuplicateSignal[] {
  const signals: CandidateDuplicateSignal[] = [];

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (!left || !right || left.candidateType !== right.candidateType) {
        continue;
      }

      const rightIdentities = new Set(right.sourceIdentities);
      const sharedSourceIdentity = left.sourceIdentities.some((identity) =>
        rightIdentities.has(identity),
      );

      if (sharedSourceIdentity) {
        signals.push({
          leftCandidateId: left.candidateId,
          rightCandidateId: right.candidateId,
          reason: 'shared_source_identity',
          strength: 'strong',
        });
        continue;
      }

      if (left.normalizedName === right.normalizedName) {
        signals.push({
          leftCandidateId: left.candidateId,
          rightCandidateId: right.candidateId,
          reason: 'same_normalized_name',
          strength: 'review',
        });
      }
    }
  }

  return signals;
}

export type LicenseInput = z.infer<typeof licenseInputSchema>;
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type SourceRecordInput = z.infer<typeof sourceRecordInputSchema>;
export type SourceCandidateInput = z.infer<typeof sourceCandidateInputSchema>;
export type ProvenanceLinkInput = z.infer<typeof provenanceLinkInputSchema>;
