import { sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { sourceCandidates } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing Candidate count audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(sourceCandidates);
  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      candidateTotal: Number(row?.count ?? 0),
      mutationPerformed: false,
      payloadExposed: false,
    }),
  );
}

await main();
