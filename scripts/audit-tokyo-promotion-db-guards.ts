import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing promotion guard audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const candidates = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      updatedAt: sourceCandidates.updatedAt,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.reviewStatus, 'pending'),
        eq(evidence.visibility, 'private'),
      ),
    )
    .orderBy(asc(sourceCandidates.id));

  const pilot = [...new Map(candidates.map((row) => [row.candidateId, row])).values()][0];
  if (!pilot) throw new Error('No bounded Tokyo pilot Candidate is available.');

  const structural = await db
    .select({ id: sourceCandidates.id })
    .from(sourceCandidates)
    .where(
      and(
        eq(sourceCandidates.id, pilot.candidateId),
        eq(sourceCandidates.candidateType, pilot.candidateType),
        sql`${sourceCandidates.candidateStatus} in ('new', 'triaged')`,
        isNull(sourceCandidates.canonicalEntityId),
        isNull(sourceCandidates.canonicalLocationId),
      ),
    )
    .limit(1);

  const exactTimestamp = await db
    .select({ id: sourceCandidates.id })
    .from(sourceCandidates)
    .where(and(eq(sourceCandidates.id, pilot.candidateId), eq(sourceCandidates.updatedAt, pilot.updatedAt)))
    .limit(1);

  const millisecondTimestamp = await db
    .select({ id: sourceCandidates.id })
    .from(sourceCandidates)
    .where(
      and(
        eq(sourceCandidates.id, pilot.candidateId),
        sql`date_trunc('milliseconds', ${sourceCandidates.updatedAt}) = ${pilot.updatedAt}`,
      ),
    )
    .limit(1);

  const sourceRows = await db
    .select({ sourceRecordId: candidateSourceRecords.sourceRecordId })
    .from(candidateSourceRecords)
    .where(eq(candidateSourceRecords.candidateId, pilot.candidateId))
    .orderBy(candidateSourceRecords.sourceRecordId);

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      boundedPilotSelected: true,
      structuralCandidatePass: structural.length === 1,
      exactUpdatedAtPass: exactTimestamp.length === 1,
      millisecondUpdatedAtPass: millisecondTimestamp.length === 1,
      candidateStatus: pilot.candidateStatus,
      sourceRecordCount: sourceRows.length,
      canonicalLinksEmpty:
        pilot.canonicalEntityId === null && pilot.canonicalLocationId === null,
      mutationPerformed: false,
      payloadExposed: false,
    }),
  );
}

await main();
