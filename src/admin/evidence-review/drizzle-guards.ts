import { sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  evidence,
  networks,
  paymentMethods,
} from '../../db/schema';
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

export function evidenceReviewPaymentSetGuard(
  database: CryptoPayMapDatabase,
  command: EvidenceReviewDecisionCommand,
) {
  return database.execute(sql`
    with locked_payment_rows as materialized (
      select
        ${claimAssets.id} as id,
        ${claimAssets.isPrimary} as is_primary,
        ${assets.status} as asset_status,
        ${networks.slug} as network_slug,
        ${networks.status} as network_status,
        ${paymentMethods.slug} as payment_method_slug,
        ${paymentMethods.status} as payment_method_status,
        ${acceptanceClaims.routeType} as claim_route_type
      from ${claimAssets}
      inner join ${assets} on ${claimAssets.assetId} = ${assets.id}
      inner join ${networks} on ${claimAssets.networkId} = ${networks.id}
      inner join ${paymentMethods} on ${claimAssets.paymentMethodId} = ${paymentMethods.id}
      inner join ${acceptanceClaims} on ${claimAssets.claimId} = ${acceptanceClaims.id}
      where ${claimAssets.claimId} = ${command.claimId}
      for share of ${claimAssets}, ${assets}, ${networks}, ${paymentMethods}
    )
    select 1 / case when
      (
        select coalesce(jsonb_agg(id order by id), '[]'::jsonb)
        from locked_payment_rows
      ) = ${JSON.stringify(command.expectedClaimAssetIds)}::jsonb
      and (select count(*) from locked_payment_rows) > 0
      and (select count(*) from locked_payment_rows where is_primary = true) = 1
      and not exists (
        select 1 from locked_payment_rows
        where asset_status <> 'active'
          or network_status <> 'active'
          or payment_method_status <> 'active'
          or (
            payment_method_slug in ('lightning_invoice', 'lightning_nfc')
            and network_slug <> 'lightning'
          )
          or (payment_method_slug = 'onchain' and network_slug = 'lightning')
          or (
            payment_method_slug = 'processor_checkout'
            and claim_route_type <> 'processor_checkout'
          )
      )
      then 1 else 0 end as evidence_review_payment_set_guard
  `);
}
