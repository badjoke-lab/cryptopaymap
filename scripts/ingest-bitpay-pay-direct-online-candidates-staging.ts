import { and, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  importBatches,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const DIRECTORY = 'https://www.bitpay.com/directory';
const SOURCE_NAME = 'BitPay Merchant Directory';
const IMPORTER_VERSION = 'bitpay-dir-v2';
const SOURCE_SCHEMA_VERSION = 'bitpay-directory-detail-verified-v2';
const MAX_CANDIDATES = 500;
const MAX_DETAIL_FETCHES = 350;
const CATEGORY_PATHS = [
  '',
  '/professional-services',
  '/crypto-hardware-services',
  '/software-web',
  '/real-estate',
  '/sports-entertainment',
  '/home-furniture',
  '/clothes-fashion',
  '/vehicles-boats',
  '/restaurants-food',
  '/charities-nonprofits',
  '/electronics',
  '/travel-leisure',
  '/gaming',
  '/jewelry-watches',
  '/precious-metals',
  '/online-stores',
] as const;
const CATEGORY_SLUGS = new Set(CATEGORY_PATHS.filter(Boolean).map((path) => path.slice(1)));

type Merchant = { slug: string; name: string; detailUrl: string };

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
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

async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; CryptoPayMap/1.0; +https://cryptopaymap.com)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    return { status: response.status, html: response.ok ? await response.text() : '' };
  } catch {
    return { status: 0, html: '' };
  }
}

function directorySlugsFromHtml(html: string): string[] {
  const slugs = new Set<string>();
  const link = /href=["'](?:https:\/\/www\.bitpay\.com)?\/directory\/([^"'?#/]+)["']/gi;
  for (const match of html.matchAll(link)) {
    const slug = match[1]?.trim().toLocaleLowerCase('en-US');
    if (!slug || CATEGORY_SLUGS.has(slug)) continue;
    slugs.add(slug);
  }
  return [...slugs];
}

function merchantFromDetail(slug: string, html: string): Merchant | null {
  const text = decode(html);
  if (!/\bPay Direct\b/i.test(text)) return null;
  if (!/accepts? cryptocurrency via BitPay|pay directly from your crypto wallet|choose ['‘’]?BitPay['‘’]? as your payment method/i.test(text)) {
    return null;
  }
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const name = decode(h1?.[1] ?? '');
  if (!name || name.length > 200) return null;
  return { slug, name, detailUrl: `${DIRECTORY}/${slug}` };
}

async function discover(): Promise<{ merchants: Merchant[]; listingPagesFetched: number; listingPagesSkipped: number; detailPagesFetched: number }> {
  const slugs = new Set<string>();
  let listingPagesFetched = 0;
  let listingPagesSkipped = 0;

  for (const path of CATEGORY_PATHS) {
    const page = await fetchPage(`${DIRECTORY}${path}`);
    if (page.status !== 200 || !page.html) {
      listingPagesSkipped += 1;
      continue;
    }
    listingPagesFetched += 1;
    for (const slug of directorySlugsFromHtml(page.html)) slugs.add(slug);
  }

  const merchants: Merchant[] = [];
  let detailPagesFetched = 0;
  for (const slug of [...slugs].sort().slice(0, MAX_DETAIL_FETCHES)) {
    const page = await fetchPage(`${DIRECTORY}/${slug}`);
    if (page.status !== 200 || !page.html) continue;
    detailPagesFetched += 1;
    const merchant = merchantFromDetail(slug, page.html);
    if (merchant) merchants.push(merchant);
    if (merchants.length >= MAX_CANDIDATES) break;
  }

  return { merchants, listingPagesFetched, listingPagesSkipped, detailPagesFetched };
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing BitPay Candidate ingestion outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const discovery = await discover();
  const merchants = discovery.merchants;
  if (merchants.length === 0) {
    throw new Error(
      `BitPay discovery returned zero verified Pay Direct merchants (listingPagesFetched=${discovery.listingPagesFetched}, detailPagesFetched=${discovery.detailPagesFetched}).`,
    );
  }

  const db = createDatabase(databaseUrl);
  let source = (
    await db
      .select()
      .from(sources)
      .where(and(eq(sources.sourceType, 'processor'), eq(sources.name, SOURCE_NAME)))
      .limit(1)
  )[0];
  if (!source) {
    [source] = await db
      .insert(sources)
      .values({
        sourceType: 'processor',
        name: SOURCE_NAME,
        baseUrl: DIRECTORY,
        attributionText: 'BitPay Merchant Directory',
        isActive: true,
      })
      .returning();
  }
  if (!source) throw new Error('Failed to resolve BitPay source.');

  const externalIds = merchants.map((merchant) => `bitpay:${merchant.slug}`);
  const existing = await db
    .select({ externalId: sourceRecords.externalId })
    .from(sourceRecords)
    .where(and(eq(sourceRecords.sourceId, source.id), inArray(sourceRecords.externalId, externalIds)));
  const existingIds = new Set(existing.map((row) => row.externalId).filter(Boolean));
  const fresh = merchants.filter((merchant) => !existingIds.has(`bitpay:${merchant.slug}`));
  const now = new Date();
  const batchId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const checksum = await sha256(JSON.stringify(merchants.map(({ slug, name }) => ({ slug, name }))));

  await db.insert(importBatches).values({
    id: batchId,
    requestId,
    actorId: 'system:bitpay-directory-discovery',
    actorType: 'system',
    sourceId: source.id,
    importKind: 'online_service',
    sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
    importerVersion: IMPORTER_VERSION,
    inputChecksum: checksum,
    inputCount: merchants.length,
    acceptedCount: fresh.length,
    rejectedCount: 0,
    replayedCount: merchants.length - fresh.length,
    outOfScopeCount: 0,
    duplicateSignalCount: 0,
    automaticConfirmedCount: 0,
    rejectionSummary: {},
    startedAt: now,
    completedAt: now,
  });

  for (const merchant of fresh) {
    const externalId = `bitpay:${merchant.slug}`;
    const sourceRecordId = await deterministicUuid(`source-record:${source.id}:${externalId}`);
    const candidateId = await deterministicUuid(`candidate:${source.id}:${externalId}`);
    const rawPayload = {
      discovery: 'bitpay_merchant_directory',
      discoveryVersion: SOURCE_SCHEMA_VERSION,
      processorPaymentMode: 'pay_direct',
      processorDetailVerified: true,
      reviewSeed: {
        name: merchant.name,
        candidateType: 'online_service',
        processorListingUrl: merchant.detailUrl,
      },
    };
    await db.insert(sourceRecords).values({
      id: sourceRecordId,
      sourceId: source.id,
      externalId,
      sourceUrl: merchant.detailUrl,
      rawPayload,
      officialDomain: null,
      observedAt: now,
      fetchedAt: now,
      contentHash: await sha256(JSON.stringify(rawPayload)),
    });
    await db.insert(sourceCandidates).values({
      id: candidateId,
      candidateType: 'online_service',
      normalizedName: normalizeName(merchant.name),
      candidateStatus: 'new',
      priority: 500,
      duplicateGroupId: null,
      firstSeenAt: now,
      lastSeenAt: now,
      importBatchId: batchId,
      canonicalEntityId: null,
      canonicalLocationId: null,
    });
    await db.insert(candidateSourceRecords).values({
      candidateId,
      sourceRecordId,
      relationship: 'origin',
    });
  }

  console.log(
    JSON.stringify({
      target: TARGET,
      source: SOURCE_NAME,
      listingPagesFetched: discovery.listingPagesFetched,
      listingPagesSkipped: discovery.listingPagesSkipped,
      detailPagesFetched: discovery.detailPagesFetched,
      verifiedPayDirectMerchants: merchants.length,
      newOnlineCandidates: fresh.length,
      replayedOnlineCandidates: merchants.length - fresh.length,
      automaticConfirmedCount: 0,
      candidateVisibility: 'private',
      giftCardListingsExcluded: true,
      candidatePayloadExposed: false,
    }),
  );
}

await main();
