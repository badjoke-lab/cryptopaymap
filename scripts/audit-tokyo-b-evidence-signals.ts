import { and, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';
const DAY_MS = 24 * 60 * 60 * 1000;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const record = object(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function parseOsmDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] ?? '01');
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function dateSignals(tags: Record<string, string>): Date[] {
  const keys = Object.keys(tags).filter(
    (key) =>
      key === 'check_date' ||
      key === 'survey:date' ||
      key === 'source:date' ||
      key.startsWith('check_date:payment') ||
      key.startsWith('payment:check_date'),
  );
  return keys
    .map((key) => parseOsmDate(tags[key]))
    .filter((value): value is Date => value !== null);
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing B-evidence signal audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      officialDomain: sourceRecords.officialDomain,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    );

  const now = Date.now();
  const counters = {
    remainingCandidates: rows.length,
    duplicateReviewRequired: 0,
    noDuplicateSignal: 0,
    officialDomain: 0,
    anyDateSignal: 0,
    recent180: 0,
    recent365: 0,
    recent180NoDuplicate: 0,
    recent365NoDuplicate: 0,
    recent180WithOfficialDomain: 0,
    recent365WithOfficialDomain: 0,
    recent180NoDuplicateWithOfficialDomain: 0,
    recent365NoDuplicateWithOfficialDomain: 0,
    positiveLightningTag: 0,
    positiveBitcoinTag: 0,
    positiveCryptoTag: 0,
  };

  for (const row of rows) {
    const duplicate = row.duplicateGroupId !== null;
    if (duplicate) counters.duplicateReviewRequired += 1;
    else counters.noDuplicateSignal += 1;
    if (row.officialDomain) counters.officialDomain += 1;

    const payload = object(row.rawPayload);
    const element = object(payload?.element);
    const tags = stringMap(element?.tags);
    const positive = (value: string | undefined) => value === 'yes' || value === 'only';
    if (positive(tags['payment:lightning'])) counters.positiveLightningTag += 1;
    if (positive(tags['payment:bitcoin'])) counters.positiveBitcoinTag += 1;
    if (positive(tags['payment:cryptocurrencies'])) counters.positiveCryptoTag += 1;

    const dates = dateSignals(tags);
    if (dates.length === 0) continue;
    counters.anyDateSignal += 1;
    const newest = Math.max(...dates.map((date) => date.getTime()));
    const ageDays = (now - newest) / DAY_MS;
    const recent180 = ageDays >= 0 && ageDays <= 180;
    const recent365 = ageDays >= 0 && ageDays <= 365;
    if (recent180) {
      counters.recent180 += 1;
      if (!duplicate) counters.recent180NoDuplicate += 1;
      if (row.officialDomain) counters.recent180WithOfficialDomain += 1;
      if (!duplicate && row.officialDomain) counters.recent180NoDuplicateWithOfficialDomain += 1;
    }
    if (recent365) {
      counters.recent365 += 1;
      if (!duplicate) counters.recent365NoDuplicate += 1;
      if (row.officialDomain) counters.recent365WithOfficialDomain += 1;
      if (!duplicate && row.officialDomain) counters.recent365NoDuplicateWithOfficialDomain += 1;
    }
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      ...counters,
      classificationApplied: false,
      mutationPerformed: false,
      payloadExposed: false,
    }),
  );
}

await main();
