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
const SOURCE_SCHEMA_VERSION = 'bitpay-directory-html-v2';
const MAX_CANDIDATES = 500;
const CATEGORY_PATHS = [
  '',
  '/professional-services',
  '/crypto-hardware-services',
  '/software-web',
  '/jewelry-watches',
  '/precious-metals',
] as const;

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

async function fetchPage(url: string): Promise<string | null> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'user-agent': 'CryptoPayMap-BitPay-directory-discovery/1.0',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    console.warn(`BitPay directory page skipped: HTTP ${response.status} ${url}`);
    return null;
  }
  return response.text();
}

function merchantsFromHtml(html: string): Merchant[] {
  const merchants = new Map<string, Merchant>();
  const link = /<a\b[^>]*href=["'](\/directory\/([^"'?#/]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(link)) {
    const href = match[1];
    const slug = match[2];
    const body = decode(match[3] ?? '');
    if (!href || !slug || !/\bPay Direct\b/i.test(body) || /\bGift Card\b/i.test(body)) continue;
    const name = body.split(/\bPay Direct\b/i)[0]?.trim() ?? '';
    if (!name || name.length > 200) continue;
    merchants.set(slug, { slug, name, detailUrl: `${DIRECTORY}/${slug}` });
  }
  return [...merchants.values()];
}

async function discover(): Promise<Merchant[]> {
  const found = new Map<string, Merchant>();
  let fetchedPages = 0;
  for (const path of CATEGORY_PATHS) {
    const html = await fetchPage(`${DIRECTORY}${path}`);
    if (!html) continue;
    fetchedPages += 1;
    if (!/accept cryptocurrency|accept bitcoin|Pay Direct/i.test(html)) {
      console.warn(`BitPay page skipped because expected payment language is absent: ${path || '/'}`);
      continue;
    }
    for (const merchant of merchantsFromHtml(html)) found.set(merchant.slug, merchant);
  }
  if (fetchedPages === 0) throw new Error('BitPay discovery could not fetch any directory pages.');
  return [...found.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .slice(0, MAX_CANDIDATES);
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing BitPay Candidate ingestion outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const merchants = await discover();
  if (merchants.length === 0) throw new Error('BitPay discovery returned zero Pay Direct merchants.');

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
      discoveredPayDirectMerchants: merchants.length,
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
