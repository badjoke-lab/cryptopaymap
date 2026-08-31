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
const REVIEW_BATCH_IDS = [
  'd0e17010-611c-48b2-a75d-8b389c1bee60',
  '5c85e86a-bc05-4f9d-a1f3-9d5e6135ef81',
  '8d9d6627-48f6-43e7-b7f0-7a90e1ed4689',
  '8e2c7c6a-e300-4747-90f7-290327870426',
  '3808ea78-195f-4558-8088-37c172be6b63',
] as const;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_BODY_CHARS = 750_000;
const CONCURRENCY = 4;

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
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function unsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:') ||
    privateIpv4(host)
  );
}

function safeOfficialUrl(rawUrl: string | null, officialDomain: string | null): URL | null {
  if (!rawUrl || !officialDomain) return null;
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
    .trim()
    .toLowerCase();
}

function explicitPaymentContext(text: string): boolean {
  const cryptoTerm = '(?:bitcoin|btc|lightning|sats?|cryptocurrency|crypto|ビットコイン|ライトニング)';
  const paymentTerm = '(?:pay(?:ment|ing)?|accept(?:ed|s|ing)?|checkout|決済|支払|支払い)';
  return new RegExp(`${cryptoTerm}.{0,120}${paymentTerm}|${paymentTerm}.{0,120}${cryptoTerm}`, 'i').test(text);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchCurrentOfficialPage(url: URL): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'user-agent': 'CryptoPayMap-official-evidence-readonly-audit/1.0',
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    return normalizeHtml((await response.text()).slice(0, MAX_BODY_CHARS));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing Europe-west Evidence audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      candidateUpdatedAt: sourceCandidates.updatedAt,
      evidenceId: evidence.id,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceUpdatedAt: evidence.updatedAt,
      evidenceSourceUrl: sourceRecords.sourceUrl,
      evidenceOfficialDomain: sourceRecords.officialDomain,
    })
    .from(evidence)
    .innerJoin(sourceRecords, eq(sourceRecords.id, evidence.sourceRecordId))
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, [...REVIEW_BATCH_IDS]),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.originRole, 'merchant_side'),
        eq(evidence.polarity, 'supporting'),
        eq(evidence.reviewStatus, 'pending'),
        eq(evidence.visibility, 'private'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const results: Array<Record<string, unknown>> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++;
      const row = rows[index];
      if (!row) continue;

      const relations = await db
        .select({ relationship: candidateSourceRecords.relationship, rawPayload: sourceRecords.rawPayload })
        .from(candidateSourceRecords)
        .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
        .where(eq(candidateSourceRecords.candidateId, row.candidateId));
      const origin = relations.find((relation) => relation.relationship === 'origin');
      const originPayload = record(origin?.rawPayload);
      const seed = record(originPayload?.reviewSeed);
      const paymentTags = stringMap(seed?.paymentTags);
      const lightningTagged = ['yes', 'only'].includes((paymentTags['payment:lightning'] ?? '').toLowerCase());
      const bitcoinTagged = ['yes', 'only'].includes((paymentTags['payment:bitcoin'] ?? '').toLowerCase());
      const cryptoTagged = ['yes', 'only'].includes((paymentTags['payment:cryptocurrencies'] ?? '').toLowerCase());
      const countryCodes = [
        ...new Set(
          relations
            .map((relation) => record(relation.rawPayload))
            .filter((payload) => payload?.sourceSystem === 'openstreetmap_nominatim')
            .map((payload) => payload?.countryCode)
            .filter((value): value is string => typeof value === 'string' && /^[A-Za-z]{2}$/.test(value))
            .map((value) => value.toUpperCase()),
        ),
      ].sort();

      const safeUrl = safeOfficialUrl(row.evidenceSourceUrl, row.evidenceOfficialDomain);
      const text = safeUrl ? await fetchCurrentOfficialPage(safeUrl) : null;
      const officialPageFetched = text !== null;
      const officialPaymentContext = text ? explicitPaymentContext(text) : false;
      const officialMentionsBitcoin = text ? /\b(?:bitcoin|btc|sats?)\b/i.test(text) : false;
      const officialMentionsLightning = text ? /\blightning\b|ライトニング/i.test(text) : false;
      const officialMentionsCryptoGeneric = text ? /\b(?:cryptocurrency|crypto)\b/i.test(text) : false;
      const exactStateReady =
        row.candidateType === 'physical_place' &&
        ['new', 'triaged'].includes(row.candidateStatus) &&
        row.duplicateGroupId === null &&
        countryCodes.length === 1;
      const lightningBtcReviewReady =
        exactStateReady &&
        lightningTagged &&
        officialPageFetched &&
        officialPaymentContext &&
        officialMentionsBitcoin &&
        officialMentionsLightning;
      const bitcoinReviewReady =
        exactStateReady &&
        (bitcoinTagged || lightningTagged) &&
        officialPageFetched &&
        officialPaymentContext &&
        officialMentionsBitcoin;

      results.push({
        candidateHash: await sha256(row.candidateId),
        evidenceHash: await sha256(row.evidenceId),
        candidateUpdatedAt: row.candidateUpdatedAt.toISOString(),
        evidenceUpdatedAt: row.evidenceUpdatedAt.toISOString(),
        candidateStatus: row.candidateStatus,
        duplicateFree: row.duplicateGroupId === null,
        countryCodes,
        lightningTagged,
        bitcoinTagged,
        cryptoTagged,
        officialPageFetched,
        officialPaymentContext,
        officialMentionsBitcoin,
        officialMentionsLightning,
        officialMentionsCryptoGeneric,
        exactStateReady,
        bitcoinReviewReady,
        lightningBtcReviewReady,
      });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  results.sort((left, right) => String(left.candidateHash).localeCompare(String(right.candidateHash)));

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      importBatchCount: REVIEW_BATCH_IDS.length,
      pendingAEvidenceRows: rows.length,
      exactStateReady: results.filter((row) => row.exactStateReady === true).length,
      bitcoinReviewReady: results.filter((row) => row.bitcoinReviewReady === true).length,
      lightningBtcReviewReady: results.filter((row) => row.lightningBtcReviewReady === true).length,
      results,
      mutationPerformed: false,
      publicDataChanged: false,
      payloadExposed: false,
      sourceUrlExposed: false,
    }),
  );
}

await main();
