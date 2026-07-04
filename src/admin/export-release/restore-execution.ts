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
    if (!keys.has(inventory.activePointerKey)) {
      context.addIssue({
        code: 'custom',
        path: ['activePointerKey'],
        message: 'Pointer inventory must include the active pointer key.',
      });
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
  | 'target_snapshot_mismatch'
  | 'switch_count_mismatch'
  | 'pointer_mismatch'
  | 'target_etag_mismatch'
  | 'switch_time_mismatch'
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

interface PreparedRestoreExecutionIdentity {
  inventory: ExportRestorePointerInventory;
  inventoryFingerprint: string;
  requestFingerprint: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function exportRestoreInventoryFingerprint(
  inventory: ExportRestorePointerInventory,
): Promise<string> {
  return sha256Hex(canonicalJson(inventory));
}

export async function exportRestoreRequestFingerprint(input: {
  requestId: string;
  actorId: string;
  actorType: 'human' | 'system';
  targetSnapshotDigest: string;
  expectedActiveSnapshotDigest: string;
  restoredAt: string;
  reasonCode: string;
  internalNote: string | null;
  inventoryFingerprint: string;
}): Promise<string> {
  return sha256Hex(canonicalJson(input));
}

function assertExecutionAuthorization(context: ExportPublicationMutationContext): void {
  if (!context.capabilities.includes('export:publish')) {
    throw new ExportRestoreExecutionError(
      'unauthorized',
      'The actor is not authorized to record export restore execution.',
    );
  }
}

async function prepareExecutionIdentity(args: {
  context: ExportPublicationMutationContext;
  input: ExportRestoreExecutionInput;
  inventory: ExportRestorePointerInventory;
}): Promise<PreparedRestoreExecutionIdentity> {
  assertExecutionAuthorization(args.context);
  const inventoryResult = exportRestorePointerInventorySchema.safeParse(args.inventory);
  if (!inventoryResult.success) {
    throw new ExportRestoreExecutionError(
      'invalid_inventory',
      'The restore pointer inventory is invalid.',
      inventoryResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  if (
    inventoryResult.data.previousActiveSnapshotDigest !== args.input.expectedActiveSnapshotDigest
  ) {
    throw new ExportRestoreExecutionError(
      'active_mismatch',
      'The restore inventory does not match the expected active snapshot.',
      ['expectedActiveSnapshotDigest'],
    );
  }
  if (inventoryResult.data.targetSnapshotDigest !== args.input.targetSnapshotDigest) {
    throw new ExportRestoreExecutionError(
      'target_snapshot_mismatch',
      'The restore inventory does not match the requested target snapshot.',
      ['targetSnapshotDigest'],
    );
  }

  const inventoryFingerprint = await exportRestoreInventoryFingerprint(inventoryResult.data);
  const requestFingerprint = await exportRestoreRequestFingerprint({
    requestId: args.context.requestId,
    actorId: args.context.actorId,
    actorType: args.context.actorType,
    targetSnapshotDigest: args.input.targetSnapshotDigest,
    expectedActiveSnapshotDigest: args.input.expectedActiveSnapshotDigest,
    restoredAt: args.input.restoredAt,
    reasonCode: args.input.reasonCode,
    internalNote: args.input.internalNote,
    inventoryFingerprint,
  });
  return {
    inventory: inventoryResult.data,
    inventoryFingerprint,
    requestFingerprint,
  };
}

function assertSwitchesMatchInventory(
  inventory: ExportRestorePointerInventory,
  pointerSwitches: ExportRestorePointerSwitchReceipt[],
  restoredAt: string,
): void {
  if (pointerSwitches.length !== inventory.items.length) {
    throw new ExportRestoreExecutionError(
      'switch_count_mismatch',
      'The restore pointer switch count does not match the pointer inventory.',
      ['pointerSwitches'],
    );
  }
  const inventoryItems = new Map(inventory.items.map((item) => [item.pointerKey, item]));
  for (const pointerSwitch of pointerSwitches) {
    const item = inventoryItems.get(pointerSwitch.pointerKey);
    if (item === undefined) {
      throw new ExportRestoreExecutionError(
        'pointer_mismatch',
        'The restore pointer switch receipt is not part of the target inventory.',
        [pointerSwitch.pointerKey],
      );
    }
    if (pointerSwitch.newEtag !== item.targetEtag) {
      throw new ExportRestoreExecutionError(
        'target_etag_mismatch',
        'The restore pointer switch receipt does not match the target object ETag.',
        [pointerSwitch.pointerKey],
      );
    }
    if (pointerSwitch.switchedAt !== restoredAt) {
      throw new ExportRestoreExecutionError(
        'switch_time_mismatch',
        'The restore pointer switch receipt time does not match the restore operation time.',
        [pointerSwitch.pointerKey],
      );
    }
  }
}

async function readExistingExecution(
  backend: ExportRestoreExecutionBackend,
  requestId: string,
  requestFingerprint: string,
): Promise<ExportRestoreExecutionRecord | null> {
  let existing: ExportRestoreExecutionRecord | null;
  try {
    existing = await backend.readRestoreRecord(requestId);
  } catch (error) {
    throw new ExportRestoreExecutionError(
      'backend_failure',
      'The restore execution record could not be read.',
      [],
      { cause: error },
    );
  }
  if (existing !== null && existing.requestFingerprint !== requestFingerprint) {
    throw new ExportRestoreExecutionError(
      'request_conflict',
      'The restore request ID was reused with different content.',
      ['requestFingerprint'],
    );
  }
  return existing;
}

export function createExportRestoreExecutionService(backend: ExportRestoreExecutionBackend) {
  return {
    async findReplay(args: {
      context: ExportPublicationMutationContext;
      input: ExportRestoreExecutionInput;
      inventory: ExportRestorePointerInventory;
    }): Promise<ExportRestoreExecutionRecord | null> {
      const identity = await prepareExecutionIdentity(args);
      return readExistingExecution(backend, args.context.requestId, identity.requestFingerprint);
    },

    async recordExecution(args: {
      context: ExportPublicationMutationContext;
      input: ExportRestoreExecutionInput;
      inventory: ExportRestorePointerInventory;
      pointerSwitches: ExportRestorePointerSwitchReceipt[];
    }): Promise<ExportRestoreExecutionRecord> {
      const identity = await prepareExecutionIdentity(args);
      const switchResult = z
        .array(exportRestorePointerSwitchReceiptSchema)
        .safeParse(args.pointerSwitches);
      if (!switchResult.success) {
        throw new ExportRestoreExecutionError(
          'invalid_switch_receipt',
          'The restore pointer switch receipt is invalid.',
          switchResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      assertSwitchesMatchInventory(identity.inventory, switchResult.data, args.input.restoredAt);

      const existing = await readExistingExecution(
        backend,
        args.context.requestId,
        identity.requestFingerprint,
      );
      if (existing !== null) return existing;

      const record = exportRestoreExecutionRecordSchema.parse({
        requestId: args.context.requestId,
        actorId: args.context.actorId,
        actorType: args.context.actorType,
        previousActiveSnapshotDigest: identity.inventory.previousActiveSnapshotDigest,
        restoredSnapshotDigest: identity.inventory.targetSnapshotDigest,
        restoredDatasetVersion: identity.inventory.targetDatasetVersion,
        reasonCode: args.input.reasonCode,
        internalNote: args.input.internalNote,
        restoredAt: args.input.restoredAt,
        inventoryFingerprint: identity.inventoryFingerprint,
        requestFingerprint: identity.requestFingerprint,
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
