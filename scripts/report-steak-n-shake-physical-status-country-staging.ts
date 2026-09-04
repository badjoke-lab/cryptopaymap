import { and, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };
const TARGET = 'fixed-review-staging';
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => v && typeof v === 'object' && !Array.isArray(v) ? v as Rec : {};
const smap = (v: unknown): Record<string,string> => Object.fromEntries(Object.entries(rec(v)).filter((x): x is [string,string] => typeof x[1] === 'string'));

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) throw new Error(`Refusing outside ${TARGET}`);
  const url = process.env.DATABASE_URL?.trim(); if (!url) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(url);
  const rows = await db.select({
    candidateId: sourceCandidates.id,
    status: sourceCandidates.candidateStatus,
    normalizedName: sourceCandidates.normalizedName,
    relationship: candidateSourceRecords.relationship,
    rawPayload: sourceRecords.rawPayload,
  }).from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(and(eq(sourceCandidates.candidateType,'physical_place'), ilike(sourceCandidates.normalizedName,'%steak%n%shake%'), eq(candidateSourceRecords.relationship,'origin')));
  const unique = new Map(rows.map(r => [r.candidateId, r]));
  const counts = new Map<string, number>();
  let directCountry = 0, reviewSeedCountry = 0, topCountry = 0, lightning = 0;
  for (const row of unique.values()) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    const root = rec(row.rawPayload);
    const seed = rec(root.reviewSeed);
    const element = rec(root.element ?? root.rawRecord ?? root.normalizedRecord ?? root);
    const tags = smap(element.tags ?? rec(root.normalizedRecord).paymentTags);
    const payment = smap(seed.paymentTags ?? rec(root.normalizedRecord).paymentTags ?? element.tags);
    if (['yes','only','true','1'].includes((payment['payment:lightning'] ?? tags['payment:lightning'] ?? '').toLowerCase())) lightning++;
    if (typeof tags['addr:country'] === 'string') directCountry++;
    if (typeof seed.countryCode === 'string') reviewSeedCountry++;
    if (typeof root.countryCode === 'string') topCountry++;
  }
  console.log(JSON.stringify({target:TARGET,total:unique.size,statuses:Object.fromEntries([...counts.entries()].sort()),lightning,directCountry,reviewSeedCountry,topCountry,readOnly:true,candidatePayloadExposed:false}));
}
await main();
