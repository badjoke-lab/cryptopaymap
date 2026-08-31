import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  assets,
  candidatePromotionDecisions,
  candidateSourceRecords,
  claimAssets,
  evidence,
  networks,
  paymentMethods,
  sourceCandidates,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const EXPECTED_CANDIDATE_HASH = '61af688c243438b352a6db8a31034a56b97b4abb83efbbbc59d0b3a7fe6df2e7';
const REVIEW_BATCH_IDS = [
  'd0e17010-611c-48b2-a75d-8b389c1bee60',
  '5c85e86a-bc05-4f9d-a1f3-9d5e6135ef81',
  '8d9d6627-48f6-43e7-b7f0-7a90e1ed4689',
  '8e2c7c6a-e300-4747-90f7-290327870426',
  '3808ea78-195f-4558-8088-37c172be6b63',
] as const;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing reviewed on-chain audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      evidenceId: evidence.id,
      evidenceClaimId: evidence.claimId,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, [...REVIEW_BATCH_IDS]),
        eq(evidence.evidenceKind, 'official_payment_page'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const matches: (typeof rows)[number][] = [];
  for (const row of rows) {
    if ((await sha256(row.candidateId)) === EXPECTED_CANDIDATE_HASH) matches.push(row);
  }
  if (matches.length !== 1) {
    throw new Error('Exact reviewed on-chain Candidate/Evidence pair is missing or ambiguous.');
  }
  const selected = matches[0];
  if (!selected) throw new Error('Exact reviewed on-chain Candidate was not selected.');

  const [promotion] = await db
    .select({ claimId: candidatePromotionDecisions.claimId })
    .from(candidatePromotionDecisions)
    .where(eq(candidatePromotionDecisions.candidateId, selected.candidateId))
    .limit(1);

  const [claim] = promotion
    ? await db
        .select({
          claimStatus: acceptanceClaims.claimStatus,
          visibility: acceptanceClaims.visibility,
        })
        .from(acceptanceClaims)
        .where(eq(acceptanceClaims.id, promotion.claimId))
        .limit(1)
    : [];

  const acceptedEvidenceRows = promotion
    ? await db
        .select({ id: evidence.id })
        .from(evidence)
        .where(and(eq(evidence.claimId, promotion.claimId), eq(evidence.reviewStatus, 'accepted')))
    : [];

  const assetRows = promotion
    ? await db
        .select({
          assetSymbol: assets.symbol,
          networkSlug: networks.slug,
          paymentMethodSlug: paymentMethods.slug,
        })
        .from(claimAssets)
        .innerJoin(assets, eq(assets.id, claimAssets.assetId))
        .leftJoin(networks, eq(networks.id, claimAssets.networkId))
        .leftJoin(paymentMethods, eq(paymentMethods.id, claimAssets.paymentMethodId))
        .where(eq(claimAssets.claimId, promotion.claimId))
    : [];
  const onlyAsset = assetRows.length === 1 ? assetRows[0] : null;

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      exactMatches: matches.length,
      candidatePromoted: selected.candidateStatus === 'promoted',
      duplicateClear: selected.duplicateGroupId === null,
      promotionExists: Boolean(promotion),
      claimExists: Boolean(claim),
      claimStatus: claim?.claimStatus ?? null,
      claimVisibility: claim?.visibility ?? null,
      evidenceReviewStatus: selected.evidenceReviewStatus,
      evidenceVisibility: selected.evidenceVisibility,
      evidenceBoundToPromotionClaim:
        Boolean(promotion) && selected.evidenceClaimId === promotion?.claimId,
      acceptedEvidenceCount: acceptedEvidenceRows.length,
      claimAssetCount: assetRows.length,
      assetIsBTC: onlyAsset?.assetSymbol === 'BTC',
      networkIsBitcoin: onlyAsset?.networkSlug === 'bitcoin',
      paymentMethodIsOnchain: onlyAsset?.paymentMethodSlug === 'onchain',
      mutationPerformed: false,
      payloadExposed: false,
    }),
  );
}

await main();
