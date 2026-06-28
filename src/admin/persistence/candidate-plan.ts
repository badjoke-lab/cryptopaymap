import { z } from 'zod';
import type {
  NewCandidateSourceRecord,
  NewImportBatch,
  NewLegacyPlaceId,
  NewSourceCandidate,
  NewSourceRecord,
} from '../../db/schema';
import type {
  OnlineServiceImportDraft,
  OnlineServiceImportPlan,
} from '../../importers/online-service';
import type {
  PhysicalPlaceImportDraft,
  PhysicalPlaceImportPlan,
} from '../../importers/physical-place';

export const adminCapabilityValues = ['candidate:write'] as const;
export const adminCapabilitySchema = z.enum(adminCapabilityValues);
export const adminActorTypeValues = ['human', 'system'] as const;
export const adminActorTypeSchema = z.enum(adminActorTypeValues);

export const adminMutationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: adminActorTypeSchema,
    capabilities: z.array(adminCapabilitySchema).min(1),
  })
  .strict();

export const candidatePlanPersistenceMetadataSchema = z
  .object({
    importKind: z.enum(['physical_place', 'online_service']),
    sourceId: z.uuid(),
    sourceSchemaVersion: z.string().trim().min(1).max(96),
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.startedAt) > Date.parse(value.completedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'Import completion cannot precede its start time.',
      });
    }
  });

export type AdminMutationContext = z.infer<typeof adminMutationContextSchema>;
export type CandidatePlanPersistenceMetadata = z.infer<
  typeof candidatePlanPersistenceMetadataSchema
>;
export type CandidateImportPlan = PhysicalPlaceImportPlan | OnlineServiceImportPlan;
export type CandidateImportDraft = PhysicalPlaceImportDraft | OnlineServiceImportDraft;

export interface CandidatePersistenceDraft {
  sourceRecord: NewSourceRecord;
  candidate: NewSourceCandidate;
  candidateSourceRecord: NewCandidateSourceRecord;
  legacyMapping: NewLegacyPlaceId;
}

export interface CandidatePersistenceBatch {
  mutation: AdminMutationContext;
  importBatch: NewImportBatch;
  drafts: CandidatePersistenceDraft[];
}

export interface CandidatePlanAtomicBackend {
  persistAtomically(batch: CandidatePersistenceBatch): Promise<void>;
}

export interface PersistCandidatePlanRequest {
  mutation: AdminMutationContext;
  metadata: CandidatePlanPersistenceMetadata;
  plan: CandidateImportPlan;
}

export interface CandidatePlanPersistenceReceipt {
  requestId: string;
  actorId: string;
  importBatchId: string;
  inputChecksum: string;
  acceptedCount: number;
  rejectedCount: number;
  replayedCount: number;
  candidateIds: string[];
  state: 'committed';
}

export type CandidatePlanPersistenceErrorCode =
  | 'unauthorized'
  | 'invalid_plan'
  | 'persistence_conflict'
  | 'backend_failure';

export class CandidatePlanPersistenceError extends Error {
  readonly code: CandidatePlanPersistenceErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: CandidatePlanPersistenceErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidatePlanPersistenceError';
    this.code = code;
    this.issues = issues;
  }
}

function rejectionSummary(plan: CandidateImportPlan): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rejection of plan.rejections) {
    counts[rejection.reason] = (counts[rejection.reason] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function assertUnique(values: readonly string[], label: string, issues: string[]): void {
  if (new Set(values).size !== values.length) {
    issues.push(`${label} values must be unique within one persistence request`);
  }
}

function validateDraft(
  draft: CandidateImportDraft,
  request: PersistCandidatePlanRequest,
  issues: string[],
): void {
  const { metadata, plan } = request;
  const expectedLegacySystem =
    metadata.importKind === 'physical_place' ? 'cryptopaymap_v2' : 'crypto_acceptance_registry';

  if (draft.sourceRecord.sourceId !== metadata.sourceId) {
    issues.push(`${draft.candidateId}: source record does not match the requested source`);
  }
  if (draft.candidate.importBatchId !== plan.importBatchId) {
    issues.push(`${draft.candidateId}: candidate import batch does not match the plan`);
  }
  if (draft.candidate.candidateStatus !== 'new') {
    issues.push(`${draft.candidateId}: imported candidates must remain new`);
  }
  if (draft.candidate.canonicalEntityId !== null || draft.candidate.canonicalLocationId !== null) {
    issues.push(`${draft.candidateId}: persistence cannot assign a canonical target`);
  }
  if (
    metadata.importKind === 'physical_place' &&
    draft.candidate.candidateType !== 'physical_place'
  ) {
    issues.push(`${draft.candidateId}: physical imports require physical-place candidates`);
  }
  if (
    metadata.importKind === 'online_service' &&
    draft.candidate.candidateType === 'physical_place'
  ) {
    issues.push(`${draft.candidateId}: online imports cannot create physical-place candidates`);
  }
  if (
    draft.candidateSourceRecord.candidateId !== draft.candidateId ||
    draft.candidateSourceRecord.sourceRecordId !== draft.sourceRecordId ||
    draft.candidateSourceRecord.relationship !== 'origin'
  ) {
    issues.push(`${draft.candidateId}: candidate-to-source origin linkage is inconsistent`);
  }
  if (
    draft.legacyMapping.sourceSystem !== expectedLegacySystem ||
    draft.legacyMapping.sourceRecordId !== draft.sourceRecordId ||
    draft.legacyMapping.migrationStatus !== 'pending' ||
    draft.legacyMapping.canonicalPath !== null ||
    draft.legacyMapping.entityId !== null ||
    draft.legacyMapping.locationId !== null ||
    draft.legacyMapping.resolvedAt !== null
  ) {
    issues.push(`${draft.candidateId}: legacy mapping is not a pending private mapping`);
  }
}

function validateRequest(request: PersistCandidatePlanRequest): void {
  const mutationResult = adminMutationContextSchema.safeParse(request.mutation);
  if (!mutationResult.success) {
    throw new CandidatePlanPersistenceError(
      'unauthorized',
      'The administration mutation context is invalid.',
      mutationResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  if (!request.mutation.capabilities.includes('candidate:write')) {
    throw new CandidatePlanPersistenceError(
      'unauthorized',
      'The actor is not authorized to persist candidate import plans.',
    );
  }

  const metadataResult = candidatePlanPersistenceMetadataSchema.safeParse(request.metadata);
  if (!metadataResult.success) {
    throw new CandidatePlanPersistenceError(
      'invalid_plan',
      'The import persistence metadata is invalid.',
      metadataResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const { plan } = request;
  const issues: string[] = [];
  if (!/^[a-f0-9]{64}$/.test(plan.inputChecksum)) {
    issues.push('inputChecksum must be a lowercase SHA-256 digest');
  }
  if (plan.summary.automaticConfirmedCount !== 0) {
    issues.push('candidate persistence cannot contain automatic Confirmed records');
  }
  if (plan.summary.acceptedCount !== plan.drafts.length) {
    issues.push('acceptedCount must equal the number of candidate drafts');
  }
  if (plan.summary.rejectedCount !== plan.rejections.length) {
    issues.push('rejectedCount must equal the number of structured rejections');
  }
  if (plan.summary.replayedCount !== plan.replays.length) {
    issues.push('replayedCount must equal the number of exact replays');
  }
  if (plan.summary.duplicateSignalCount !== plan.duplicateSignals.length) {
    issues.push('duplicateSignalCount must equal the number of duplicate review signals');
  }
  if (
    plan.summary.inputCount !==
    plan.summary.acceptedCount + plan.summary.rejectedCount + plan.summary.replayedCount
  ) {
    issues.push('inputCount must equal accepted, rejected, and replayed records');
  }
  if (
    request.metadata.importKind === 'online_service' &&
    !Object.hasOwn(plan.summary, 'outOfScopeCount')
  ) {
    issues.push('online import plans require an out-of-scope count');
  }
  if (
    request.metadata.importKind === 'physical_place' &&
    Object.hasOwn(plan.summary, 'outOfScopeCount')
  ) {
    issues.push('physical import plans cannot report online out-of-scope records');
  }

  assertUnique(
    plan.drafts.map((draft) => draft.candidateId),
    'candidate ID',
    issues,
  );
  assertUnique(
    plan.drafts.map((draft) => draft.sourceRecordId),
    'source-record ID',
    issues,
  );
  assertUnique(
    plan.drafts.map((draft) => draft.legacyMappingId),
    'legacy-mapping ID',
    issues,
  );

  for (const draft of plan.drafts) validateDraft(draft, request, issues);

  if (issues.length > 0) {
    throw new CandidatePlanPersistenceError(
      'invalid_plan',
      'The candidate import plan violates the private persistence boundary.',
      issues,
    );
  }
}

function asDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function buildPersistenceBatch(request: PersistCandidatePlanRequest): CandidatePersistenceBatch {
  const { metadata, plan, mutation } = request;
  const outOfScopeCount = 'outOfScopeCount' in plan.summary ? plan.summary.outOfScopeCount : 0;

  return {
    mutation,
    importBatch: {
      id: plan.importBatchId,
      requestId: mutation.requestId,
      actorId: mutation.actorId,
      actorType: mutation.actorType,
      sourceId: metadata.sourceId,
      importKind: metadata.importKind,
      sourceSchemaVersion: metadata.sourceSchemaVersion,
      importerVersion: plan.importerVersion,
      inputChecksum: plan.inputChecksum,
      inputCount: plan.summary.inputCount,
      acceptedCount: plan.summary.acceptedCount,
      rejectedCount: plan.summary.rejectedCount,
      replayedCount: plan.summary.replayedCount,
      outOfScopeCount,
      duplicateSignalCount: plan.summary.duplicateSignalCount,
      automaticConfirmedCount: plan.summary.automaticConfirmedCount,
      rejectionSummary: rejectionSummary(plan),
      startedAt: new Date(metadata.startedAt),
      completedAt: new Date(metadata.completedAt),
    },
    drafts: plan.drafts.map((draft) => ({
      sourceRecord: {
        id: draft.sourceRecordId,
        ...draft.sourceRecord,
        observedAt: asDate(draft.sourceRecord.observedAt),
        publishedAt: asDate(draft.sourceRecord.publishedAt),
        fetchedAt: new Date(draft.sourceRecord.fetchedAt),
      },
      candidate: {
        id: draft.candidateId,
        ...draft.candidate,
        firstSeenAt: new Date(draft.candidate.firstSeenAt),
        lastSeenAt: new Date(draft.candidate.lastSeenAt),
      },
      candidateSourceRecord: draft.candidateSourceRecord,
      legacyMapping: {
        id: draft.legacyMappingId,
        ...draft.legacyMapping,
        resolvedAt: asDate(draft.legacyMapping.resolvedAt),
      },
    })),
  };
}

export function createCandidatePlanPersistenceService(backend: CandidatePlanAtomicBackend) {
  return {
    async persist(request: PersistCandidatePlanRequest): Promise<CandidatePlanPersistenceReceipt> {
      validateRequest(request);
      const batch = buildPersistenceBatch(request);

      try {
        await backend.persistAtomically(batch);
      } catch (error) {
        if (error instanceof CandidatePlanPersistenceError) throw error;
        throw new CandidatePlanPersistenceError(
          'backend_failure',
          'The candidate import plan was not committed.',
          [],
          { cause: error },
        );
      }

      return {
        requestId: request.mutation.requestId,
        actorId: request.mutation.actorId,
        importBatchId: request.plan.importBatchId,
        inputChecksum: request.plan.inputChecksum,
        acceptedCount: request.plan.summary.acceptedCount,
        rejectedCount: request.plan.summary.rejectedCount,
        replayedCount: request.plan.summary.replayedCount,
        candidateIds: request.plan.drafts.map((draft) => draft.candidateId),
        state: 'committed',
      };
    },
  };
}
