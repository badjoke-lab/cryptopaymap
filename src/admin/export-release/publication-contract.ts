import { z } from 'zod';
import {
  canonicalPublicJson,
  hashPublicArtifact,
  type PublicArtifactInput,
  publicSnapshotDigest,
  validatePublicArtifactSet,
} from '../../publication/export-boundary';
import { publicExportPaths, publicVersionSchema } from '../../schemas/public-exports';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

export const exportPublicationCapabilityValues = ['export:publish'] as const;

export const exportPublicationMutationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.enum(exportPublicationCapabilityValues)).min(1),
  })
  .strict();

export const exportPublicationInputSchema = z
  .object({
    approvalRequestId: z.uuid(),
    expectedSnapshotDigest: sha256Schema,
    expectedArtifactCount: z.number().int().min(1).max(100),
    expectedDatasetVersion: z.string().trim().min(1).max(64),
    expectedSchemaVersion: z.string().trim().min(1).max(32),
    expectedGeneratedAt: z.iso.datetime({ offset: true }),
    expectedActiveSnapshotDigest: sha256Schema.nullable(),
    publishedAt: z.iso.datetime({ offset: true }),
    reasonCode: reasonCodeSchema,
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Date.parse(input.publishedAt) < Date.parse(input.expectedGeneratedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'Publication cannot precede artifact generation.',
      });
    }
  });

export const approvedExportReleaseSchema = z
  .object({
    requestId: z.uuid(),
    action: z.literal('approve'),
    releaseStatus: z.literal('approved'),
    snapshotDigest: sha256Schema,
    artifactCount: z.number().int().min(1).max(100),
    datasetVersion: z.string().trim().min(1).max(64),
    schemaVersion: z.string().trim().min(1).max(32),
    generatedAt: z.iso.datetime({ offset: true }),
    decidedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const exportPublicationFileSchema = z
  .object({
    path: z.string().min(1).max(256),
    objectKey: z.string().min(1).max(1_024),
    mediaType: z.enum(['application/json', 'application/geo+json']),
    sha256: sha256Schema,
    canonicalByteSize: z.number().int().positive(),
  })
  .strict();

export const activeExportReleasePointerSchema = z
  .object({
    formatVersion: z.literal('1'),
    snapshotDigest: sha256Schema,
    datasetVersion: z.string().trim().min(1).max(64),
    schemaVersion: z.string().trim().min(1).max(32),
    generatedAt: z.iso.datetime({ offset: true }),
    publishedAt: z.iso.datetime({ offset: true }),
    releasePrefix: z.string().min(1).max(512),
    files: z.array(exportPublicationFileSchema).min(1).max(100),
  })
  .strict();

export type ExportPublicationMutationContext = z.infer<
  typeof exportPublicationMutationContextSchema
>;
export type ExportPublicationInput = z.infer<typeof exportPublicationInputSchema>;
export type ApprovedExportRelease = z.infer<typeof approvedExportReleaseSchema>;
export type ExportPublicationFile = z.infer<typeof exportPublicationFileSchema>;
export type ActiveExportReleasePointer = z.infer<typeof activeExportReleasePointerSchema>;

export interface ExportPublicationObject extends ExportPublicationFile {
  body: string;
}

export interface ExportPublicationPlan {
  pointerKey: string;
  releasePrefix: string;
  pointer: ActiveExportReleasePointer;
  objects: ExportPublicationObject[];
}

export interface ActiveExportReleaseState {
  pointer: ActiveExportReleasePointer;
  versionToken: string;
}

export interface ExportPublicationTarget {
  readActivePointer(): Promise<ActiveExportReleaseState | null>;
  stageRelease(plan: ExportPublicationPlan): Promise<void>;
  activateRelease(
    pointer: ActiveExportReleasePointer,
    expectedVersionToken: string | null,
  ): Promise<void>;
}

export interface ApprovedExportReleaseBackend {
  loadApprovedRelease(requestId: string): Promise<ApprovedExportRelease | null>;
}

export interface ExportPublicationReceipt {
  requestId: string;
  approvalRequestId: string;
  snapshotDigest: string;
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: string;
  publishedAt: string;
  previousSnapshotDigest: string | null;
  pointerKey: string;
  releasePrefix: string;
  artifactCount: number;
  state: 'published' | 'replayed';
}

export type ExportPublicationErrorCode =
  | 'unauthorized'
  | 'invalid_publication'
  | 'approval_not_found'
  | 'approval_mismatch'
  | 'candidate_mismatch'
  | 'pointer_conflict'
  | 'target_failure';

export class ExportPublicationError extends Error {
  readonly code: ExportPublicationErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ExportPublicationErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportPublicationError';
    this.code = code;
    this.issues = issues;
  }
}

function mediaType(path: string): 'application/json' | 'application/geo+json' {
  return path === '/data/places.geojson' ? 'application/geo+json' : 'application/json';
}

function releaseObjectKey(snapshotDigest: string, path: string): string {
  return `export-releases/by-snapshot/${snapshotDigest}/${path.replace(/^\//, '')}`;
}

export async function buildExportPublicationPlan(
  artifacts: PublicArtifactInput,
  publishedAt: string,
): Promise<ExportPublicationPlan> {
  const validated = await validatePublicArtifactSet(artifacts);
  const version = publicVersionSchema.parse(validated['/version.json']);
  const snapshotDigest = await publicSnapshotDigest(validated);
  const releasePrefix = `export-releases/by-snapshot/${snapshotDigest}/`;
  const objects = await Promise.all(
    publicExportPaths.map(async (path) => {
      const value = validated[path];
      const body = canonicalPublicJson(value);
      return {
        path,
        objectKey: releaseObjectKey(snapshotDigest, path),
        mediaType: mediaType(path),
        sha256: await hashPublicArtifact(value),
        canonicalByteSize: new TextEncoder().encode(body).byteLength,
        body,
      } satisfies ExportPublicationObject;
    }),
  );
  const files = objects.map(({ body: _body, ...file }) => file);
  const pointer = activeExportReleasePointerSchema.parse({
    formatVersion: '1',
    snapshotDigest,
    datasetVersion: version.datasetVersion,
    schemaVersion: version.schemaVersion,
    generatedAt: version.generatedAt,
    publishedAt,
    releasePrefix,
    files,
  });
  return {
    pointerKey: 'export-releases/active.json',
    releasePrefix,
    pointer,
    objects,
  };
}

function assertExactRelease(
  input: ExportPublicationInput,
  approval: ApprovedExportRelease,
  plan: ExportPublicationPlan,
): void {
  const issues: string[] = [];
  if (approval.requestId !== input.approvalRequestId) issues.push('approvalRequestId');
  if (approval.snapshotDigest !== input.expectedSnapshotDigest) issues.push('approvalSnapshotDigest');
  if (approval.artifactCount !== input.expectedArtifactCount) issues.push('approvalArtifactCount');
  if (approval.datasetVersion !== input.expectedDatasetVersion) issues.push('approvalDatasetVersion');
  if (approval.schemaVersion !== input.expectedSchemaVersion) issues.push('approvalSchemaVersion');
  if (approval.generatedAt !== input.expectedGeneratedAt) issues.push('approvalGeneratedAt');
  if (plan.pointer.snapshotDigest !== input.expectedSnapshotDigest) issues.push('candidateSnapshotDigest');
  if (plan.objects.length !== input.expectedArtifactCount) issues.push('candidateArtifactCount');
  if (plan.pointer.datasetVersion !== input.expectedDatasetVersion) issues.push('candidateDatasetVersion');
  if (plan.pointer.schemaVersion !== input.expectedSchemaVersion) issues.push('candidateSchemaVersion');
  if (plan.pointer.generatedAt !== input.expectedGeneratedAt) issues.push('candidateGeneratedAt');
  if (issues.length > 0) {
    throw new ExportPublicationError(
      issues.some((issue) => issue.startsWith('approval'))
        ? 'approval_mismatch'
        : 'candidate_mismatch',
      'The approved release or private candidate changed before publication.',
      issues,
    );
  }
}

export function createExportPublicationService(
  approvals: ApprovedExportReleaseBackend,
  target: ExportPublicationTarget,
  buildPlan: (
    artifacts: PublicArtifactInput,
    publishedAt: string,
  ) => Promise<ExportPublicationPlan> = buildExportPublicationPlan,
) {
  return {
    async publish(
      context: ExportPublicationMutationContext,
      input: ExportPublicationInput,
      artifacts: PublicArtifactInput,
    ): Promise<ExportPublicationReceipt> {
      const contextResult = exportPublicationMutationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('export:publish')) {
        throw new ExportPublicationError(
          'unauthorized',
          'The actor is not authorized to publish public exports.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }
      const inputResult = exportPublicationInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new ExportPublicationError(
          'invalid_publication',
          'The export publication request is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }

      const approval = await approvals.loadApprovedRelease(inputResult.data.approvalRequestId);
      if (approval === null) {
        throw new ExportPublicationError(
          'approval_not_found',
          'The approved export release decision was not found.',
        );
      }
      const approvalResult = approvedExportReleaseSchema.safeParse(approval);
      if (!approvalResult.success) {
        throw new ExportPublicationError(
          'approval_mismatch',
          'The export release decision is not an approved release.',
          approvalResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }

      let plan: ExportPublicationPlan;
      try {
        plan = await buildPlan(artifacts, inputResult.data.publishedAt);
      } catch (error) {
        throw new ExportPublicationError(
          'candidate_mismatch',
          'The private export candidate failed publication validation.',
          [],
          { cause: error },
        );
      }
      assertExactRelease(inputResult.data, approvalResult.data, plan);

      let active: ActiveExportReleaseState | null;
      try {
        active = await target.readActivePointer();
      } catch (error) {
        throw new ExportPublicationError(
          'target_failure',
          'The active export release pointer could not be read.',
          [],
          { cause: error },
        );
      }

      if (active?.pointer.snapshotDigest === plan.pointer.snapshotDigest) {
        return {
          requestId: contextResult.data.requestId,
          approvalRequestId: approvalResult.data.requestId,
          snapshotDigest: plan.pointer.snapshotDigest,
          datasetVersion: plan.pointer.datasetVersion,
          schemaVersion: plan.pointer.schemaVersion,
          generatedAt: plan.pointer.generatedAt,
          publishedAt: active.pointer.publishedAt,
          previousSnapshotDigest: inputResult.data.expectedActiveSnapshotDigest,
          pointerKey: plan.pointerKey,
          releasePrefix: plan.releasePrefix,
          artifactCount: plan.objects.length,
          state: 'replayed',
        };
      }

      const actualActiveDigest = active?.pointer.snapshotDigest ?? null;
      if (actualActiveDigest !== inputResult.data.expectedActiveSnapshotDigest) {
        throw new ExportPublicationError(
          'pointer_conflict',
          'The active export release changed before publication.',
          ['expectedActiveSnapshotDigest'],
        );
      }

      try {
        await target.stageRelease(plan);
        await target.activateRelease(plan.pointer, active?.versionToken ?? null);
      } catch (error) {
        if (error instanceof ExportPublicationError) throw error;
        throw new ExportPublicationError(
          'target_failure',
          'The export release could not be activated.',
          [],
          { cause: error },
        );
      }

      return {
        requestId: contextResult.data.requestId,
        approvalRequestId: approvalResult.data.requestId,
        snapshotDigest: plan.pointer.snapshotDigest,
        datasetVersion: plan.pointer.datasetVersion,
        schemaVersion: plan.pointer.schemaVersion,
        generatedAt: plan.pointer.generatedAt,
        publishedAt: plan.pointer.publishedAt,
        previousSnapshotDigest: actualActiveDigest,
        pointerKey: plan.pointerKey,
        releasePrefix: plan.releasePrefix,
        artifactCount: plan.objects.length,
        state: 'published',
      };
    },
  };
}
