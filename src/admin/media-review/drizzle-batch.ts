import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { mediaAssets, mediaReviewDecisions } from '../../db/schema';
import type { MediaReviewDecisionCommand } from './decision';
import { mediaAssetUpdateValues } from './drizzle-asset-values';
import { mediaReviewFileSetGuard } from './drizzle-file-guard';
import { mediaReviewAssetGuard, mediaReviewCoverGuard } from './drizzle-guards';
import type { ProjectedMediaReviewDecision } from './drizzle-state';
import { mediaReviewDecisionValues } from './drizzle-values';

export function buildMediaReviewBatch(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
  projected: ProjectedMediaReviewDecision,
) {
  const statements: unknown[] = [
    mediaReviewAssetGuard(database, command),
    mediaReviewFileSetGuard(database, command),
  ];
  if (command.action === 'approve_public' && command.expectedRole === 'cover') {
    statements.push(mediaReviewCoverGuard(database, command));
  }
  statements.push(
    database
      .update(mediaAssets)
      .set(mediaAssetUpdateValues(projected))
      .where(eq(mediaAssets.id, command.mediaAssetId)),
    database.insert(mediaReviewDecisions).values(mediaReviewDecisionValues(command, projected)),
  );
  return statements;
}
