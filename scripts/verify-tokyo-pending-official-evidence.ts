import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';
const SOURCE_NAME = 'Official merchant websites — review discovery';

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing to verify outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const db = createDatabase(databaseUrl);
  const rows = await db
    .select({
      candidateStatus: sourceCandidates.candidateStatus,
      relationship: candidateSourceRecords.relationship,
      evidenceVisibility: evidence.visibility,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceKind: evidence.evidenceKind,
      evidenceSourceType: evidence.sourceType,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .innerJoin(sources, eq(sources.id, sourceRecords.sourceId))
    .innerJoin(evidence, eq(evidence.sourceRecordId, sourceRecords.id))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        eq(sources.sourceType, 'official_site'),
        eq(sources.name, SOURCE_NAME),
        eq(evidence.evidenceKind, 'official_payment_page'),
      ),
    );

  const pendingPrivate = rows.filter(
    (row) => row.evidenceVisibility === 'private' && row.evidenceReviewStatus === 'pending',
  ).length;
  const supportingLinks = rows.filter((row) => row.relationship === 'supporting').length;
  const changedCandidateStates = rows.filter((row) => row.candidateStatus !== 'new').length;
  const publicEvidence = rows.filter((row) => row.evidenceVisibility === 'public').length;
  const acceptedEvidence = rows.filter((row) => row.evidenceReviewStatus === 'accepted').length;

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      officialPaymentEvidenceRows: rows.length,
      pendingPrivate,
      supportingLinks,
      changedCandidateStates,
      publicEvidence,
      acceptedEvidence,
      automaticConfirmedCount: 0,
    }),
  );
}

await main();
