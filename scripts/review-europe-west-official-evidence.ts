import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const BATCH_IDS = [
  'd0e17010-611c-48b2-a75d-8b389c1bee60',
  '5c85e86a-bc05-4f9d-a1f3-9d5e6135ef81',
  '8d9d6627-48f6-43e7-b7f0-290327870426',
  '8e2c7c6a-e300-4747-90f7-290327870426',
  '3808ea78-195f-4558-8088-37c172be6b63',
] as const;
const APPROVED_CANDIDATE_HASHES = new Set([
  '61af688c243438b352a6db8a31034a56b97b4abb83efbbbc59d0b3a7fe6df2e7',
  '26c7656b1f1b7500430dbb0800b713c035875fb8b8481c53e93c4e1891b0d82d',
  'b0d5b13c5c3b9ad3ea9a4ee8c9f29d39d45512bcc2164ea5a4d67de4ca8364d2',
  '52d2304917b9d88e1a598cccfa2bdf592cd3dc8a506a78edf2ec725bbde45ba2',
]);
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
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function unsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host.endsWith('.internal') || host === '::1' || host.startsWith('fc') || host.startsWith('fd') ||
    host.startsWith('fe80:') || privateIpv4(host);
}

function safeOfficialUrl(rawUrl: string, officialDomain: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    if (unsafeHostname(url.hostname)) return null;
    const host = normalizeHost(url.hostname);
    const domain = normalizeHost(officialDomain);
    if (!domain || (host !== domain && !host.endsWith(`.${domain}`) && !domain.endsWith(`.${host}`))) {
      return null;
    }
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
    .replace(/\s+/g, ' ')
    .trim();
}

function paymentMatch(text: string): string | null {
  const cryptoTerm = '(?:bitcoin|btc|lightning|sats?|cryptocurrency|crypto|bitcoins?|kryptowährung(?:en)?|krypto|criptovalut[ae])';
  const paymentTerm = '(?:pay(?:ment|ing)?|accept(?:ed|s|ing)?|checkout|zahlung(?:en)?|bezahlen|akzeptier(?:t|en)|pagament[oi]|pagar|accett(?:a|iamo|ato))';
  const pattern = new RegExp(`(?:${cryptoTerm}.{0,180}${paymentTerm}|${paymentTerm}.{0,180}${cryptoTerm})`, 'i');
  const match = text.match(pattern)?.[0]?.replace(/\s+/g, ' ').trim() ?? null;
  return match ? match.slice(0, 420) : null;
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
        headers: {
          'user-agent': 'CryptoPayMap-exact-official-evidence-review/1.0',
          accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        },
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
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing exact Evidence review outside fixed-review staging.');
  }
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
    .where(and(
      inArray(sourceCandidates.importBatchId, [...BATCH_IDS]),
      eq(evidence.evidenceKind, 'official_payment_page'),
    ))
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const selected: typeof rows = [];
  for (const row of rows) {
    const hash = await sha256(row.candidateId);
    if (APPROVED_CANDIDATE_HASHES.has(hash)) selected.push(row);
  }
  if (selected.length !== APPROVED_CANDIDATE_HASHES.size) {
    throw new Error('Exact reviewed Candidate set is missing, duplicated, or changed.');
  }

  const details: Array<Record<string, unknown>> = [];
  for (const row of selected) {
    const candidateHash = await sha256(row.candidateId);
    const relations = await db
      .select({ relationship: candidateSourceRecords.relationship, rawPayload: sourceRecords.rawPayload })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, row.candidateId));
    const origin = relations.find((relation) => relation.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload?.reviewSeed);
    const paymentTags = stringMap(seed?.paymentTags);
    const countryCode = relations
      .map((relation) => record(relation.rawPayload))
      .filter((payload) => payload?.sourceSystem === 'openstreetmap_nominatim')
      .map((payload) => payload?.countryCode)
      .find((value): value is string => typeof value === 'string' && /^[A-Z]{2}$/.test(value)) ?? null;

    const sourceUrl = row.sourceUrl?.trim() ?? '';
    const officialDomain = row.officialDomain?.trim() ?? '';
    const safeUrl = sourceUrl && officialDomain ? safeOfficialUrl(sourceUrl, officialDomain) : null;
    const page = safeUrl ? await fetchOfficialPage(safeUrl, officialDomain) : null;
    const match = page ? paymentMatch(page.text) : null;
    const normalized = page?.text.toLowerCase() ?? '';
    const structurallyValid =
      row.candidateStatus !== 'rejected' && row.duplicateGroupId === null &&
      row.canonicalEntityId === null && row.canonicalLocationId === null &&
      row.evidenceClass === 'a' && row.evidenceSourceType === 'official_page' &&
      row.evidenceOriginRole === 'merchant_side' && row.evidencePolarity === 'supporting' &&
      row.evidenceReviewStatus === 'pending' && row.evidenceVisibility === 'private';

    details.push({
      candidateHash,
      candidateUpdatedAt: row.candidateUpdatedAt.toISOString(),
      evidenceId: row.evidenceId,
      evidenceUpdatedAt: row.evidenceUpdatedAt.toISOString(),
      countryCode,
      paymentTags,
      structurallyValid,
      liveFetchSucceeded: Boolean(page),
      livePaymentMatch: Boolean(match),
      lightningMention: /\blightning\b/i.test(normalized),
      bitcoinMention: /\bbitcoin\b|\bbtc\b|\bsats?\b/i.test(normalized),
      genericCryptoMention: /cryptocurrency|\bcrypto\b|kryptowährung|\bkrypto\b|criptovalut/i.test(normalized),
      resolvedUrl: page?.resolvedUrl ?? null,
      matchedText: match,
    });
  }

  process.stdout.write(JSON.stringify({
    target: EXPECTED_TARGET,
    exactCandidateCount: selected.length,
    mutationPerformed: false,
    publicDataChanged: false,
    payloadExposedInLogs: false,
    details,
  }));
}

await main();
