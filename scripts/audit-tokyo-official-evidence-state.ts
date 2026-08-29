import { and, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  candidatePromotionDecisions,
  candidateSourceRecords,
  evidence,
  sourceCandidates,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing Tokyo state audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      evidenceId: evidence.id,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        eq(evidence.evidenceKind, 'official_payment_page'),
      ),
    );

  const unique = [...new Map(rows.map((row) => [row.candidateId, row])).values()];
  const candidateIds = unique.map((row) => row.candidateId);
  const promotions = candidateIds.length === 0
    ? []
    : await db
        .select({ candidateId: candidatePromotionDecisions.candidateId, claimId: candidatePromotionDecisions.claimId })
        .from(candidatePromotionDecisions)
        .where(inArray(candidatePromotionDecisions.candidateId, candidateIds));
  const claimIds = promotions.map((row) => row.claimId);
  const claims = claimIds.length === 0
    ? []
    : await db
        .select({ status: acceptanceClaims.claimStatus, visibility: acceptanceClaims.visibility })
        .from(acceptanceClaims)
        .where(inArray(acceptanceClaims.id, claimIds));

  const candidateStatusCounts: Record<string, number> = {};
  const evidenceStatusCounts: Record<string, number> = {};
  const evidenceVisibilityCounts: Record<string, number> = {};
  for (const row of unique) {
    candidateStatusCounts[row.candidateStatus] = (candidateStatusCounts[row.candidateStatus] ?? 0) + 1;
    evidenceStatusCounts[row.evidenceReviewStatus] = (evidenceStatusCounts[row.evidenceReviewStatus] ?? 0) + 1;
    evidenceVisibilityCounts[row.evidenceVisibility] = (evidenceVisibilityCounts[row.evidenceVisibility] ?? 0) + 1;
  }

  const confirmedHidden = claims.filter(
    (row) => row.status === 'confirmed' && row.visibility === 'hidden',
  ).length;
  const publicClaims = claims.filter((row) => row.visibility === 'public').length;

  console.log(JSON.stringify({
    target: EXPECTED_TARGET,
    batchId: TOKYO_BATCH_ID,
    officialEvidenceCandidates: unique.length,
    candidateStatusCounts,
    evidenceStatusCounts,
    evidenceVisibilityCounts,
    promotionDecisions: promotions.length,
    confirmedHidden,
    publicClaims,
    mutationPerformed: false,
    payloadExposed: false,
  }));
}

await main();
