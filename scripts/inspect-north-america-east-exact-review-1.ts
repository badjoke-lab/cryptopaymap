import { asc, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  assets,
  candidateSourceRecords,
  evidence,
  networks,
  paymentMethods,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const EXPECTED_HASH = 'c2fceb6f5f13e40fcb280464674f648a4eafaeda185d29012d4132a8c8dc8df3';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing exact review outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const candidates = await db.select().from(sourceCandidates).orderBy(asc(sourceCandidates.id));
  const matches = [];
  for (const candidate of candidates) {
    if ((await sha256(candidate.id)) === EXPECTED_HASH) matches.push(candidate);
  }
  if (matches.length !== 1) throw new Error('Exact Candidate is missing or ambiguous.');
  const candidate = matches[0];
  if (!candidate) throw new Error('Exact Candidate not selected.');

  const relations = await db
    .select({
      sourceRecordId: candidateSourceRecords.sourceRecordId,
      relationship: candidateSourceRecords.relationship,
      sourceUrl: sourceRecords.sourceUrl,
      officialDomain: sourceRecords.officialDomain,
      rawPayload: sourceRecords.rawPayload,
      fetchedAt: sourceRecords.fetchedAt,
      contentHash: sourceRecords.contentHash,
    })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(eq(candidateSourceRecords.candidateId, candidate.id))
    .orderBy(asc(candidateSourceRecords.sourceRecordId));

  const evidenceRows = await db
    .select()
    .from(evidence)
    .where(eq(evidence.sourceRecordId, relations.find((row) => row.relationship === 'supporting')?.sourceRecordId ?? '00000000-0000-0000-0000-000000000000'))
    .orderBy(asc(evidence.id));

  const [assetRows, networkRows, methodRows] = await Promise.all([
    db.select().from(assets).orderBy(asc(assets.symbol)),
    db.select().from(networks).orderBy(asc(networks.slug)),
    db.select().from(paymentMethods).orderBy(asc(paymentMethods.slug)),
  ]);

  process.stdout.write(JSON.stringify({
    target: EXPECTED_TARGET,
    candidateHash: EXPECTED_HASH,
    candidate,
    relations,
    evidenceRows,
    registry: {
      activeAssets: assetRows.filter((row) => row.status === 'active').map((row) => ({ id: row.id, symbol: row.symbol, slug: row.slug })),
      activeNetworks: networkRows.filter((row) => row.status === 'active').map((row) => ({ id: row.id, slug: row.slug })),
      activePaymentMethods: methodRows.filter((row) => row.status === 'active').map((row) => ({ id: row.id, slug: row.slug })),
    },
    mutationPerformed: false,
    publicDataChanged: false,
    payloadExposedInLogs: false,
  }));
}

await main();
