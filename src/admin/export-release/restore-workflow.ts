import { z } from 'zod';
import type { ExportPublicationMutationContext } from './publication-contract';
import {
  createExportRestoreExecutionService,
  ExportRestoreExecutionError,
  exportRestorePointerInventorySchema,
  type ExportRestoreExecutionBackend,
  type ExportRestoreExecutionInput,
  type ExportRestoreExecutionRecord,
  type ExportRestorePointerInventory,
  type ExportRestorePointerSwitchReceipt,
} from './restore-execution';
import {
  switchExportRestorePointers,
  type ExportRestorePointerExpectation,
  type ExportRestorePointerSwitchAdapter,
} from './restore-pointer-switch';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

const restoreWorkflowInputSchema = z
  .object({
    targetSnapshotDigest: sha256Schema,
    expectedActiveSnapshotDigest: sha256Schema,
    restoredAt: z.iso.datetime({ offset: true }),
    reasonCode: reasonCodeSchema,
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict();

export type ExportRestoreWorkflowErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'restore_record_read_failed'
  | 'replay_validation_failed'
  | 'pointer_switch_failed'
  | 'execution_record_failed_after_switch';

export class ExportRestoreWorkflowError extends Error {
  readonly code: ExportRestoreWorkflowErrorCode;
  readonly issues: readonly string[];
  readonly pointerSwitches: readonly ExportRestorePointerSwitchReceipt[];

  constructor(
    code: ExportRestoreWorkflowErrorCode,
    message: string,
    issues: readonly string[] = [],
    pointerSwitches: readonly ExportRestorePointerSwitchReceipt[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportRestoreWorkflowError';
    this.code = code;
    this.issues = issues;
    this.pointerSwitches = pointerSwitches;
  }
}

function assertAuthorized(context: ExportPublicationMutationContext): void {
  if (!context.capabilities.includes('export:publish')) {
    throw new ExportRestoreWorkflowError(
      'unauthorized',
      'The actor is not authorized to execute an export restore workflow.',
    );
  }
}

function validateRequest(args: {
  input: ExportRestoreExecutionInput;
  inventory: ExportRestorePointerInventory;
}): {
  input: ExportRestoreExecutionInput;
  inventory: ExportRestorePointerInventory;
} {
  const inputResult = restoreWorkflowInputSchema.safeParse(args.input);
  if (!inputResult.success) {
    throw new ExportRestoreWorkflowError(
      'invalid_request',
      'The export restore workflow input is invalid.',
      inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const inventoryResult = exportRestorePointerInventorySchema.safeParse(args.inventory);
  if (!inventoryResult.success) {
    throw new ExportRestoreWorkflowError(
      'invalid_request',
      'The export restore pointer inventory is invalid.',
      inventoryResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  if (inputResult.data.targetSnapshotDigest !== inventoryResult.data.targetSnapshotDigest) {
    throw new ExportRestoreWorkflowError(
      'invalid_request',
      'The requested restore target does not match the pointer inventory target.',
      ['targetSnapshotDigest'],
    );
  }

  if (
    inputResult.data.expectedActiveSnapshotDigest !==
    inventoryResult.data.previousActiveSnapshotDigest
  ) {
    throw new ExportRestoreWorkflowError(
      'invalid_request',
      'The expected active snapshot does not match the pointer inventory.',
      ['expectedActiveSnapshotDigest'],
    );
  }

  return {
    input: inputResult.data,
    inventory: inventoryResult.data,
  };
}

export function createExportRestoreWorkflow(dependencies: {
  executionBackend: ExportRestoreExecutionBackend;
  pointerSwitchAdapter: ExportRestorePointerSwitchAdapter;
}) {
  const executionService = createExportRestoreExecutionService(dependencies.executionBackend);

  return {
    async execute(args: {
      context: ExportPublicationMutationContext;
      input: ExportRestoreExecutionInput;
      inventory: ExportRestorePointerInventory;
      pointerExpectations: ExportRestorePointerExpectation[];
    }): Promise<ExportRestoreExecutionRecord> {
      assertAuthorized(args.context);
      const validated = validateRequest(args);

      let existing: ExportRestoreExecutionRecord | null;
      try {
        existing = await executionService.findReplay({
          context: args.context,
          input: validated.input,
          inventory: validated.inventory,
        });
      } catch (error) {
        if (error instanceof ExportRestoreExecutionError && error.code === 'backend_failure') {
          throw new ExportRestoreWorkflowError(
            'restore_record_read_failed',
            'The restore workflow could not inspect an existing execution record.',
            [],
            [],
            { cause: error },
          );
        }
        throw new ExportRestoreWorkflowError(
          'replay_validation_failed',
          'The restore replay request does not match the existing execution record.',
          [],
          [],
          { cause: error },
        );
      }
      if (existing !== null) return existing;

      let pointerSwitches: ExportRestorePointerSwitchReceipt[];
      try {
        pointerSwitches = await switchExportRestorePointers({
          inventory: validated.inventory,
          pointerExpectations: args.pointerExpectations,
          adapter: dependencies.pointerSwitchAdapter,
          switchedAt: validated.input.restoredAt,
        });
      } catch (error) {
        throw new ExportRestoreWorkflowError(
          'pointer_switch_failed',
          'The restore workflow could not switch the export pointers.',
          [],
          [],
          { cause: error },
        );
      }

      try {
        return await executionService.recordExecution({
          context: args.context,
          input: validated.input,
          inventory: validated.inventory,
          pointerSwitches,
        });
      } catch (error) {
        throw new ExportRestoreWorkflowError(
          'execution_record_failed_after_switch',
          'The export pointers were switched but the restore execution record could not be persisted.',
          [],
          pointerSwitches,
          { cause: error },
        );
      }
    },
  };
}
