import type { CryptoPayMapDatabase } from '../../db/client';
import { exportReleaseDecisions } from '../../db/schema';
import {
  ExportReleaseDecisionError,
  type ExportReleaseDecisionBackend,
  type ExportReleaseDecisionCommand,
} from './decision';
import {
  isExportReleaseConflictCode,
  postgresExportReleaseErrorCode,
} from './drizzle-errors';
import {
  readExportReleaseDecision,
  replayExportReleaseDecision,
} from './drizzle-state';
import {
  committedExportReleaseReceipt,
  exportReleaseDecisionValues,
} from './drizzle-values';

export function createDrizzleExportReleaseBackend(
  database: CryptoPayMapDatabase,
): ExportReleaseDecisionBackend {
  return {
    async commitDecision(command: ExportReleaseDecisionCommand) {
      const existing = await readExportReleaseDecision(database, command.requestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new ExportReleaseDecisionError(
            'conflict',
            'The export release request ID was reused with different content.',
          );
        }
        return replayExportReleaseDecision(existing);
      }

      try {
        await database.insert(exportReleaseDecisions).values(exportReleaseDecisionValues(command));
      } catch (error) {
        const code = postgresExportReleaseErrorCode(error);
        if (code === '23505') {
          const replay = await readExportReleaseDecision(database, command.requestId);
          if (replay?.requestFingerprint === command.requestFingerprint) {
            return replayExportReleaseDecision(replay);
          }
        }
        if (isExportReleaseConflictCode(code)) {
          throw new ExportReleaseDecisionError(
            'conflict',
            'The export release conflicted with durable release state.',
            code === null ? [] : [`PostgreSQL rejected the release receipt with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }

      return committedExportReleaseReceipt(command);
    },
  };
}
