import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: {
  env: Record<string, string | undefined>;
};

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function reviewSeed(rawPayload: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(rawPayload)?.reviewSeed);
}

function paymentTags(rawPayload: unknown): Record<string, string> {
  const raw = asRecord(reviewSeed(rawPayload)?.paymentTags);
  if (raw === null) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function hasPositivePaymentTag(tags: Record<string, string>): boolean {
  return Object.entries(tags).some(
    ([key, value]) => key.startsWith('payment:') && ['yes', 'only'].includes(value.toLowerCase()),
  );
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing to audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const db = createDatabase(databaseUrl);
  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      status: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      priority: sourceCandidates.priority,
      officialDomain: sourceRecords.officialDomain,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    );

  let withOfficialWebsite = 0;
  let withPositivePaymentTag = 0;
  let withOfficialWebsiteAndPaymentTag = 0;
  let duplicateReviewRequired = 0;
  let highPriority = 0;
  const statusCounts: Record<string, number> = {};
  const paymentKeyCounts: Record<string, number> = {};

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    const tags = paymentTags(row.rawPayload);
    const hasPayment = hasPositivePaymentTag(tags);
    const hasWebsite = row.officialDomain !== null;
    if (hasWebsite) withOfficialWebsite += 1;
    if (hasPayment) withPositivePaymentTag += 1;
    if (hasWebsite && hasPayment) withOfficialWebsiteAndPaymentTag += 1;
    if (row.duplicateGroupId !== null) duplicateReviewRequired += 1;
    if ((row.priority ?? 0) >= 600) highPriority += 1;

    for (const [key, value] of Object.entries(tags)) {
      if (!['yes', 'only'].includes(value.toLowerCase())) continue;
      paymentKeyCounts[key] = (paymentKeyCounts[key] ?? 0) + 1;
    }
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      candidateCount: rows.length,
      statusCounts,
      withOfficialWebsite,
      withPositivePaymentTag,
      withOfficialWebsiteAndPaymentTag,
      duplicateReviewRequired,
      highPriority,
      paymentKeyCounts,
      automaticConfirmedCount: 0,
      nextLane: 'independent_official_evidence_enrichment',
    }),
  );
}

await main();
