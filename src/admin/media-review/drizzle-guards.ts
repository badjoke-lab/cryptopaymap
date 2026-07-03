import { sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { mediaAssets } from '../../db/schema';
import type { MediaReviewDecisionCommand, MediaReviewSubject } from './decision';

function subjectColumn(subject: MediaReviewSubject) {
  switch (subject.type) {
    case 'entity':
      return mediaAssets.entityId;
    case 'location':
      return mediaAssets.locationId;
    case 'claim':
      return mediaAssets.claimId;
    case 'evidence':
      return mediaAssets.evidenceId;
    case 'submission':
      return mediaAssets.submissionId;
    case 'source_record':
      return mediaAssets.sourceRecordId;
  }
}

export function mediaReviewAssetGuard(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
) {
  const subject = subjectColumn(command.expectedSubject);
  return database.execute(sql`
    select 1 / case when exists (
      select 1 from ${mediaAssets}
      where ${mediaAssets.id} = ${command.mediaAssetId}
        and ${mediaAssets.updatedAt} = ${command.expectedMediaUpdatedAt}
        and ${mediaAssets.reviewStatus} = ${command.expectedReviewStatus}
        and ${mediaAssets.purpose} = ${command.expectedPurpose}
        and ${mediaAssets.role} = ${command.expectedRole}
        and ${mediaAssets.rightsStatus} = ${command.expectedRightsStatus}
        and ${mediaAssets.visibility} = ${command.expectedVisibility}
        and ${subject} = ${command.expectedSubject.id}
        and ${mediaAssets.deletedAt} is null
      for update
    ) then 1 else 0 end as media_review_asset_guard
  `);
}

export function mediaReviewCoverGuard(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
) {
  const subject = subjectColumn(command.expectedSubject);
  return database.execute(sql`
    select 1 / case when not exists (
      select 1 from ${mediaAssets}
      where ${mediaAssets.id} <> ${command.mediaAssetId}
        and ${subject} = ${command.expectedSubject.id}
        and ${mediaAssets.role} = 'cover'
        and ${mediaAssets.reviewStatus} = 'accepted'
        and ${mediaAssets.visibility} = 'public'
        and ${mediaAssets.deletedAt} is null
      for share
    ) then 1 else 0 end as media_review_cover_guard
  `);
}
