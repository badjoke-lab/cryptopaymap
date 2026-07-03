import { z } from 'zod';
import {
  canonicalPublicJson,
  hashPublicArtifact,
  type PublicArtifactInput,
} from '../../publication/export-boundary';
import {
  exportReleaseCandidateSchema,
  prepareExportReleaseCandidate,
  type ExportReleaseCandidate,
} from './decision';
import type { ExportArtifactSource } from './artifact-source';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const exportReleaseReadContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.literal('export:release')).min(1),
  })
  .strict();

export const exportReleaseQueueQuerySchema = z
  .object({
    releaseStatus: z.enum(['approved', 'rejected']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const exportReleaseDecisionSummarySchema = z
  .object({
    requestId: z.uuid(),
    action: z.enum(['approve', 'reject']),
    releaseStatus: z.enum(['approved', 'rejected']),
    snapshotDigest: sha256Schema,
    artifactCount: z.number().int().min(1).max(100),
    datasetVersion: z.string().trim().min(1).max(64),
    schemaVersion: z.string().trim().min(1).max(32),
    generatedAt: z.iso.datetime({ offset: true }),
    candidateStatus: z.enum(['eligible', 'blocked']),
    validationIssueCount: z.number().int().min(0).max(500),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    reasonCode: z.string().trim().min(1).max(96),
    publicSummary: z.string().nullable(),
    decidedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const exportReleaseCandidateSummarySchema = exportReleaseCandidateSchema.safeExtend({
  validationIssueCount: z.number().int().min(0).max(500),
});

export const exportReleaseQueueResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    query: exportReleaseQueueQuerySchema,
    currentCandidate: exportReleaseCandidateSummarySchema.nullable(),
    recentDecisions: z.array(exportReleaseDecisionSummarySchema),
    hasMore: z.boolean(),
  })
  .strict();

export const exportReleaseArtifactSummarySchema = z
  .object({
    path: z.string().min(1).max(256),
    mediaType: z.enum(['application/json', 'application/geo+json']),
    sha256: sha256Schema,
    canonicalByteSize: z.number().int().positive(),
    recordCount: z.number().int().min(0).nullable(),
  })
  .strict();

export const exportReleaseDetailResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    candidate: exportReleaseCandidateSchema,
    artifacts: z.array(exportReleaseArtifactSummarySchema).max(100),
    decisions: z.array(exportReleaseDecisionSummarySchema).max(100),
  })
  .strict();

export type ExportReleaseReadContext = z.infer<typeof exportReleaseReadContextSchema>;
export type ExportReleaseQueueQuery = z.infer<typeof exportReleaseQueueQuerySchema>;
export type ExportReleaseDecisionSummary = z.infer<typeof exportReleaseDecisionSummarySchema>;
export type ExportReleaseQueueResponse = z.infer<typeof exportReleaseQueueResponseSchema>;
export type ExportReleaseArtifactSummary = z.infer<typeof exportReleaseArtifactSummarySchema>;
export type ExportReleaseDetailResponse = z.infer<typeof exportReleaseDetailResponseSchema>;

export interface ExportReleaseWorkspaceBackend {
  loadRecentDecisions(
    query: ExportReleaseQueueQuery,
  ): Promise<{ items: ExportReleaseDecisionSummary[]; hasMore: boolean }>;
  loadDecisionsForSnapshot(
    snapshotDigest: string,
    limit: number,
  ): Promise<ExportReleaseDecisionSummary[]>;
}

export type ExportReleaseWorkspaceErrorCode =
  | 'unauthorized'
  | 'invalid_query'
  | 'invalid_digest'
  | 'not_found'
  | 'backend_failure';

export class ExportReleaseWorkspaceError extends Error {
  readonly code: ExportReleaseWorkspaceErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ExportReleaseWorkspaceErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportReleaseWorkspaceError';
    this.code = code;
    this.issues = issues;
  }
}

function authorize(context: ExportReleaseReadContext): void {
  const result = exportReleaseReadContextSchema.safeParse(context);
  if (!result.success || !context.capabilities.includes('export:release')) {
    throw new ExportReleaseWorkspaceError(
      'unauthorized',
      'The actor is not authorized to read export release data.',
      result.success
        ? []
        : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
}

export function parseExportReleaseQueueQuery(url: URL): ExportReleaseQueueQuery {
  const result = exportReleaseQueueQuerySchema.safeParse({
    releaseStatus: url.searchParams.get('releaseStatus') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!result.success) {
    throw new ExportReleaseWorkspaceError(
      'invalid_query',
      'The export release queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

async function loadCandidate(
  source: ExportArtifactSource,
): Promise<{ candidate: ExportReleaseCandidate; artifacts: PublicArtifactInput } | null> {
  const artifacts = await source.loadArtifacts();
  if (artifacts === null) return null;
  return {
    candidate: await prepareExportReleaseCandidate(artifacts),
    artifacts,
  };
}

function recordCount(path: string, value: unknown): number | null {
  if (path === '/version.json' || path === '/data/stats.json') return 1;
  if (path === '/data/places.geojson') {
    const features = (value as { features?: unknown }).features;
    return Array.isArray(features) ? features.length : null;
  }
  const records = (value as { records?: unknown }).records;
  return Array.isArray(records) ? records.length : null;
}

async function summarizeArtifacts(
  artifacts: PublicArtifactInput,
): Promise<ExportReleaseArtifactSummary[]> {
  return Promise.all(
    Object.entries(artifacts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([path, value]) => ({
        path,
        mediaType:
          path === '/data/places.geojson'
            ? ('application/geo+json' as const)
            : ('application/json' as const),
        sha256: await hashPublicArtifact(value),
        canonicalByteSize: new TextEncoder().encode(canonicalPublicJson(value)).byteLength,
        recordCount: recordCount(path, value),
      })),
  );
}

export async function loadExportReleaseQueue(
  context: ExportReleaseReadContext,
  source: ExportArtifactSource,
  backend: ExportReleaseWorkspaceBackend,
  query: ExportReleaseQueueQuery,
  asOf: Date,
): Promise<ExportReleaseQueueResponse> {
  authorize(context);
  try {
    const [loadedCandidate, decisions] = await Promise.all([
      loadCandidate(source),
      backend.loadRecentDecisions(query),
    ]);
    return exportReleaseQueueResponseSchema.parse({
      generatedAt: asOf.toISOString(),
      query,
      currentCandidate:
        loadedCandidate === null
          ? null
          : {
              ...loadedCandidate.candidate,
              validationIssueCount: loadedCandidate.candidate.validationIssues.length,
            },
      recentDecisions: decisions.items,
      hasMore: decisions.hasMore,
    });
  } catch (error) {
    if (error instanceof ExportReleaseWorkspaceError) throw error;
    throw new ExportReleaseWorkspaceError(
      'backend_failure',
      'The export release queue could not be loaded.',
      [],
      { cause: error },
    );
  }
}

export async function loadExportReleaseDetail(
  context: ExportReleaseReadContext,
  source: ExportArtifactSource,
  backend: ExportReleaseWorkspaceBackend,
  snapshotDigest: string,
  asOf: Date,
): Promise<ExportReleaseDetailResponse> {
  authorize(context);
  const digestResult = sha256Schema.safeParse(snapshotDigest);
  if (!digestResult.success) {
    throw new ExportReleaseWorkspaceError(
      'invalid_digest',
      'The export snapshot digest is invalid.',
    );
  }

  try {
    const loaded = await loadCandidate(source);
    if (loaded === null || loaded.candidate.snapshotDigest !== digestResult.data) {
      throw new ExportReleaseWorkspaceError(
        'not_found',
        'The export release candidate was not found.',
      );
    }
    const [artifacts, decisions] = await Promise.all([
      summarizeArtifacts(loaded.artifacts),
      backend.loadDecisionsForSnapshot(digestResult.data, 100),
    ]);
    return exportReleaseDetailResponseSchema.parse({
      generatedAt: asOf.toISOString(),
      candidate: loaded.candidate,
      artifacts,
      decisions,
    });
  } catch (error) {
    if (error instanceof ExportReleaseWorkspaceError) throw error;
    throw new ExportReleaseWorkspaceError(
      'backend_failure',
      'The export release detail could not be loaded.',
      [],
      { cause: error },
    );
  }
}
