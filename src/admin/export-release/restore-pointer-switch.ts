import { z } from 'zod';
import {
  exportRestorePointerInventorySchema,
  exportRestorePointerSwitchReceiptSchema,
  type ExportRestorePointerInventory,
  type ExportRestorePointerSwitchReceipt,
} from './restore-execution';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const exportRestorePointerExpectationSchema = z
  .object({
    pointerKey: z.string().trim().min(1).max(512),
    expectedCurrentEtag: z.string().trim().min(1).max(256),
  })
  .strict();

export const exportRestoreInspectedObjectSchema = z
  .object({
    key: z.string().trim().min(1).max(512),
    etag: z.string().trim().min(1).max(256),
    sha256: sha256Schema,
    contentType: z.string().trim().min(1).max(128),
    sizeBytes: z.number().int().min(1).max(25_000_000),
  })
  .strict();

export type ExportRestorePointerExpectation = z.infer<typeof exportRestorePointerExpectationSchema>;
export type ExportRestoreInspectedObject = z.infer<typeof exportRestoreInspectedObjectSchema>;

export interface ExportRestorePointerSwitchAdapter {
  inspectTargetObject(key: string): Promise<ExportRestoreInspectedObject | null>;
  replacePointer(args: {
    pointerKey: string;
    targetObjectKey: string;
    expectedCurrentEtag: string;
    targetEtag: string;
    switchedAt: string;
  }): Promise<ExportRestorePointerSwitchReceipt>;
}

export type ExportRestorePointerSwitchErrorCode =
  | 'invalid_inventory'
  | 'invalid_pointer_expectations'
  | 'target_missing'
  | 'target_mismatch'
  | 'pointer_expectation_mismatch'
  | 'switch_failed';

export class ExportRestorePointerSwitchError extends Error {
  readonly code: ExportRestorePointerSwitchErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ExportRestorePointerSwitchErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportRestorePointerSwitchError';
    this.code = code;
    this.issues = issues;
  }
}

function parseInventory(inventory: ExportRestorePointerInventory): ExportRestorePointerInventory {
  const result = exportRestorePointerInventorySchema.safeParse(inventory);
  if (!result.success) {
    throw new ExportRestorePointerSwitchError(
      'invalid_inventory',
      'The restore pointer inventory is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

function parseExpectations(
  expectations: ExportRestorePointerExpectation[],
  inventory: ExportRestorePointerInventory,
): Map<string, ExportRestorePointerExpectation> {
  const result = z.array(exportRestorePointerExpectationSchema).safeParse(expectations);
  if (!result.success) {
    throw new ExportRestorePointerSwitchError(
      'invalid_pointer_expectations',
      'The restore pointer expectations are invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const expected = new Map(result.data.map((item) => [item.pointerKey, item]));
  if (expected.size !== inventory.items.length) {
    throw new ExportRestorePointerSwitchError(
      'pointer_expectation_mismatch',
      'The restore pointer expectations do not cover the inventory.',
      ['pointerExpectations'],
    );
  }
  for (const item of inventory.items) {
    if (!expected.has(item.pointerKey)) {
      throw new ExportRestorePointerSwitchError(
        'pointer_expectation_mismatch',
        'The restore pointer expectations are missing an inventory pointer.',
        [item.pointerKey],
      );
    }
  }
  return expected;
}

function assertTargetMatchesInventory(
  inspected: ExportRestoreInspectedObject,
  inventoryItem: ExportRestorePointerInventory['items'][number],
): void {
  if (
    inspected.key !== inventoryItem.targetObjectKey ||
    inspected.etag !== inventoryItem.targetEtag ||
    inspected.sha256 !== inventoryItem.targetSha256 ||
    inspected.contentType !== inventoryItem.contentType ||
    inspected.sizeBytes !== inventoryItem.sizeBytes
  ) {
    throw new ExportRestorePointerSwitchError(
      'target_mismatch',
      'The target object no longer matches the restore inventory.',
      [inventoryItem.targetObjectKey],
    );
  }
}

export async function switchExportRestorePointers(args: {
  inventory: ExportRestorePointerInventory;
  pointerExpectations: ExportRestorePointerExpectation[];
  adapter: ExportRestorePointerSwitchAdapter;
  switchedAt: string;
}): Promise<ExportRestorePointerSwitchReceipt[]> {
  const inventory = parseInventory(args.inventory);
  const expectations = parseExpectations(args.pointerExpectations, inventory);
  const receipts: ExportRestorePointerSwitchReceipt[] = [];

  for (const item of inventory.items) {
    const inspected = await args.adapter.inspectTargetObject(item.targetObjectKey);
    if (inspected === null) {
      throw new ExportRestorePointerSwitchError(
        'target_missing',
        'The target object is missing before restore pointer switching.',
        [item.targetObjectKey],
      );
    }
    assertTargetMatchesInventory(inspected, item);
    const expectation = expectations.get(item.pointerKey);
    if (expectation === undefined) {
      throw new ExportRestorePointerSwitchError(
        'pointer_expectation_mismatch',
        'The restore pointer expectation disappeared during execution.',
        [item.pointerKey],
      );
    }

    let receipt: ExportRestorePointerSwitchReceipt;
    try {
      receipt = await args.adapter.replacePointer({
        pointerKey: item.pointerKey,
        targetObjectKey: item.targetObjectKey,
        expectedCurrentEtag: expectation.expectedCurrentEtag,
        targetEtag: item.targetEtag,
        switchedAt: args.switchedAt,
      });
    } catch (error) {
      throw new ExportRestorePointerSwitchError(
        'switch_failed',
        'The restore pointer switch failed.',
        [item.pointerKey],
        { cause: error },
      );
    }
    const receiptResult = exportRestorePointerSwitchReceiptSchema.safeParse(receipt);
    if (!receiptResult.success) {
      throw new ExportRestorePointerSwitchError(
        'switch_failed',
        'The restore pointer switch returned an invalid receipt.',
        receiptResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    receipts.push(receiptResult.data);
  }

  return receipts;
}
