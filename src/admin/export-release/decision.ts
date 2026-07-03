import { z } from 'zod';
import {
  hashPublicArtifact,
  PublicExportBoundaryError,
  type PublicArtifactInput,
  publicSnapshotDigest,
  validatePublicArtifactSet,
} from '../../publication/export-boundary';
import { publicVersionSchema } from '../../schemas/public-exports';

export const exportReleaseCapabilityValues = ['export:release'] as const;
export const exportReleaseActionValues = ['approve', 'reject'] as const;
export const exportReleaseCandidateStatusValues = ['eligible', 'blocked'] as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

export const exportReleaseMutationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.enum(exportReleaseCapabilityValues)).min(1),
  })
  .strict();

export const exportReleaseCandidateMetadataSchema = z
  .object({
    datasetVersion: z.string().trim().min(1).max(64),
    schemaVersion: z.string().trim().min(1).max(32),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const exportReleaseCandidateSchema = z
  .object({
    status: z.enum(exportReleaseCandidateStatusValues),
    snapshotDigest: sha256Schema,
    artifactCount: z.number().int().min(1).max(100),
    metadata: exportReleaseCandidateMetadataSchema.nullable(),
    validationIssues: z.array(z.string().trim().min(1).max(2_000)).max(500),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.status === 'eligible') {
      if (candidate.metadata === null) {
        context.addIssue({
          code: 'custom',
          path: ['metadata'],
          message: 'An eligible export candidate requires release metadata.',
        });
      }
      if (candidate.validationIssues.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['validationIssues'],
          message: 'An eligible export candidate cannot contain validation issues.',
        });
      }
    }
    if (candidate.status === 'blocked' && candidate.validationIssues.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['validationIssues'],
        message: 'A blocked export candidate requires validation issues.',
      });
    }
  });

export const exportReleaseDecisionInputSchema = z
  .object({
    action: z.enum(exportReleaseActionValues),
    expectedSnapshotDigest: sha256Schema,
    expectedArtifactCount: z.number().int().min(1).max(100),
    expectedDatasetVersion: z.string().trim().min(1).max(64),
    expectedSchemaVersion: z.string().trim().min(1).max(32),
    expectedGeneratedAt: z.iso.datetime({ offset: true }),
    decidedAt: z.iso.datetime({ offset: true }),
    reasonCode: reasonCodeSchema,
    publicSummary: z.string().trim().min(1).max(1_000).nullable(),
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (Date.parse(decision.decidedAt) < Date.parse(decision.expectedGeneratedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['decidedAt'],
        message: 'The export release decision cannot precede the generated snapshot.',
      });
    }
    if (decision.publicSummary === null && decision.internalNote === null) {
      context.addIssue({
        code: 'custom',
        path: ['internalNote'],
        message: 'An export release decision requires a public summary or internal note.',
      });
    }
  });

export type ExportReleaseMutationContext = z.infer<typeof exportReleaseMutationContextSchema>;
export type ExportReleaseCandidate = z.infer<typeof exportReleaseCandidateSchema>;
export type ExportReleaseDecisionInput = z.infer<typeof exportReleaseDecisionInputSchema>;
export type ExportReleaseAction = ExportReleaseDecisionInput['action'];

export interface ExportReleaseDecisionCommand {
  requestId: string;
  actorId: string;
  actorType: 'human' | 'system';
  action: ExportReleaseAction;
  snapshotDigest: string;
  artifactCount: number;
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: Date;
  candidateStatus: ExportReleaseCandidate['status'];
  validationIssues: string[];
  decidedAt: Date;
  reasonCode: string;
  publicSummary: string | null;
  internalNote: string | null;
  requestFingerprint: string;
}

export interface ExportReleaseDecisionReceipt {
  requestId: string;
  action: ExportReleaseAction;
  releaseStatus: 'approved' | 'rejected';
  snapshotDigest: string;
  artifactCount: number;
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: string;
  decidedAt: string;
  state: 'committed' | 'replayed';
}

export interface ExportReleaseDecisionBackend {
  commitDecision(command: ExportReleaseDecisionCommand): Promise<ExportReleaseDecisionReceipt>;
}

export type ExportReleaseDecisionErrorCode =
  | 'unauthorized'
  | 'invalid_decision'
  | 'validation_failed'
  | 'conflict'
  | 'backend_failure';

export class ExportReleaseDecisionError extends Error {
  readonly code: ExportReleaseDecisionErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ExportReleaseDecisionErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportReleaseDecisionError';
    this.code = code;
    this.issues = issues;
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function candidateMetadata(artifacts: PublicArtifactInput) {
  const result = publicVersionSchema.safeParse(artifacts['/version.json']);
  if (!result.success) return null;
  return {
    datasetVersion: result.data.datasetVersion,
    schemaVersion: result.data.schemaVersion,
    generatedAt: result.data.generatedAt,
  };
}

export async function prepareExportReleaseCandidate(
  artifacts: PublicArtifactInput,
): Promise<ExportReleaseCandidate> {
  const artifactCount = Object.keys(artifacts).length;
  const rawSnapshotDigest = await hashPublicArtifact(artifacts);
  const metadata = candidateMetadata(artifacts);

  try {
    const validated = await validatePublicArtifactSet(artifacts);
    return exportReleaseCandidateSchema.parse({
      status: 'eligible',
      snapshotDigest: await publicSnapshotDigest(validated),
      artifactCount,
      metadata,
      validationIssues: [],
    });
  } catch (error) {
    if (!(error instanceof PublicExportBoundaryError)) throw error;
    return exportReleaseCandidateSchema.parse({
      status: 'blocked',
      snapshotDigest: rawSnapshotDigest,
      artifactCount,
      metadata,
      validationIssues: [...error.issues],
    });
  }
}

function buildCommand(
  context: ExportReleaseMutationContext,
  input: ExportReleaseDecisionInput,
  candidate: ExportReleaseCandidate,
): ExportReleaseDecisionCommand {
  if (candidate.metadata === null) {
    throw new ExportReleaseDecisionError(
      'validation_failed',
      'The export candidate does not contain valid release metadata.',
      candidate.validationIssues,
    );
  }

  const validationIssues = [...candidate.validationIssues].sort();
  const requestFingerprint = JSON.stringify(
    stable({
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      ...input,
      candidateStatus: candidate.status,
      validationIssues,
    }),
  );

  return {
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    action: input.action,
    snapshotDigest: candidate.snapshotDigest,
    artifactCount: candidate.artifactCount,
    datasetVersion: candidate.metadata.datasetVersion,
    schemaVersion: candidate.metadata.schemaVersion,
    generatedAt: new Date(candidate.metadata.generatedAt),
    candidateStatus: candidate.status,
    validationIssues,
    decidedAt: new Date(input.decidedAt),
    reasonCode: input.reasonCode,
    publicSummary: input.publicSummary,
    internalNote: input.internalNote,
    requestFingerprint,
  };
}

function assertExpectedCandidate(
  input: ExportReleaseDecisionInput,
  candidate: ExportReleaseCandidate,
): void {
  const issues: string[] = [];
  if (candidate.snapshotDigest !== input.expectedSnapshotDigest) {
    issues.push('snapshotDigest');
  }
  if (candidate.artifactCount !== input.expectedArtifactCount) {
    issues.push('artifactCount');
  }
  if (candidate.metadata === null) {
    issues.push('releaseMetadata');
  } else {
    if (candidate.metadata.datasetVersion !== input.expectedDatasetVersion) {
      issues.push('datasetVersion');
    }
    if (candidate.metadata.schemaVersion !== input.expectedSchemaVersion) {
      issues.push('schemaVersion');
    }
    if (candidate.metadata.generatedAt !== input.expectedGeneratedAt) {
      issues.push('generatedAt');
    }
  }
  if (issues.length > 0) {
    throw new ExportReleaseDecisionError(
      'conflict',
      'The export candidate changed before the release decision.',
      issues,
    );
  }
  if (input.action === 'approve' && candidate.status !== 'eligible') {
    throw new ExportReleaseDecisionError(
      'validation_failed',
      'A blocked export candidate cannot be approved.',
      candidate.validationIssues,
    );
  }
}

export function createExportReleaseDecisionService(
  backend: ExportReleaseDecisionBackend,
  prepareCandidate: (
    artifacts: PublicArtifactInput,
  ) => Promise<ExportReleaseCandidate> = prepareExportReleaseCandidate,
) {
  return {
    async decide(
      context: ExportReleaseMutationContext,
      input: ExportReleaseDecisionInput,
      artifacts: PublicArtifactInput,
    ): Promise<ExportReleaseDecisionReceipt> {
      const contextResult = exportReleaseMutationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('export:release')) {
        throw new ExportReleaseDecisionError(
          'unauthorized',
          'The actor is not authorized to release public exports.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }

      const inputResult = exportReleaseDecisionInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new ExportReleaseDecisionError(
          'invalid_decision',
          'The export release decision is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }

      let candidate: ExportReleaseCandidate;
      try {
        candidate = exportReleaseCandidateSchema.parse(await prepareCandidate(artifacts));
      } catch (error) {
        if (error instanceof ExportReleaseDecisionError) throw error;
        throw new ExportReleaseDecisionError(
          'backend_failure',
          'The export candidate could not be validated.',
          [],
          { cause: error },
        );
      }

      assertExpectedCandidate(inputResult.data, candidate);

      try {
        return await backend.commitDecision(
          buildCommand(contextResult.data, inputResult.data, candidate),
        );
      } catch (error) {
        if (error instanceof ExportReleaseDecisionError) throw error;
        throw new ExportReleaseDecisionError(
          'backend_failure',
          'The export release decision was not committed.',
          [],
          { cause: error },
        );
      }
    },
  };
}
