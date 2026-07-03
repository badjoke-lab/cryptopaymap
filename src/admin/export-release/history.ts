import { z } from 'zod';
import type { ExportReleaseReadContext } from './workspace';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const exportReleaseHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const exportReleaseHistoryItemSchema = z
  .object({
    requestId: z.uuid(),
    approvalRequestId: z.uuid(),
    snapshotDigest: sha256Schema,
    datasetVersion: z.string().trim().min(1).max(64),
    schemaVersion: z.string().trim().min(1).max(32),
    generatedAt: z.iso.datetime({ offset: true }),
    publishedAt: z.iso.datetime({ offset: true }),
    previousSnapshotDigest: sha256Schema.nullable(),
    pointerKey: z.string().trim().min(1).max(512),
    releasePrefix: z.string().trim().min(1).max(512),
    artifactCount: z.number().int().min(1).max(100),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    reasonCode: z.string().trim().min(1).max(96),
    isCurrent: z.boolean(),
  })
  .strict();

export const exportReleaseHistoryResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    query: exportReleaseHistoryQuerySchema,
    currentSnapshotDigest: sha256Schema.nullable(),
    items: z.array(exportReleaseHistoryItemSchema).max(100),
    hasMore: z.boolean(),
  })
  .strict();

export type ExportReleaseHistoryQuery = z.infer<typeof exportReleaseHistoryQuerySchema>;
export type ExportReleaseHistoryItem = z.infer<typeof exportReleaseHistoryItemSchema>;
export type ExportReleaseHistoryResponse = z.infer<
  typeof exportReleaseHistoryResponseSchema
>;

export interface ExportReleaseHistoryBackend {
  loadReleaseHistory(
    query: ExportReleaseHistoryQuery,
  ): Promise<{ items: ExportReleaseHistoryItem[]; hasMore: boolean }>;
}

export class ExportReleaseHistoryError extends Error {
  readonly code: 'unauthorized' | 'invalid_query' | 'backend_failure';

  constructor(
    code: 'unauthorized' | 'invalid_query' | 'backend_failure',
    message: string,
  ) {
    super(message);
    this.name = 'ExportReleaseHistoryError';
    this.code = code;
  }
}

export function parseExportReleaseHistoryQuery(url: URL): ExportReleaseHistoryQuery {
  const result = exportReleaseHistoryQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!result.success) {
    throw new ExportReleaseHistoryError(
      'invalid_query',
      'The release history query is invalid.',
    );
  }
  return result.data;
}

export async function loadExportReleaseHistory(
  context: ExportReleaseReadContext,
  backend: ExportReleaseHistoryBackend,
  query: ExportReleaseHistoryQuery,
  asOf: Date,
): Promise<ExportReleaseHistoryResponse> {
  if (!context.capabilities.includes('export:release')) {
    throw new ExportReleaseHistoryError(
      'unauthorized',
      'The actor cannot read release history.',
    );
  }
  try {
    const history = await backend.loadReleaseHistory(query);
    const currentSnapshotDigest = history.items[0]?.snapshotDigest ?? null;
    return exportReleaseHistoryResponseSchema.parse({
      generatedAt: asOf.toISOString(),
      query,
      currentSnapshotDigest,
      items: history.items.map((item) => ({
        ...item,
        isCurrent: item.snapshotDigest === currentSnapshotDigest,
      })),
      hasMore: history.hasMore,
    });
  } catch (error) {
    if (error instanceof ExportReleaseHistoryError) throw error;
    throw new ExportReleaseHistoryError(
      'backend_failure',
      'The release history could not be loaded.',
    );
  }
}
