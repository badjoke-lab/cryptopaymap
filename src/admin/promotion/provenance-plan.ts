import { z } from 'zod';

export const promotionProvenanceSubjectTypeValues = [
  'entity',
  'location',
  'acceptance_claim',
  'claim_asset',
] as const;
export const promotionProvenanceRoleValues = ['origin', 'attribution'] as const;

export const promotionProvenanceAssignmentSchema = z
  .object({
    subjectType: z.enum(promotionProvenanceSubjectTypeValues),
    subjectId: z.uuid(),
    fieldPath: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z][A-Za-z0-9]*$/, 'Use a canonical camelCase field name.'),
    sourceRecordIds: z.array(z.uuid()).min(1).max(100),
    provenanceRole: z.enum(promotionProvenanceRoleValues),
  })
  .strict();

export const promotionProvenanceAssignmentsSchema = z
  .array(promotionProvenanceAssignmentSchema)
  .max(500);

export type PromotionProvenanceAssignment = z.infer<typeof promotionProvenanceAssignmentSchema>;

const allowedFields = {
  entity: ['name', 'legalName', 'websiteUrl', 'countryCode'],
  location: [
    'name',
    'addressLine',
    'locality',
    'region',
    'postalCode',
    'countryCode',
    'latitude',
    'longitude',
    'websiteUrl',
    'phone',
    'osmType',
    'osmId',
  ],
  acceptance_claim: [
    'routeType',
    'acceptanceScope',
    'customerPaysCrypto',
    'merchantExplicitlyAcceptsCrypto',
    'processorId',
    'howToPay',
    'merchantReceives',
    'restrictions',
  ],
  claim_asset: ['assetId', 'networkId', 'paymentMethodId', 'contractAddress', 'notes'],
} as const satisfies Record<
  (typeof promotionProvenanceSubjectTypeValues)[number],
  readonly string[]
>;

interface ProvenanceSubjectDraft {
  id: string;
  value: Record<string, unknown>;
}

export interface NewTargetProvenanceContext {
  sourceRecordIds: readonly string[];
  entity: ProvenanceSubjectDraft;
  location: ProvenanceSubjectDraft | null;
  claim: ProvenanceSubjectDraft;
  claimAssets: readonly ProvenanceSubjectDraft[];
}

export interface ExistingTargetProvenanceContext {
  sourceRecordIds: readonly string[];
  targetEntityId: string;
  targetLocationId: string | null;
  claim: ProvenanceSubjectDraft;
  claimAssets: readonly ProvenanceSubjectDraft[];
}

function subjectIds(context: NewTargetProvenanceContext | ExistingTargetProvenanceContext) {
  if ('entity' in context) {
    return {
      entity: new Set([context.entity.id]),
      location: new Set(context.location === null ? [] : [context.location.id]),
      acceptance_claim: new Set([context.claim.id]),
      claim_asset: new Set(context.claimAssets.map((row) => row.id)),
    };
  }
  return {
    entity: new Set([context.targetEntityId]),
    location: new Set(context.targetLocationId === null ? [] : [context.targetLocationId]),
    acceptance_claim: new Set([context.claim.id]),
    claim_asset: new Set(context.claimAssets.map((row) => row.id)),
  };
}

function requiredFields(subjectType: keyof typeof allowedFields, value: Record<string, unknown>) {
  return allowedFields[subjectType].filter((fieldPath) => {
    const fieldValue = value[fieldPath];
    return fieldValue !== null && fieldValue !== undefined;
  });
}

function validateBase(
  assignments: readonly PromotionProvenanceAssignment[],
  sourceRecordIds: readonly string[],
  ids: ReturnType<typeof subjectIds>,
): string[] {
  const issues: string[] = [];
  const candidateSources = new Set(sourceRecordIds);
  const assignmentKeys = new Set<string>();

  for (const assignment of assignments) {
    if (!ids[assignment.subjectType].has(assignment.subjectId)) {
      issues.push(
        `${assignment.subjectType}:${assignment.subjectId} is not part of the reviewed promotion draft`,
      );
    }
    if (
      !(allowedFields[assignment.subjectType] as readonly string[]).includes(assignment.fieldPath)
    ) {
      issues.push(
        `${assignment.subjectType}.${assignment.fieldPath} is not an allowed provenance field`,
      );
    }
    if (new Set(assignment.sourceRecordIds).size !== assignment.sourceRecordIds.length) {
      issues.push(
        `${assignment.subjectType}.${assignment.fieldPath} contains duplicate source record IDs`,
      );
    }
    for (const sourceRecordId of assignment.sourceRecordIds) {
      if (!candidateSources.has(sourceRecordId)) {
        issues.push(
          `${assignment.subjectType}.${assignment.fieldPath} references a source outside the Candidate provenance set`,
        );
      }
    }
    const key = [
      assignment.subjectType,
      assignment.subjectId,
      assignment.fieldPath,
      assignment.provenanceRole,
    ].join(':');
    if (assignmentKeys.has(key)) {
      issues.push(`${assignment.subjectType}.${assignment.fieldPath} is assigned more than once`);
    }
    assignmentKeys.add(key);
  }

  return issues;
}

function hasCoverage(
  assignments: readonly PromotionProvenanceAssignment[],
  subjectType: PromotionProvenanceAssignment['subjectType'],
  subjectId: string,
  fieldPath: string,
  provenanceRole: PromotionProvenanceAssignment['provenanceRole'],
) {
  return assignments.some(
    (assignment) =>
      assignment.subjectType === subjectType &&
      assignment.subjectId === subjectId &&
      assignment.fieldPath === fieldPath &&
      assignment.provenanceRole === provenanceRole,
  );
}

function validateRequiredCoverage(
  assignments: readonly PromotionProvenanceAssignment[],
  subjectType: PromotionProvenanceAssignment['subjectType'],
  subject: ProvenanceSubjectDraft,
  provenanceRole: PromotionProvenanceAssignment['provenanceRole'],
): string[] {
  return requiredFields(subjectType, subject.value)
    .filter((fieldPath) => !hasCoverage(assignments, subjectType, subject.id, fieldPath, provenanceRole))
    .map(
      (fieldPath) =>
        `${subjectType}.${fieldPath} requires at least one ${provenanceRole} source assignment`,
    );
}

export function validateNewTargetProvenanceAssignments(
  assignments: readonly PromotionProvenanceAssignment[] | undefined,
  context: NewTargetProvenanceContext,
): string[] {
  if (assignments === undefined || assignments.length === 0) return [];
  const issues = validateBase(assignments, context.sourceRecordIds, subjectIds(context));

  for (const assignment of assignments) {
    if (assignment.provenanceRole !== 'origin') {
      issues.push('new canonical records only accept origin field provenance');
    }
  }

  issues.push(
    ...validateRequiredCoverage(assignments, 'entity', context.entity, 'origin'),
    ...validateRequiredCoverage(assignments, 'acceptance_claim', context.claim, 'origin'),
  );
  if (context.location !== null) {
    issues.push(...validateRequiredCoverage(assignments, 'location', context.location, 'origin'));
  }
  for (const claimAsset of context.claimAssets) {
    issues.push(...validateRequiredCoverage(assignments, 'claim_asset', claimAsset, 'origin'));
  }
  return [...new Set(issues)];
}

export function validateExistingTargetProvenanceAssignments(
  assignments: readonly PromotionProvenanceAssignment[] | undefined,
  context: ExistingTargetProvenanceContext,
): string[] {
  if (assignments === undefined || assignments.length === 0) return [];
  const issues = validateBase(assignments, context.sourceRecordIds, subjectIds(context));

  let identityAttributionCount = 0;
  for (const assignment of assignments) {
    if (assignment.subjectType === 'entity' || assignment.subjectType === 'location') {
      if (assignment.provenanceRole !== 'attribution') {
        issues.push('existing Entity and Location fields only accept attribution provenance');
      } else {
        identityAttributionCount += 1;
      }
    } else if (assignment.provenanceRole !== 'origin') {
      issues.push('new Claim and Claim Asset fields only accept origin provenance');
    }
  }
  if (identityAttributionCount === 0) {
    issues.push('existing-target linking requires at least one identity-field attribution');
  }

  issues.push(
    ...validateRequiredCoverage(assignments, 'acceptance_claim', context.claim, 'origin'),
  );
  for (const claimAsset of context.claimAssets) {
    issues.push(...validateRequiredCoverage(assignments, 'claim_asset', claimAsset, 'origin'));
  }
  return [...new Set(issues)];
}

export function normalizePromotionProvenanceAssignments(
  assignments: readonly PromotionProvenanceAssignment[] | undefined,
): PromotionProvenanceAssignment[] {
  return [...(assignments ?? [])]
    .map((assignment) => ({
      ...assignment,
      sourceRecordIds: [...assignment.sourceRecordIds].sort(),
    }))
    .sort((left, right) =>
      [left.subjectType, left.subjectId, left.fieldPath, left.provenanceRole]
        .join(':')
        .localeCompare(
          [right.subjectType, right.subjectId, right.fieldPath, right.provenanceRole].join(':'),
        ),
    );
}

export function expandPromotionProvenanceAssignments(
  assignments: readonly PromotionProvenanceAssignment[],
  effectiveFrom: Date,
) {
  return assignments.flatMap((assignment) =>
    assignment.sourceRecordIds.map((sourceRecordId) => ({
      subjectType: assignment.subjectType,
      subjectId: assignment.subjectId,
      fieldPath: assignment.fieldPath,
      sourceRecordId,
      provenanceRole: assignment.provenanceRole,
      effectiveFrom,
    })),
  );
}
