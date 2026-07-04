import { z } from 'zod';
import type { ExportPublicationMutationContext } from './publication-contract';
import {
  createExportRestoreExecutionService,
  exportRestoreExecutionRecordSchema,
  type ExportRestoreExecutionBackend,
  type ExportRestoreExecutionInput,
  type ExportRestoreExecutionRecord,
  type ExportRestorePointerInventory,
  type ExportRestorePointerSwitchReceipt,
} from './restore-execution';
import {
  ExportRestorePointerSwitchError,
  switchExportRestorePointers,
  type ExportRestorePointerExpectation,
  type ExportRestorePointerSwitchAdapter,
} from './restore-pointer-switch';

export const exportRestoreFlowResultSchema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('restored'),
      record: exportRestoreExecutionRecordSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal('replayed'),
      record: exportRestoreExecutionRecordSchema,
    })
    .strict(),
]);

export type ExportRestoreFlowResult = z.infer<typeof exportRestoreFlowResultSchema>;

export type ExportRestoreFlowErrorCode =
  | 'pointer_switch_failed'
  | 'record_failed_after_switch';

export class ExportRestoreFlowError extends Error {
  readonly code: ExportRestoreFlowErrorCode;
  readonly pointerSwitches: readonly ExportRestorePointerSwitchReceipt[];

  constructor(
    code: ExportRestoreFlowErrorCode,
    message: string,
    pointerSwitches: readonly ExportRestorePointerSwitchReceipt[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportRestoreFlowError';
    this.code = code;
    this.pointerSwitches = pointerSwitches;
  }
}

export interface ExportRestoreFlowDependencies {
  executionBackend: ExportRestoreExecutionBackend;
  pointerSwitchAdapter: ExportRestorePointerSwitchAdapter;
}

export interface ExportRestoreFlowInput {
  context: ExportPublicationMutationContext;
  input: ExportRestoreExecutionInput;
  inventory: ExportRestorePointerInventory;
  pointerExpectations: ExportRestorePointerExpectation[];
}

function replayResult(record: ExportRestoreExecutionRecord): ExportRestoreFlowResult {
  return exportRestoreFlowResultSchema.parse({ state: 'replayed', record });
}

export function createExportRestoreFlowService(dependencies: ExportRestoreFlowDependencies) {
  const executionService = createExportRestoreExecutionService(dependencies.executionBackend);

  return {
    async executeRestore(args: ExportRestoreFlowInput): Promise<ExportRestoreFlowResult> {
      const replay = await executionService.findReplay({
        context: args.context,
        input: args.input,
        inventory: args.inventory,
      });
      if (replay !== null) return replayResult(replay);

      let pointerSwitches: ExportRestorePointerSwitchReceipt[];
      try {
        pointerSwitches = await switchExportRestorePointers({
          inventory: args.inventory,
          pointerExpectations: args.pointerExpectations,
          adapter: dependencies.pointerSwitchAdapter,
          switchedAt: args.input.restoredAt,
        });
      } catch (error) {
        if (error instanceof ExportRestorePointerSwitchError) {
          throw new ExportRestoreFlowError(
            'pointer_switch_failed',
            'The export restore pointer switch did not complete.',
            [],
            { cause: error },
          );
        }
        throw error;
      }

      let record: ExportRestoreExecutionRecord;
      try {
        record = await executionService.recordExecution({
          context: args.context,
          input: args.input,
          inventory: args.inventory,
          pointerSwitches,
        });
      } catch (error) {
        throw new ExportRestoreFlowError(
          'record_failed_after_switch',
          'The export pointers were switched but the execution record was not confirmed.',
          pointerSwitches,
          { cause: error },
        );
      }

      return exportRestoreFlowResultSchema.parse({ state: 'restored', record });
    },
  };
}
