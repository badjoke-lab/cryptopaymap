import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExportPublicationMutationContext } from './publication-contract';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

export const exportRestorePointerInventoryItemSchema = z
  .object({
    pointerKey: z.string().trim().min(1).max(512),
    targetObjectKey: z.string().trim().min(1).max(512),
    targetSha256: sha256Schema,
    targetEtag: z.string().trim().min(1).max(256),
    contentType: z.string().trim().min(1).max(128),
    sizeBytes: z.number().int().min(1).max(25_000_000),
  })
  .strict();

export const exportRestorePointerInventorySchema = z
  .object({
    targetSnapshotDigest: sha256Schema,
    previousActiveSnapshotDigest: sha256Schema,
    targetDatasetVersion: z.string().trim().min(1).max(64),
    targetReleasePrefix: z.string().trim().min(1).max(512),
    activePointerKey: z.string().trim().min(1).max(512),
    items: z.array(exportRestorePointerInventoryItemSchema).min(1).max(100),
  })
  .strict()
  .superRefine((inventory, context) => {
    if (inventory.targetSnapshotDigest === inventory.previousActiveSnapshotDigest) {
      context.addIssue({
        code: 'custom',
        path: ['targetSnapshotDigest'],
        message: 'The target snapshot is already active.',
      });
    }
    const keys = new Set<string>();
    for (const [index, item] of inventory.items.entries()) {
      if (keys.has(item.pointerKey)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'pointerKey'],
          message: 'Pointer inventory contains duplicate pointer keys.',
        });
      }
      keys.add(item.pointerKey);
      if (!item.targetObjectKey.startsWith(inventory.targetReleasePrefix)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'targetObjectKey'],
          message: 'Pointer target must be inside the target release prefix.',
        });
      }
    }
  });

export const exportRestorePointerSwitchReceiptSchema = z
  .object({
    pointerKey: z.string().trim().min(1).max(512),
    previousEtag: z.string().trim().min(1).max(256),
    newEtag: z.string().trim().min(1).max(256),
    switchedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const exportRestoreExecutionRecordSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    previousActiveSnapshotDigest: sha256Schema,
    restoredSnapshotDigest: sha256Schema,
    restoredDatasetVersion: z.string().trim().min(1).max(64),
    reasonCode: reasonCodeSchema,
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
    restoredAt: z.iso.datetime({ offset: true }),
    inventoryFingerprint: sha256Schema,
    requestFingerprint: sha256Schema,
    pointerSwitches: z.array(exportRestorePointerSwitchReceiptSchema).min(1).max(100),
  })
  .strict();

export type ExportRestorePointerInventoryItem = z.infer<
  typeof exportRestorePointerInventoryItemSchema
>;
export type ExportRestorePointerInventory = z.infer<typeof exportRestorePointerInventorySchema>;
export type ExportRestorePointerSwitchReceipt = z.infer<
  typeof exportRestorePointerSwitchReceiptSchema
>;
export type ExportRestoreExecutionRecord = z.infer<typeof exportRestoreExecutionRecordSchema>;

export interface ExportRestoreExecutionInput {
  targetSnapshotDigest: string;
  expectedActiveSnapshotDigest: string;
  restoredAt: string;
  reasonCode: string;
  internalNote: string | null;
}

export interface ExportRestoreExecutionBackend {
  readRestoreRecord(requestId: string): Promise<ExportRestoreExecutionRecord | null>;
  writeRestoreRecord(record: ExportRestoreExecutionRecord): Promise<ExportRestoreExecutionRecord>;
}

export type ExportRestoreExecutionErrorCode =
  | 'unauthorized'
  | 'invalid_inventory'
  | 'invalid_switch_receipt'
  | 'active_mismatch'
  | 'switch_count_mismatch'
  | 'pointer_mismatch'
  | 'request_conflict'
  | 'backend_failure';

export class ExportRestoreExecutionError extends Error {
  readonly code: ExportRestoreExecutionErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ExportRestoreExecutionErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportRestoreExecutionError';
    this.code = code;
    this.issues = issues;
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

export function exportRestoreInventoryFingerprint(
  inventory: ExportRestorePointerInventory,
): string {
  return createHash('sha256').update(canonicalJson(inventory)).digest('hex');
}

export function exportRestoreRequestFingerprint(input: {
  requestId: string;
  actorId: string;
  targetSnapshotDigest: string;
  expectedActiveSnapshotDigest: string;
  restoredAt: string;
  reasonCode: string;
  inventoryFingerprint: string;
}): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

function assertExecutionAuthorization(context: ExportPublicationMutationContext): void {
  if (!context.capabilities.includes('export:publish')) {
    throw new ExportRestoreExecutionError(
      'unauthorized',
      'The actor is not authorized to record export restore execution.',
    );
  }
}

function assertSwitchesMatchInventory(
  inventory: ExportRestorePointerInventory,
  pointerSwitches: ExportRestorePointerSwitchReceipt[],
): void {
  if (pointerSwitches.length !== inventory.items.length) {
    throw new ExportRestoreExecutionError(
      'switch_count_mismatch',
      'The restore pointer switch count does not match the pointer inventory.',
      ['pointerSwitches'],
    );
  }
  const pointerKeys = new Set(inventory.items.map((item) => item.pointerKey));
  for (const pointerSwitch of pointerSwitches) {
    if (!pointerKeys.has(pointerSwitch.pointerKey)) {
      throw new ExportRestoreExecutionError(
        'pointer_mismatch',
        'The restore pointer switch receipt is not part of the target inventory.',
        [pointerSwitch.pointerKey],
      );
    }
  }
}

export function createExportRestoreExecutionService(backend: ExportRestoreExecutionBackend) {
  return {
    async recordExecution(args: {
      context: ExportPublicationMutationContext;
      input: ExportRestoreExecutionInput;
      inventory: ExportRestorePointerInventory;
      pointerSwitches: ExportRestorePointerSwitchReceipt[];
    }): Promise<ExportRestoreExecutionRecord> {
      assertExecutionAuthorization(args.context);
      const inventoryResult = exportRestorePointerInventorySchema.safeParse(args.inventory);
      if (!inventoryResult.success) {
        throw new ExportRestoreExecutionError(
          'invalid_inventory',
          'The restore pointer inventory is invalid.',
          inventoryResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      const switchResult = z.array(exportRestorePointerSwitchReceiptSchema).safeParse(args.pointerSwitches);
      if (!switchResult.success) {
        throw new ExportRestoreExecutionError(
          'invalid_switch_receipt',
          'The restore pointer switch receipt is invalid.',
          switchResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      if (inventoryResult.data.previousActiveSnapshotDigest !== args.input.expectedActiveSnapshotDigest) {
        throw new ExportRestoreExecutionError(
          'active_mismatch',
          'The restore inventory does not match the expected active snapshot.',
          ['expectedActiveSnapshotDigest'],
        );
      }
      assertSwitchesMatchInventory(inventoryResult.data, switchResult.data);

      const inventoryFingerprint = exportRestoreInventoryFingerprint(inventoryResult.data);
      const requestFingerprint = exportRestoreRequestFingerprint({
        requestId: args.context.requestId,
        actorId: args.context.actorId,
        targetSnapshotDigest: args.input.targetSnapshotDigest,
        expectedActiveSnapshotDigest: args.input.expectedActiveSnapshotDigest,
        restoredAt: args.input.restoredAt,
        reasonCode: args.input.reasonCode,
        inventoryFingerprint,
      });
      let existing: ExportRestoreExecutionRecord | null;
      try {
        existing = await backend.readRestoreRecord(args.context.requestId);
      } catch (error) {
        throw new ExportRestoreExecutionError(
          'backend_failure',
          'The restore execution record could not be read.',
          [],
          { cause: error },
        );
      }
      if (existing !== null) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new ExportRestoreExecutionError(
            'request_conflict',
            'The restore request ID was reused with different content.',
            ['requestFingerprint'],
          );
        }
        return existing;
      }

      const record = exportRestoreExecutionRecordSchema.parse({
        requestId: args.context.requestId,
        actorId: args.context.actorId,
        actorType: args.context.actorType,
        previousActiveSnapshotDigest: inventoryResult.data.previousActiveSnapshotDigest,
        restoredSnapshotDigest: inventoryResult.data.targetSnapshotDigest,
        restoredDatasetVersion: inventoryResult.data.targetDatasetVersion,
        reasonCode: args.input.reasonCode,
        internalNote: args.input.internalNote,
        restoredAt: args.input.restoredAt,
        inventoryFingerprint,
        requestFingerprint,
        pointerSwitches: switchResult.data,
      });
      try {
        return await backend.writeRestoreRecord(record);
      } catch (error) {
        throw new ExportRestoreExecutionError(
          'backend_failure',
          'The restore execution record could not be written.',
          [],
          { cause: error },
        );
      }
    },
  };
}
