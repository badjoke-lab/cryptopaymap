import { sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { acceptanceClaims, evidence } from '../../db/schema';
import type { EvidenceReviewDecisionCommand } from './decision';

export function evidenceReviewRowGuard(
  database: CryptoPayMapDatabase,
  command: EvidenceReviewDecisionCommand,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1 from ${evidence}
      where ${evidence.id} = ${command.evidenceId}
        and ${evidence.claimId} = ${command.claimId}
        and ${evidence.reviewStatus} = ${command.expectedEvidenceReviewStatus}
        and ${evidence.updatedAt} = ${command.expectedEvidenceUpdatedAt}
        and ${evidence.deletedAt} is null
      for update
    ) then 1 else 0 end as evidence_review_evidence_guard
  `);
}

export function evidenceReviewClaimGuard(
  database: CryptoPayMapDatabase,
  command: EvidenceReviewDecisionCommand,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1 from ${acceptanceClaims}
      where ${acceptanceClaims.id} = ${command.claimId}
        and ${acceptanceClaims.claimStatus} = ${command.expectedClaimStatus}
        and ${acceptanceClaims.visibility} = ${command.expectedClaimVisibility}
        and ${acceptanceClaims.updatedAt} = ${command.expectedClaimUpdatedAt}
        and ${acceptanceClaims.deletedAt} is null
      for update
    ) then 1 else 0 end as evidence_review_claim_guard
  `);
}

export function evidenceReviewAcceptedSetGuard(
  database: CryptoPayMapDatabase,
  command: EvidenceReviewDecisionCommand,
) {
  return database.execute(sql`
    select 1 / case when (
      select coalesce(jsonb_agg(locked.id order by locked.id), '[]'::jsonb)
      from (
        select ${evidence.id} as id
        from ${evidence}
        where ${evidence.claimId} = ${command.claimId}
          and ${evidence.reviewStatus} = 'accepted'
          and ${evidence.deletedAt} is null
        for share
      ) as locked
    ) = ${JSON.stringify(command.expectedAcceptedEvidenceIds)}::jsonb then 1 else 0 end
      as evidence_review_accepted_set_guard
  `);
}
