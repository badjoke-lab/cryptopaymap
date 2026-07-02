import { sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { acceptanceClaims } from '../../db/schema';
import type { ReconfirmationExpirationCommand } from './expiration';

export function reconfirmationExpirationClaimGuard(
  database: CryptoPayMapDatabase,
  command: ReconfirmationExpirationCommand,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1 from ${acceptanceClaims}
      where ${acceptanceClaims.id} = ${command.claimId}
        and ${acceptanceClaims.claimStatus} = ${command.expectedClaimStatus}
        and ${acceptanceClaims.visibility} = ${command.expectedClaimVisibility}
        and ${acceptanceClaims.updatedAt} = ${command.expectedClaimUpdatedAt}
        and ${acceptanceClaims.nextReviewAt} = ${command.expectedNextReviewAt}
        and ${acceptanceClaims.nextReviewAt} <= ${command.effectiveAt}
        and ${acceptanceClaims.deletedAt} is null
      for update
    ) then 1 else 0 end as reconfirmation_expiration_claim_guard
  `);
}
