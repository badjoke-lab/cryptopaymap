import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, evidence, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const BATCH_IDS = [
  '9858b338-6400-4fd3-8dbb-d8b7f3bce7a9',
  'dba76d39-37be-4fe4-afef-7a4d246220b6',
  '5392f6f9-6391-4f9b-8878-5edfa332eb04',
  '370b47e9-35ac-452e-a3f7-1d54d2c24aa3',
  '3e3f85d6-5c36-4e0d-9c65-751a0ecdf960',
  'd5e7c02d-1c1d-4fe8-8187-a6da4d4d99ae',
] as const;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_CHARS = 750_000;
const MAX_REDIRECTS = 3;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = 0, b = 0] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function unsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') || privateIpv4(host);
}

function safeOfficialUrl(rawUrl: string, officialDomain: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    if (unsafeHostname(url.hostname)) return null;
    const host = normalizeHost(url.hostname);
    const domain = normalizeHost(officialDomain);
    if (!domain || (host !== domain && !host.endsWith(`.${domain}`) && !domain.endsWith(`.${host}`))) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function normalizeHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function contextAroundPayment(text: string): string | null {
  const lower = text.toLowerCase();
  const cryptoNeedles = ['bitcoin', 'btc', 'lightning', 'cryptocurrency', 'crypto', 'usdt', 'ethereum'];
  const paymentNeedles = ['pay', 'payment', 'accept', 'checkout', 'cashier', 'register', 'in store', 'in-store', 'store', 'shop', 'location'];
  for (const crypto of cryptoNeedles) {
    let at = lower.indexOf(crypto);
    while (at >= 0) {
      const start = Math.max(0, at - 900);
      const end = Math.min(text.length, at + 1500);
      const context = text.slice(start, end);
      const contextLower = context.toLowerCase();
      if (paymentNeedles.some((needle) => contextLower.includes(needle))) return context;
      at = lower.indexOf(crypto, at + crypto.length);
    }
  }
  return null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchOfficialPage(start: URL, officialDomain: string) {
  let current = start;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'CryptoPayMap-private-review/1.0', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) return null;
        const next = safeOfficialUrl(new URL(location, current).toString(), officialDomain);
        if (!next) return null;
        current = next;
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
      const text = normalizeHtml((await response.text()).slice(0, MAX_BODY_CHARS));
      return { resolvedUrl: current.toString(), text };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) throw new Error('Refusing Evidence review outside fixed-review staging.');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      candidateUpdatedAt: sourceCandidates.updatedAt,
      evidenceId: evidence.id,
      evidenceClass: evidence.evidenceClass,
      evidenceSourceType: evidence.sourceType,
      evidenceOriginRole: evidence.originRole,
      evidencePolarity: evidence.polarity,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceUpdatedAt: evidence.updatedAt,
      sourceUrl: evidence.sourceUrl,
      officialDomain: sourceRecords.officialDomain,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .innerJoin(sourceRecords, eq(sourceRecords.id, evidence.sourceRecordId))
    .where(and(inArray(sourceCandidates.importBatchId, [...BATCH_IDS]), eq(evidence.evidenceKind, 'official_payment_page')))
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const details: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const relations = await db
      .select({ relationship: candidateSourceRecords.relationship, rawPayload: sourceRecords.rawPayload })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, row.candidateId));
    const origin = relations.find((relation) => relation.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload?.reviewSeed);
    const element = record(originPayload?.element);
    const tags = stringMap(element?.tags);
    const countryCodes = relations
      .map((relation) => record(relation.rawPayload))
      .filter((payload) => payload?.sourceSystem === 'openstreetmap_nominatim')
      .map((payload) => payload?.countryCode)
      .filter((value): value is string => typeof value === 'string');

    const sourceUrl = row.sourceUrl?.trim() ?? '';
    const officialDomain = row.officialDomain?.trim() ?? '';
    const safeUrl = sourceUrl && officialDomain ? safeOfficialUrl(sourceUrl, officialDomain) : null;
    const page = safeUrl ? await fetchOfficialPage(safeUrl, officialDomain) : null;
    const context = page ? contextAroundPayment(page.text) : null;
    const lower = page?.text.toLowerCase() ?? '';
    const structurallyValid =
      ['new', 'triaged'].includes(row.candidateStatus) &&
      row.duplicateGroupId === null &&
      row.canonicalEntityId === null &&
      row.canonicalLocationId === null &&
      row.evidenceClass === 'a' &&
      row.evidenceSourceType === 'official_page' &&
      row.evidenceOriginRole === 'merchant_side' &&
      row.evidencePolarity === 'supporting' &&
      row.evidenceReviewStatus === 'pending' &&
      row.evidenceVisibility === 'private';

    details.push({
      candidateHash: await sha256(row.candidateId),
      candidateUpdatedAt: row.candidateUpdatedAt.toISOString(),
      evidenceId: row.evidenceId,
      evidenceUpdatedAt: row.evidenceUpdatedAt.toISOString(),
      structurallyValid,
      countryCodes,
      name: seed?.name ?? null,
      latitude: seed?.latitude ?? null,
      longitude: seed?.longitude ?? null,
      paymentTags: seed?.paymentTags ?? null,
      osmType: element?.type ?? null,
      osmId: element?.id ?? null,
      addrCountry: tags['addr:country'] ?? null,
      sourceUrl,
      officialDomain,
      resolvedUrl: page?.resolvedUrl ?? null,
      liveFetchSucceeded: Boolean(page),
      paymentContextFound: Boolean(context),
      mentionsBitcoin: /\bbitcoin\b|\bbtc\b/i.test(lower),
      mentionsLightning: /\blightning\b/i.test(lower),
      mentionsGenericCrypto: /cryptocurrency|\bcrypto\b/i.test(lower),
      onlineSignals: /online store|online shop|webshop|website checkout|order online|online order/i.test(lower),
      physicalSignals: /in[- ]store|in our store|at our store|at the store|at our shop|at the shop|at our location|point of sale|cashier|at the counter|walk[- ]in/i.test(lower),
      context,
    });
  }

  process.stdout.write(JSON.stringify({
    target: EXPECTED_TARGET,
    evidenceRows: rows.length,
    structurallyValidRows: details.filter((row) => row.structurallyValid === true).length,
    liveFetchedRows: details.filter((row) => row.liveFetchSucceeded === true).length,
    paymentContextRows: details.filter((row) => row.paymentContextFound === true).length,
    physicalSignalRows: details.filter((row) => row.physicalSignals === true).length,
    mutationPerformed: false,
    publicDataChanged: false,
    payloadExposedInLogs: false,
    details,
  }));
}

await main();
