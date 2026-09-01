import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords, sources } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function tags(rawPayload: unknown): Record<string, string> {
  const root = record(rawPayload);
  const candidates = [
    record(root.element).tags,
    record(root.rawRecord).tags,
    record(root.normalizedRecord).tags,
    root.tags,
  ];
  for (const candidate of candidates) {
    const value = record(candidate);
    if (Object.keys(value).length === 0) continue;
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) =>
        typeof child === 'string' ? [[key, child] as const] : [],
      ),
    );
  }
  return {};
}

function affirmative(tags: Record<string, string>): boolean {
  return Object.entries(tags).some(
    ([key, value]) =>
      key.startsWith('payment:') &&
      ['yes', 'only', 'true', '1'].includes(value.trim().toLowerCase()) &&
      ['payment:bitcoin','payment:lightning','payment:cryptocurrencies','payment:ethereum','payment:litecoin','payment:monero','payment:dash','payment:dogecoin','payment:bitcoin_cash'].includes(key),
  );
}

function host(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function increment(map: Map<string, number>, key: string | null | undefined) {
  const normalized = key?.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function top(map: Map<string, number>, limit = 50) {
  return [...map.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing staging report outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .innerJoin(sources, eq(sources.id, sourceRecords.sourceId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        eq(candidateSourceRecords.relationship, 'origin'),
        eq(sources.sourceType, 'osm'),
      ),
    );

  const unique = new Map(rows.map((row) => [row.candidateId, row]));
  const brands = new Map<string, number>();
  const wikidata = new Map<string, number>();
  const hosts = new Map<string, number>();
  let cryptoTagged = 0;
  let rowsWithBrand = 0;
  let rowsWithHost = 0;

  for (const row of unique.values()) {
    const osmTags = tags(row.rawPayload);
    if (!affirmative(osmTags)) continue;
    cryptoTagged += 1;
    const brand = osmTags.brand ?? osmTags.operator ?? null;
    const brandWikidata = osmTags['brand:wikidata'] ?? osmTags['operator:wikidata'] ?? null;
    const websiteHost = host(osmTags.website ?? osmTags['contact:website']);
    if (brand) rowsWithBrand += 1;
    if (websiteHost) rowsWithHost += 1;
    increment(brands, brand);
    increment(wikidata, brandWikidata);
    increment(hosts, websiteHost);
  }

  console.log(JSON.stringify({
    target: TARGET,
    osmPhysicalCandidates: unique.size,
    cryptoTaggedPhysicalCandidates: cryptoTagged,
    rowsWithBrand,
    rowsWithWebsiteHost: rowsWithHost,
    topBrands: top(brands),
    topBrandWikidata: top(wikidata),
    topWebsiteHosts: top(hosts),
    readOnly: true,
    candidatePayloadExposed: false,
  }));
}

await main();
