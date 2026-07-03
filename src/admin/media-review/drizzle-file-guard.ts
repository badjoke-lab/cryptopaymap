import { sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { mediaFiles } from '../../db/schema';
import type { MediaReviewDecisionCommand } from './decision';

export function mediaReviewFileSetGuard(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
) {
  return database.execute(sql`
    select 1 / case when (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', locked.id,
            'variant', locked.variant,
            'storageScope', locked.storage_scope,
            'storageKey', locked.storage_key,
            'mimeType', locked.mime_type,
            'contentHash', locked.content_hash,
            'width', locked.width,
            'height', locked.height
          ) order by locked.id
        ),
        '[]'::jsonb
      )
      from (
        select
          ${mediaFiles.id} as id,
          ${mediaFiles.variant} as variant,
          ${mediaFiles.storageScope} as storage_scope,
          ${mediaFiles.storageKey} as storage_key,
          ${mediaFiles.mimeType} as mime_type,
          ${mediaFiles.contentHash} as content_hash,
          ${mediaFiles.width} as width,
          ${mediaFiles.height} as height
        from ${mediaFiles}
        where ${mediaFiles.mediaAssetId} = ${command.mediaAssetId}
        for share
      ) as locked
    ) = ${JSON.stringify(command.expectedFiles)}::jsonb then 1 else 0 end
      as media_review_file_set_guard
  `);
}
