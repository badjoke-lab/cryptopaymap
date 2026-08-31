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
const FETCH_TIMEOUT_MS = 5_000;
const MAX_BODY_CHARS = 750_000;
const MAX_PAGES_PER_CANDIDATE = 12;
const MAX_LINKS_PER_PAGE = 30;

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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function linkScore(url: URL, anchor: string): number {
  const haystack = `${url.pathname} ${anchor}`.toLowerCase();
  let score = 0;
  if (/(?:lightning|bitcoin|btc|crypto|sats?|ビットコイン|ライトニング)/i.test(haystack)) score += 10;
  if (/(?:payment|payments|pay|checkout|invoice|wallet|qr|決済|支払|支払い)/i.test(haystack)) score += 8;
  if (/(?:faq|help|support|guide|how|terms|about|menu|shop)/i.test(haystack)) score += 2;
  return score;
}

function relevantLinks(html: string, base: URL, officialDomain: string): URL[] {
  const seen = new Set<string>();
  const links: Array<{ url: URL; score: number }> = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = decodeEntities(match[1] ?? '').trim();
    if (!href || href.startsWith('#') || /^(?:mailto:|tel:|javascript:)/i.test(href)) continue;
    let absolute: URL;
    try {
      absolute = new URL(href, base);
    } catch {
      continue;
    }
    const safe = safeOfficialUrl(absolute.toString(), officialDomain);
    if (!safe) continue;
    safe.search = '';
    safe.hash = '';
    const key = safe.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const anchor = normalizeHtml(match[2] ?? '');
    links.push({ url: safe, score: linkScore(safe, anchor) });
  }
  return links.sort((left, right) => right.score - left.score || left.url.toString().localeCompare(right.url.toString())).slice(0, MAX_LINKS_PER_PAGE).map((entry) => entry.url);
}

async function fetchPage(start: URL, officialDomain: string): Promise<{ url: URL; html: string; text: string } | null> {
  let current = start;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'CryptoPayMap-targeted-payment-detail-audit/1.0',
          accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirect === 3) return null;
        const next = safeOfficialUrl(new URL(location, current).toString(), officialDomain);
        if (!next) return null;
        current = next;
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
      const html = (await response.text()).slice(0, MAX_BODY_CHARS);
      return { url: current, html, text: normalizeHtml(html) };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) throw new Error('Refusing targeted audit outside fixed-review staging.');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      candidateUpdatedAt: sourceCandidates.updatedAt,
      evidenceId: evidence.id,
      evidenceUpdatedAt: evidence.updatedAt,
      evidenceSourceUrl: sourceRecords.sourceUrl,
      officialDomain: sourceRecords.officialDomain,
    })
    .from(evidence)
    .innerJoin(sourceRecords, eq(sourceRecords.id, evidence.sourceRecordId))
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(and(
      inArray(sourceCandidates.importBatchId, [...REVIEW_BATCH_IDS]),
      eq(evidence.evidenceKind, 'official_payment_page'),
      eq(evidence.evidenceClass, 'a'),
      eq(evidence.sourceType, 'official_page'),
      eq(evidence.originRole, 'merchant_side'),
      eq(evidence.polarity, 'supporting'),
      eq(evidence.reviewStatus, 'pending'),
      eq(evidence.visibility, 'private'),
    ))
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const relations = await db
      .select({ relationship: candidateSourceRecords.relationship, rawPayload: sourceRecords.rawPayload })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, row.candidateId));
    const origin = relations.find((relation) => relation.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload?.reviewSeed);
    const paymentTags = stringMap(seed?.paymentTags);
    const countryCodes = [...new Set(relations.map((relation) => record(relation.rawPayload)).filter((payload) => payload?.sourceSystem === 'openstreetmap_nominatim').map((payload) => payload?.countryCode).filter((value): value is string => typeof value === 'string' && /^[A-Za-z]{2}$/.test(value)).map((value) => value.toUpperCase()))].sort();
    const lightningTagged = ['yes', 'only'].includes((paymentTags['payment:lightning'] ?? '').toLowerCase());
    const bitcoinTagged = ['yes', 'only'].includes((paymentTags['payment:bitcoin'] ?? '').toLowerCase());

    const domain = row.officialDomain;
    const starts: URL[] = [];
    if (domain) {
      if (row.evidenceSourceUrl) {
        const evidenceUrl = safeOfficialUrl(row.evidenceSourceUrl, domain);
        if (evidenceUrl) starts.push(evidenceUrl);
      }
      const websiteUrl = typeof seed?.websiteUrl === 'string' ? seed.websiteUrl.trim() : '';
      if (websiteUrl) {
        const originUrl = safeOfficialUrl(websiteUrl, domain);
        if (originUrl && !starts.some((url) => url.toString() === originUrl.toString())) starts.push(originUrl);
      }
    }

    const queue = [...starts];
    const visited = new Set<string>();
    let pagesFetched = 0;
    let mentionsBitcoin = false;
    let mentionsLightning = false;
    let mentionsInvoice = false;
    let mentionsQr = false;
    let mentionsNfc = false;
    let mentionsPayment = false;
    let lightningPaymentSamePage = false;
    let lightningInvoiceSamePage = false;
    let lightningQrSamePage = false;

    while (queue.length > 0 && pagesFetched < MAX_PAGES_PER_CANDIDATE && domain) {
      const next = queue.shift();
      if (!next) break;
      const key = next.toString();
      if (visited.has(key)) continue;
      visited.add(key);
      const page = await fetchPage(next, domain);
      if (!page) continue;
      pagesFetched += 1;
      const text = page.text;
      const bitcoin = /\b(?:bitcoin|btc|sats?)\b|ビットコイン/i.test(text);
      const lightning = /\blightning\b|ライトニング/i.test(text);
      const invoice = /\b(?:invoice|bolt11)\b|請求/i.test(text);
      const qr = /\bqr(?:\s|-)?code\b|qrcode|qrコード/i.test(text);
      const nfc = /\bnfc\b|contactless/i.test(text);
      const payment = /\b(?:pay|payment|accept|checkout)\w*\b|決済|支払|支払い/i.test(text);
      mentionsBitcoin ||= bitcoin;
      mentionsLightning ||= lightning;
      mentionsInvoice ||= invoice;
      mentionsQr ||= qr;
      mentionsNfc ||= nfc;
      mentionsPayment ||= payment;
      lightningPaymentSamePage ||= lightning && payment;
      lightningInvoiceSamePage ||= lightning && invoice;
      lightningQrSamePage ||= lightning && qr;

      for (const link of relevantLinks(page.html, page.url, domain)) {
        if (!visited.has(link.toString()) && queue.length < MAX_PAGES_PER_CANDIDATE * 3) queue.push(link);
      }
    }

    const stateReady = ['new', 'triaged'].includes(row.candidateStatus) && row.duplicateGroupId === null && countryCodes.length === 1;
    const lightningRouteEvidenceReady = stateReady && lightningTagged && mentionsBitcoin && lightningPaymentSamePage && (lightningInvoiceSamePage || lightningQrSamePage);

    results.push({
      candidateHash: await sha256(row.candidateId),
      evidenceHash: await sha256(row.evidenceId),
      candidateUpdatedAt: row.candidateUpdatedAt.toISOString(),
      evidenceUpdatedAt: row.evidenceUpdatedAt.toISOString(),
      countryCodes,
      duplicateFree: row.duplicateGroupId === null,
      lightningTagged,
      bitcoinTagged,
      pagesFetched,
      mentionsBitcoin,
      mentionsLightning,
      mentionsInvoice,
      mentionsQr,
      mentionsNfc,
      mentionsPayment,
      lightningPaymentSamePage,
      lightningInvoiceSamePage,
      lightningQrSamePage,
      lightningRouteEvidenceReady,
    });
  }

  process.stdout.write(JSON.stringify({
    target: EXPECTED_TARGET,
    pendingAEvidenceRows: rows.length,
    lightningRouteEvidenceReady: results.filter((row) => row.lightningRouteEvidenceReady === true).length,
    results,
    mutationPerformed: false,
    publicDataChanged: false,
    payloadExposed: false,
    sourceUrlExposed: false,
  }));
}

await main();
