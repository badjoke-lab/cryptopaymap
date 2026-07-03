import type { CryptoPayMapDatabase } from '../../db/client';
import type { ApprovedExportReleaseBackend } from './publication-contract';

export function createDrizzleApprovedExportReleaseBackend(
  _database: CryptoPayMapDatabase,
): ApprovedExportReleaseBackend {
  return {
    async loadApprovedRelease() {
      return null;
    },
  };
}
