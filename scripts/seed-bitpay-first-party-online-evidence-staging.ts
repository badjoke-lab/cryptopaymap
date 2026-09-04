import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const BITPAY_SOURCE_NAME = 'BitPay Merchant Directory';
const MAX_TARGETS = 100;
const MAX_INTERNAL_PAGES = 4;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_CHARS = 800_000;

type Candidate = {
  id: string;
  normalizedName: string;
  detailSourceRecordId: string;
  detailUrl: string;
};

type VerifiedPage = {
  url: string;
  domain: string;
  contentHash: string;
};

function decode(text: string): string {
  return text
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

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function excludedExternalHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return (
    normalized === 'bitpay.com' ||
    normalized.endsWith('.bitpay.com') ||
    normalized === 'facebook.com' ||
    normalized.endsWith('.facebook.com') ||
    normalized === 'instagram.com' ||
    normalized.endsWith('.instagram.com') ||
    normalized === 'twitter.com' ||
    normalized === 'x.com' ||
    normalized.endsWith('.x.com') ||
    normalized === 'linkedin.com' ||
    normalized.endsWith('.linkedin.com') ||
    normalized === 'youtube.com' ||
    normalized.endsWith('.youtube.com') ||
    normalized === 'apple.com' ||
    normalized.endsWith('.apple.com') ||
    normalized === 'google.com' ||
    normalized.endsWith('.google.com')
  );
}

function absoluteHttpUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)),
  ).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x80;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function fetchHtml(url: string): Promise<{ url: string; html: string } | null> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; CryptoPayMap/1.0; +https://cryptopaymap.com)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('text/html') && !type.includes('text/plain')) return null;
    return { url: response.url, html: (await response.text()).slice(0, MAX_BODY_CHARS) };
  } catch {
    return null;
  }
}

function merchantTargetsFromBitPay(html: string, detailUrl: string): string[] {
  const scored = new Map<string, number>();
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchor)) {
    const href = match[1] ?? '';
    const url = absoluteHttpUrl(href, detailUrl);
    if (!url) continue;
    const host = normalizeHost(new URL(url).hostname);
    if (!host || excludedExternalHost(host)) continue;
    const label = decode(match[2] ?? '').toLowerCase();
    let score = 1;
    if (/shop with crypto|shop now|visit|website|buy|book|donate|pay/i.test(label)) score += 10;
    if (/crypto|bitcoin/i.test(label)) score += 8;
    scored.set(url, Math.max(scored.get(url) ?? 0, score));
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([url]) => url)
    .slice(0, 3);
}

function explicitMerchantCryptoAcceptance(text: string): boolean {
  const value = text.toLowerCase();
  const negated = [
    /(?:do not|don't|does not|doesn't|no longer|not|cannot|can't)\s+(?:currently\s+)?(?:accept|support|take|offer)[^.!?]{0,120}(?:bitcoin|btc|cryptocurrency|crypto|bitpay)/i,
    /(?:bitcoin|btc|cryptocurrency|crypto|bitpay)[^.!?]{0,120}(?:not accepted|not supported|unavailable|no longer accepted)/i,
  ].some((pattern) => pattern.test(value));
  if (negated) return false;
  return [
    /(?:accept|accepts|accepted|support|supports|take|takes|offer|offers)[^.!?]{0,140}(?:bitcoin|btc|cryptocurrency|crypto)/i,
    /(?:bitcoin|btc|cryptocurrency|crypto)[^.!?]{0,140}(?:accept|accepted|payment|pay|checkout)/i,
    /(?:pay|payment|checkout)[^.!?]{0,140}(?:bitcoin|btc|cryptocurrency|crypto)/i,
    /(?:choose|select|use)[^.!?]{0,100}bitpay[^.!?]{0,100}(?:checkout|payment|pay)/i,
    /bitpay[^.!?]{0,120}(?:checkout|payment|pay|invoice)/i,
  ].some((pattern) => pattern.test(value));
}

function internalCandidateLinks(html: string, pageUrl: string, domain: string): string[] {
  const values = new Set<string>();
  const link = /href=["']([^"']+)["']/gi;
  for (const match of html.matchAll(link)) {
    const value = absoluteHttpUrl(match[1] ?? '', pageUrl);
    if (!value) continue;
    const url = new URL(value);
    if (normalizeHost(url.hostname) !== domain) continue;
    if (!/(crypto|bitcoin|payment|checkout|billing|faq|help|support)/i.test(url.pathname)) continue;
    values.add(value);
  }
  return [...values].sort().slice(0, MAX_INTERNAL_PAGES);
}

async function verifyFirstParty(startUrl: string): Promise<VerifiedPage | null> {
  const first = await fetchHtml(startUrl);
  if (!first) return null;
  const domain = normalizeHost(new URL(first.url).hostname);
  if (!domain || excludedExternalHost(domain)) return null;
  const queue = [first, ...([] as Array<{ url: string; html: string }>)];
  const visited = new Set<string>();
  let current = first;
  for (let index = 0; index <= MAX_INTERNAL_PAGES && current; index += 1) {
    if (visited.has(current.url)) break;
    visited.add(current.url);
    if (normalizeHost(new URL(current.url).hostname) !== domain) return null;
    if (explicitMerchantCryptoAcceptance(decode(current.html))) {
      return { url: current.url, domain, contentHash: await sha256(current.html) };
    }
    const links = internalCandidateLinks(current.html, current.url, domain).filter(
      (url) => !visited.has(url),
    );
    let next: { url: string; html: string } | null = null;
    for (const link of links) {
      next = await fetchHtml(link);
      if (next) break;
    }
    current = next as { url: string; html: string };
  }
  void queue;
  return null;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing first-party online Evidence seeding outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const [bitpaySource] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.sourceType, 'processor'), eq(sources.name, BITPAY_SOURCE_NAME)))
    .limit(1);
  if (!bitpaySource) throw new Error('BitPay processor source is missing from staging.');

  const rows = await db
    .select({
      id: sourceCandidates.id,
      normalizedName: sourceCandidates.normalizedName,
      detailSourceRecordId: sourceRecords.id,
      detailUrl: sourceRecords.sourceUrl,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'online_service'),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
        eq(candidateSourceRecords.relationship, 'origin'),
        eq(sourceRecords.sourceId, bitpaySource.id),
      ),
    )
    .orderBy(asc(sourceCandidates.id))
    .limit(MAX_TARGETS);

  const candidates: Candidate[] = rows
    .filter((row): row is typeof row & { detailUrl: string } => Boolean(row.detailUrl))
    .map((row) => ({ ...row, detailUrl: row.detailUrl }));

  const counters = {
    candidatesScanned: candidates.length,
    bitpayDetailsFetched: 0,
    merchantTargetsResolved: 0,
    firstPartyPagesVerified: 0,
    sourceRecordsCreated: 0,
    supportingLinksCreated: 0,
    pendingEvidenceCreated: 0,
    alreadyPersisted: 0,
  };

  for (const candidate of candidates) {
    const detail = await fetchHtml(candidate.detailUrl);
    if (!detail) continue;
    counters.bitpayDetailsFetched += 1;
    const targets = merchantTargetsFromBitPay(detail.html, candidate.detailUrl);
    if (targets.length === 0) continue;
    counters.merchantTargetsResolved += 1;

    let verified: VerifiedPage | null = null;
    for (const target of targets) {
      verified = await verifyFirstParty(target);
      if (verified) break;
    }
    if (!verified) continue;
    counters.firstPartyPagesVerified += 1;

    let [officialSource] = await db
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(eq(sources.sourceType, 'official_site'), eq(sources.baseUrl, `https://${verified.domain}/`)),
      )
      .limit(1);
    if (!officialSource) {
      [officialSource] = await db
        .insert(sources)
        .values({
          sourceType: 'official_site',
          name: `${verified.domain} official site`,
          baseUrl: `https://${verified.domain}/`,
          attributionText: null,
          isActive: true,
        })
        .returning({ id: sources.id });
    }
    if (!officialSource) throw new Error('Failed to resolve official merchant source.');

    const externalId = `bitpay-first-party:${candidate.id}`;
    const [existingRecord] = await db
      .select({ id: sourceRecords.id })
      .from(sourceRecords)
      .where(and(eq(sourceRecords.sourceId, officialSource.id), eq(sourceRecords.externalId, externalId)))
      .limit(1);
    let sourceRecordId = existingRecord?.id ?? null;
    if (!sourceRecordId) {
      sourceRecordId = await deterministicUuid(`bitpay-first-party-source-record:${candidate.id}`);
      await db.insert(sourceRecords).values({
        id: sourceRecordId,
        sourceId: officialSource.id,
        externalId,
        sourceUrl: verified.url,
        rawPayload: {
          discovery: 'bitpay_pay_direct_first_party_verification',
          processorSourceRecordId: candidate.detailSourceRecordId,
          merchantDomain: verified.domain,
          reviewSeed: { candidateType: 'online_service' },
        },
        officialDomain: verified.domain,
        observedAt: new Date(),
        fetchedAt: new Date(),
        contentHash: verified.contentHash,
      });
      counters.sourceRecordsCreated += 1;
      await db
        .insert(candidateSourceRecords)
        .values({ candidateId: candidate.id, sourceRecordId, relationship: 'supporting' })
        .onConflictDoNothing();
      counters.supportingLinksCreated += 1;
    }

    const evidenceId = await deterministicUuid(`bitpay-first-party-evidence:${candidate.id}`);
    const [existingEvidence] = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(eq(evidence.id, evidenceId))
      .limit(1);
    if (existingEvidence) {
      counters.alreadyPersisted += 1;
      continue;
    }
    await db.insert(evidence).values({
      id: evidenceId,
      claimId: null,
      sourceRecordId,
      evidenceKind: 'official_payment_page',
      evidenceClass: 'a',
      sourceType: 'official_page',
      originRole: 'merchant_side',
      polarity: 'supporting',
      sourceName: `${verified.domain} official site`,
      sourceUrl: verified.url,
      observedAt: new Date(),
      fetchedAt: new Date(),
      summary: 'The merchant first-party site explicitly presents cryptocurrency or BitPay as a payment option.',
      visibility: 'private',
      reviewStatus: 'pending',
      contentHash: verified.contentHash,
      independenceKey: null,
    });
    counters.pendingEvidenceCreated += 1;
  }

  console.log(
    JSON.stringify({
      target: TARGET,
      source: BITPAY_SOURCE_NAME,
      ...counters,
      evidenceClass: 'a',
      evidenceKind: 'official_payment_page',
      automaticConfirmedCount: 0,
      automaticPublicVisibility: false,
      candidatePayloadExposed: false,
    }),
  );
}

await main();
