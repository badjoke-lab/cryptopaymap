import { and, eq, isNull } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import { entities, locations } from '../db/schema';
import type { PhotoUploadTargetReader } from './photo-object-validation';

export function createDrizzlePhotoUploadTargetReader(
  database: CryptoPayMapDatabase,
): PhotoUploadTargetReader {
  return {
    async targetExists(targetType, targetId) {
      if (targetType === 'entity') {
        const rows = await database
          .select({ id: entities.id })
          .from(entities)
          .where(and(eq(entities.id, targetId), isNull(entities.deletedAt)))
          .limit(1);
        return rows.length === 1;
      }

      const rows = await database
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, targetId), isNull(locations.deletedAt)))
        .limit(1);
      return rows.length === 1;
    },
  };
}
