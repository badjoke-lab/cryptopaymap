import { z } from 'zod';
import type { ExportPublicationMutationContext } from './publication-contract';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

export const exportRestoreInputSchema = z
  .object({
    targetSnapshotDigest: sha256Schema,
    expectedActiveSnapshotDigest: sha256Schema,
    restoredAt: z.iso.datetime({ offset: true }),
    reasonCode: reasonCodeSchema,
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.targetSnapshotDigest === input.expectedActiveSnapshotDigest) {
      context.addIssue({
        code: 'custom',
        path: ['targetSnapshotDigest'],
        message: 'The target snapshot is already active.',
      });
    }
  });

export const exportRestoreSnapshotSchema = z
  .object({
    snapshotDigest: sha256Schema,
    datasetVersion: z.string().trim().min(1).max(64),
    schemaVersion: z.string().trim().min(1).max(32),
    generatedAt: z.iso.datetime({ offset: true }),
    publishedAt: z.iso.datetime({ offset: true }),
    pointerKey: z.string().trim().min(1).max(512),
    releasePrefix: z.string().trim().min(1).max(512),
    artifactCount: z.number().int().min(1).max(100),
    hasPointerInventory: z.boolean(),
  })
  .strict();

export const exportRestoreReceiptSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    targetSnapshotDigest: sha256Schema,
    previousActiveSnapshotDigest: sha256Schema,
    restoredAt: z.iso.datetime({ offset: true }),
    reasonCode: reasonCodeSchema,
    state: z.enum(['blocked_missing_pointer_inventory', 'blocked_restore_execution_unavailable']),
    issues: z.array(z.string().trim().min(1)).min(1).max(20),
  })
  .strict();

export type ExportRestoreInput = z.infer<typeof exportRestoreInputSchema>;
export type ExportRestoreSnapshot = z.infer<typeof exportRestoreSnapshotSchema>;
export type ExportRestoreReceipt = z.infer<typeof exportRestoreReceiptSchema>;

export interface ExportRestoreBackend {
  loadActiveSnapshot(): Promise<ExportRestoreSnapshot | null>;
  loadSnapshot(snapshotDigest: string): Promise<ExportRestoreSnapshot | null>;
}

export type ExportRestoreErrorCode =
  | 'unauthorized'
  | 'invalid_restore'
  | 'active_not_found'
  | 'target_not_found'
  | 'active_mismatch'
  | 'backend_failure';

export class ExportRestoreError extends Error {
  readonly code: ExportRestoreErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ExportRestoreErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportRestoreError';
    this.code = code;
    this.issues = issues;
  }
}

function assertRestoreAuthorization(context: ExportPublicationMutationContext): void {
  if (!context.capabilities.includes('export:publish')) {
    throw new ExportRestoreError('unauthorized', 'The actor is not authorized to restore exports.');
  }
}

export function createExportRestoreService(backend: ExportRestoreBackend) {
  return {
    async prepareRestore(
      context: ExportPublicationMutationContext,
      input: ExportRestoreInput,
    ): Promise<ExportRestoreReceipt> {
      assertRestoreAuthorization(context);
      const inputResult = exportRestoreInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new ExportRestoreError(
          'invalid_restore',
          'The export restore request is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }

      let active: ExportRestoreSnapshot | null;
      let target: ExportRestoreSnapshot | null;
      try {
        active = await backend.loadActiveSnapshot();
        target = await backend.loadSnapshot(inputResult.data.targetSnapshotDigest);
      } catch (error) {
        throw new ExportRestoreError(
          'backend_failure',
          'The export restore history could not be loaded.',
          [],
          { cause: error },
        );
      }

      if (active === null) {
        throw new ExportRestoreError('active_not_found', 'No active export release exists.');
      }
      if (target === null) {
        throw new ExportRestoreError(
          'target_not_found',
          'The target export release was not found.',
        );
      }
      if (active.snapshotDigest !== inputResult.data.expectedActiveSnapshotDigest) {
        throw new ExportRestoreError(
          'active_mismatch',
          'The active export release changed before restore preparation.',
          ['expectedActiveSnapshotDigest'],
        );
      }
      if (!target.hasPointerInventory) {
        return exportRestoreReceiptSchema.parse({
          requestId: context.requestId,
          actorId: context.actorId,
          targetSnapshotDigest: target.snapshotDigest,
          previousActiveSnapshotDigest: active.snapshotDigest,
          restoredAt: inputResult.data.restoredAt,
          reasonCode: inputResult.data.reasonCode,
          state: 'blocked_missing_pointer_inventory',
          issues: ['targetPointerInventoryMissing'],
        });
      }

      return exportRestoreReceiptSchema.parse({
        requestId: context.requestId,
        actorId: context.actorId,
        targetSnapshotDigest: target.snapshotDigest,
        previousActiveSnapshotDigest: active.snapshotDigest,
        restoredAt: inputResult.data.restoredAt,
        reasonCode: inputResult.data.reasonCode,
        state: 'blocked_restore_execution_unavailable',
        issues: ['restoreExecutionUnavailable'],
      });
    },
  };
}
