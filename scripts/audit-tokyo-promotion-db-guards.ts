import { and, asc, eq, sql } from 'drizzle-orm';
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

  const sourceRows = await db
    .select({ sourceRecordId: candidateSourceRecords.sourceRecordId })
    .from(candidateSourceRecords)
    .where(eq(candidateSourceRecords.candidateId, pilot.candidateId))
    .orderBy(candidateSourceRecords.sourceRecordId);
  const sourceRecordIds = sourceRows.map((row) => row.sourceRecordId);

  const candidateCheck = await db.execute(sql`
    select exists (
      select 1
      from ${sourceCandidates}
      where ${sourceCandidates.id} = ${pilot.candidateId}
        and ${sourceCandidates.candidateType} = ${pilot.candidateType}
        and ${sourceCandidates.candidateStatus} in ('new', 'triaged')
        and ${sourceCandidates.updatedAt} = ${pilot.updatedAt}
        and ${sourceCandidates.canonicalEntityId} is null
        and ${sourceCandidates.canonicalLocationId} is null
    ) as pass
  `);
  const sourceCheck = await db.execute(sql`
    select (
      select coalesce(jsonb_agg(locked.source_record_id order by locked.source_record_id), '[]'::jsonb)
      from (
        select ${candidateSourceRecords.sourceRecordId} as source_record_id
        from ${candidateSourceRecords}
        where ${candidateSourceRecords.candidateId} = ${pilot.candidateId}
      ) as locked
    ) = ${JSON.stringify(sourceRecordIds)}::jsonb as pass
  `);

  const candidateGuardPass = Boolean((candidateCheck as unknown as Array<{ pass: boolean }>)[0]?.pass);
  const sourceRecordGuardPass = Boolean((sourceCheck as unknown as Array<{ pass: boolean }>)[0]?.pass);

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      boundedPilotSelected: true,
      candidateGuardPass,
      sourceRecordGuardPass,
      candidateStatus: pilot.candidateStatus,
      sourceRecordCount: sourceRecordIds.length,
      canonicalLinksEmpty:
        pilot.canonicalEntityId === null && pilot.canonicalLocationId === null,
      mutationPerformed: false,
      payloadExposed: false,
    }),
  );
}

await main();
