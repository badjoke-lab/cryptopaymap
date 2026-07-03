import type { CryptoPayMapDatabase } from '../../db/client';
import { exportActivationRecords } from '../../db/schema';
import { ExportPublicationError } from './publication-contract';
import type {
  ExportActivationHistoryBackend,
  ExportActivationHistoryCommand,
} from './activation-history';
import {
  isActivationHistoryConflictCode,
  postgresActivationHistoryErrorCode,
} from './activation-history-errors';
import {
  readExportActivationRecord,
  replayExportActivationRecord,
} from './activation-history-state';
import {
  exportActivationRecordValues,
  publishedActivationReceipt,
} from './activation-history-values';

export function createDrizzleExportActivationHistoryBackend(
  database: CryptoPayMapDatabase,
): ExportActivationHistoryBackend {
  return {
    async commitActivation(command: ExportActivationHistoryCommand) {
      const existing = await readExportActivationRecord(database, command.requestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new ExportPublicationError(
            'pointer_conflict',
            'The export activation request ID was reused with different content.',
            ['requestFingerprint'],
          );
        }
        return replayExportActivationRecord(existing);
      }

      try {
        await database
          .insert(exportActivationRecords)
          .values(exportActivationRecordValues(command));
      } catch (error) {
        const code = postgresActivationHistoryErrorCode(error);
        if (code === '23505') {
          const replay = await readExportActivationRecord(database, command.requestId);
          if (replay?.requestFingerprint === command.requestFingerprint) {
            return replayExportActivationRecord(replay);
          }
        }
        if (isActivationHistoryConflictCode(code)) {
          throw new ExportPublicationError(
            'pointer_conflict',
            'The export activation conflicted with durable activation history.',
            code === null ? [] : [`PostgreSQL rejected the activation record with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }

      return publishedActivationReceipt(command);
    },
  };
}
