import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOP_N = 50;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function reviewSeed(rawPayload: unknown): JsonRecord | null {
  return record(record(rawPayload)?.reviewSeed);
}

function merchantName(rawPayload: unknown): string {
  const seed = reviewSeed(rawPayload);
  const raw = typeof seed?.name === 'string' ? seed.name : '';
  return raw.replace(/\s+/g, ' ').trim();
}

function normalizedName(rawPayload: unknown): string {
  return merchantName(rawPayload).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function paymentTags(rawPayload: unknown): Record<string, string> {
  return stringMap(reviewSeed(rawPayload)?.paymentTags);
}

function positive(value: string | undefined): boolean {
  return ['yes', 'only'].includes((value ?? '').trim().toLowerCase());
}

function normalizeDomain(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing candidate density report outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      candidateStatus: sourceCandidates.candidateStatus,
      officialDomain: sourceRecords.officialDomain,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    )
    .orderBy(asc(sourceCandidates.id));

  const eligible = rows.filter((row) => {
    if (row.duplicateGroupId !== null) return false;
    const tags = paymentTags(row.rawPayload);
    return positive(tags['payment:bitcoin']) || positive(tags['payment:lightning']);
  });

  type Group = {
    key: string;
    normalizedName: string;
    displayNames: Map<string, number>;
    domain: string;
    count: number;
    bitcoinCount: number;
    lightningCount: number;
    bothCount: number;
  };
  const groups = new Map<string, Group>();

  for (const row of eligible) {
    const name = normalizedName(row.rawPayload);
    if (!name) continue;
    const domain = normalizeDomain(row.officialDomain);
    const key = `${name}\u0000${domain || '(no-domain)'}`;
    const tags = paymentTags(row.rawPayload);
    const bitcoin = positive(tags['payment:bitcoin']);
    const lightning = positive(tags['payment:lightning']);
    const display = merchantName(row.rawPayload) || name;
    const current = groups.get(key) ?? {
      key,
      normalizedName: name,
      displayNames: new Map<string, number>(),
      domain,
      count: 0,
      bitcoinCount: 0,
      lightningCount: 0,
      bothCount: 0,
    };
    current.count += 1;
    if (bitcoin) current.bitcoinCount += 1;
    if (lightning) current.lightningCount += 1;
    if (bitcoin && lightning) current.bothCount += 1;
    current.displayNames.set(display, (current.displayNames.get(display) ?? 0) + 1);
    groups.set(key, current);
  }

  const top = [...groups.values()]
    .sort((a, b) => b.count - a.count || a.normalizedName.localeCompare(b.normalizedName))
    .slice(0, TOP_N)
    .map((group) => ({
      merchant: [...group.displayNames.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? group.normalizedName,
      normalizedName: group.normalizedName,
      officialDomain: group.domain || null,
      candidates: group.count,
      bitcoinTagged: group.bitcoinCount,
      lightningTagged: group.lightningCount,
      bothTagged: group.bothCount,
    }));

  console.log(JSON.stringify({
    target: EXPECTED_TARGET,
    originRowsScanned: rows.length,
    locationScopedBitcoinOrLightningCandidates: eligible.length,
    uniqueMerchantDomainGroups: groups.size,
    topGroups: top,
    readOnly: true,
    candidatePayloadExposed: false,
  }));
}

await main();
