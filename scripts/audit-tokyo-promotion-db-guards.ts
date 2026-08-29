import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';

function postgresCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

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

  async function exactGuardPass(query: SQL): Promise<boolean> {
    try {
      await db.execute(query);
      return true;
    } catch (error) {
      if (postgresCode(error) === '22012') return false;
      throw error;
    }
  }

  const candidateGuardPass = await exactGuardPass(sql`
    select 1 / case when exists (
      select 1
      from ${sourceCandidates}
      where ${sourceCandidates.id} = ${pilot.candidateId}
        and ${sourceCandidates.candidateType} = ${pilot.candidateType}
        and ${sourceCandidates.candidateStatus} in ('new', 'triaged')
        and ${sourceCandidates.updatedAt} = ${pilot.updatedAt}
        and ${sourceCandidates.canonicalEntityId} is null
        and ${sourceCandidates.canonicalLocationId} is null
      for update
    ) then 1 else 0 end as candidate_promotion_guard
  `);

  const sourceRecordGuardPass = await exactGuardPass(sql`
    select 1 / case when (
      select coalesce(jsonb_agg(locked.source_record_id order by locked.source_record_id), '[]'::jsonb)
      from (
        select ${candidateSourceRecords.sourceRecordId} as source_record_id
        from ${candidateSourceRecords}
        where ${candidateSourceRecords.candidateId} = ${pilot.candidateId}
        for update
      ) as locked
    ) = ${JSON.stringify(sourceRecordIds)}::jsonb then 1 else 0 end
      as candidate_promotion_source_guard
  `);

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
