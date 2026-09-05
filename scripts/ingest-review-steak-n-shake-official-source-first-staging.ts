import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createDerivedStagingServiceIdentity } from '../src/admin/access/identity';
import {
  authorizeEvidenceReview,
  readEvidenceReviewAuthorizationPolicy,
} from '../src/admin/evidence-review/authorization';
import { createEvidenceReviewDecisionService } from '../src/admin/evidence-review/decision';
import { createDrizzleEvidenceReviewBackend } from '../src/admin/evidence-review/drizzle-backend';
import {
  authorizeCandidatePromotion,
  readCandidatePromotionAuthorizationPolicy,
} from '../src/admin/promotion/authorization';
import { createCandidatePromotionService } from '../src/admin/promotion/candidate-promotion';
import { createDrizzleCandidatePromotionBackend } from '../src/admin/promotion/drizzle-candidate-promotion-backend';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  assets,
  candidatePromotionDecisions,
  candidateSourceRecords,
  claimAssets,
  entities,
  evidence,
  importBatches,
  networks,
  paymentMethods,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

type JsonRecord = Record<string, unknown>;
type FeedRow = {
  id: string;
  slug: string;
  name: string;
  phone1: string | null;
  brandChainId: unknown;
  status: unknown;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  hours: unknown;
  openingHours: string;
  externalIds: unknown;
  externalLinks: unknown;
};

const TARGET = 'fixed-review-staging';
const DIRECTORY_URL = 'https://www.steaknshake.com/locations/';
const DIRECTORY_AJAX_URL = 'https://www.steaknshake.com/wp-admin/admin-ajax.php';
const TERMS_URL = 'https://www.steaknshake.com/terms-of-use/';
const SPEED_URL = 'https://www.tryspeed.com/playbook/bitcoin-stablecoin-payment-infrastructure';
const MIN_DIRECTORY_COUNT = 300;
const MAX_DIRECTORY_COUNT = 500;
const HISTORICAL_SPEED_ROLLOUT_COUNT = 393;
const NEXT_REVIEW_DAYS = 180;
const IMPORTER_VERSION = 'steak-n-shake-source-first-v2';
const SOURCE_SCHEMA_VERSION = 'steak-n-shake-location-directory-v1';

function object(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function normalizedName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function pageText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uuid(label: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)),
  ).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameDomain(url: string, expected: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === expected || host.endsWith(`.${expected}`);
  } catch {
    return false;
  }
}

async function fetchPage(url: string, domain: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    headers: {
      'user-agent': 'CryptoPayMap-source-first-review/2.0',
      accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
    },
  });
  if (!response.ok) throw new Error(`Source verification failed: HTTP ${response.status} ${url}`);
  if (!sameDomain(response.url, domain)) throw new Error(`Source redirected outside ${domain}.`);
  const body = await response.text();
  return {
    url: response.url,
    body,
    fetchedAt: new Date(),
    contentHash: await sha256(pageText(body)),
  };
}

function verifyTerms(body: string): void {
  const text = pageText(body);
  if (!/bitcoin payments/.test(text)) throw new Error('Merchant Terms lost the Bitcoin Payments section.');
  if (!/certain in-store or drive-through orders/.test(text)) {
    throw new Error('Merchant Terms lost the in-store/drive-through Bitcoin scope.');
  }
  if (!/scan a qr code/.test(text) || !/payment transaction in btc/.test(text)) {
    throw new Error('Merchant Terms lost the QR/BTC payment flow.');
  }
}

function verifySpeed(body: string): void {
  const text = pageText(body);
  if (!/steak\s*['’]?n\s*shake/.test(text)) throw new Error('Speed material no longer names Steak n Shake.');
  if (!/all 393/.test(text) || !/(?:united states|u\.?s\.?)/.test(text)) {
    throw new Error('Speed material no longer verifies the historical all-U.S. rollout.');
  }
  if (!/franchise and corporate-owned locations/.test(text)) {
    throw new Error('Speed material no longer covers franchise and corporate-owned locations.');
  }
  if (!/bitcoin/.test(text) || !/lightning/.test(text) || !/qr code/.test(text)) {
    throw new Error('Speed material no longer verifies the Bitcoin Lightning QR flow.');
  }
}

function openingHours(value: unknown): string | null {
  const sets = Array.isArray(object(value).sets) ? (object(value).sets as unknown[]) : [];
  for (const set of sets) {
    const hours = object(object(set).hours);
    const parts = Object.entries(hours)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
      .map(([label, text]) => `${label}: ${text.trim()}`);
    if (parts.length > 0) return parts.join('; ');
  }
  return null;
}

function parseRow(value: unknown): FeedRow | null {
  const row = object(value);
  const address = object(row.address);
  const loc = Array.isArray(address.loc) ? address.loc : [];
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const address1 = typeof address.address1 === 'string' ? address.address1.trim() : '';
  const city = typeof address.city === 'string' ? address.city.trim() : '';
  const postalCode =
    typeof address.zip === 'string' || typeof address.zip === 'number'
      ? String(address.zip).trim()
      : '';
  const country = typeof address.country === 'string' ? address.country.trim() : '';
  const state = typeof address.region === 'string' ? address.region.trim().toUpperCase() : '';
  const latitude = Number(loc[1]);
  const longitude = Number(loc[0]);
  const hoursText = openingHours(row.hours);
  const hasPhone1 = Object.prototype.hasOwnProperty.call(row, 'phone1');
  const phone1 = typeof row.phone1 === 'string' && row.phone1.trim() ? row.phone1.trim() : null;
  if (
    !id ||
    !slug ||
    !name ||
    !address1 ||
    !city ||
    !postalCode ||
    country !== 'United States' ||
    !/^[A-Z]{2}$/.test(state) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !hasPhone1 ||
    !row.hours ||
    typeof row.hours !== 'object' ||
    !hoursText
  ) {
    return null;
  }
  return {
    id,
    slug,
    name,
    phone1,
    brandChainId: row.brandChainId,
    status: row.status,
    address1,
    city,
    state,
    postalCode,
    latitude,
    longitude,
    hours: row.hours,
    openingHours: hoursText,
    externalIds: row.externalIds,
    externalLinks: row.externalLinks,
  };
}

async function fetchDirectory() {
  const response = await fetch(DIRECTORY_AJAX_URL, {
    method: 'POST',
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'user-agent': 'CryptoPayMap-source-first-directory/2.0',
      accept: 'application/json,text/plain;q=0.9,*/*;q=0.1',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: 'https://www.steaknshake.com',
      referer: DIRECTORY_URL,
    },
    body: new URLSearchParams({ action: 'get_location_data_from_plugin' }).toString(),
  });
  if (!response.ok) throw new Error(`Official directory returned HTTP ${response.status}.`);
  if (!sameDomain(response.url, 'steaknshake.com')) throw new Error('Official directory redirected off-domain.');
  const raw = await response.text();
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Official directory response is not an array.');
  if (parsed.length < MIN_DIRECTORY_COUNT || parsed.length > MAX_DIRECTORY_COUNT) {
    throw new Error(`Official directory count outside guard range: ${parsed.length}.`);
  }
  const rows = parsed.map(parseRow);
  const valid = rows.filter((row): row is FeedRow => row !== null);
  if (valid.length !== parsed.length) {
    throw new Error(`Official directory profile validation failed: valid=${valid.length}, fetched=${parsed.length}.`);
  }
  if (new Set(valid.map((row) => row.slug)).size !== valid.length) {
    throw new Error('Official directory contains duplicate location slugs.');
  }
  if (new Set(valid.map((row) => `${row.id}|${row.slug}`)).size !== valid.length) {
    throw new Error('Official directory contains duplicate composite location identities.');
  }
  return { rows: valid, fetchedAt: new Date(), contentHash: await sha256(raw) };
}

async function ensureSource(
  db: ReturnType<typeof createDatabase>,
  sourceType: 'official_site' | 'processor',
  name: string,
  baseUrl: string,
  attributionText: string,
) {
  let [row] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.sourceType, sourceType), eq(sources.name, name)))
    .limit(1);
  if (!row) {
    [row] = await db.insert(sources).values({ sourceType, name, baseUrl, attributionText, isActive: true }).returning();
  }
  if (!row) throw new Error(`Failed to resolve Source ${name}.`);
  return row;
}

async function ensureRecord(
  db: ReturnType<typeof createDatabase>,
  input: {
    id?: string;
    sourceId: string;
    externalId: string;
    sourceUrl: string;
    officialDomain: string;
    rawPayload: JsonRecord;
    fetchedAt: Date;
    contentHash: string;
  },
) {
  await db
    .insert(sourceRecords)
    .values({ ...input, observedAt: input.fetchedAt })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(sourceRecords)
    .where(and(eq(sourceRecords.sourceId, input.sourceId), eq(sourceRecords.externalId, input.externalId)))
    .limit(1);
  if (!row) throw new Error(`Failed to resolve Source Record ${input.externalId}.`);
  await db
    .update(sourceRecords)
    .set({
      sourceUrl: input.sourceUrl,
      rawPayload: input.rawPayload,
      officialDomain: input.officialDomain,
      observedAt: input.fetchedAt,
      fetchedAt: input.fetchedAt,
      contentHash: input.contentHash,
    })
    .where(eq(sourceRecords.id, row.id));
  return row;
}

async function ensureSpeedProcessor(db: ReturnType<typeof createDatabase>) {
  let [row] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.entityType, 'payment_processor'), eq(entities.name, 'Speed')))
    .limit(1);
  if (!row) {
    const id = await uuid('cryptopaymap:processor:tryspeed.com');
    [row] = await db
      .insert(entities)
      .values({
        id,
        entityType: 'payment_processor',
        name: 'Speed',
        slug: 'speed-payment-processor',
        legalName: null,
        websiteUrl: 'https://www.tryspeed.com/',
        countryCode: null,
        entityStatus: 'active',
        visibility: 'hidden',
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      [row] = await db
        .select()
        .from(entities)
        .where(eq(entities.id, id))
        .limit(1);
    }
  }
  if (!row) throw new Error('Failed to resolve Speed processor Entity.');
  const slug = row.slug ?? 'speed-payment-processor';
  if (row.slug === null || row.websiteUrl !== 'https://www.tryspeed.com/' || row.entityStatus !== 'active') {
    await db
      .update(entities)
      .set({ slug, websiteUrl: 'https://www.tryspeed.com/', entityStatus: 'active' })
      .where(eq(entities.id, row.id));
    [row] = await db.select().from(entities).where(eq(entities.id, row.id)).limit(1);
  }
  if (!row?.slug) throw new Error('Speed processor Entity is missing a public processor slug.');
  return row;
}

async function acceptEvidence(
  db: ReturnType<typeof createDatabase>,
  reviewer: ReturnType<typeof createDerivedStagingServiceIdentity>,
  policy: ReturnType<typeof readEvidenceReviewAuthorizationPolicy>,
  input: {
    candidateId: string;
    claimId: string;
    evidenceId: string;
    claimAction: 'no_change' | 'confirm';
    reasonCode: string;
    note: string;
  },
) {
  const [item] = await db
    .select({ reviewStatus: evidence.reviewStatus, updatedAt: evidence.updatedAt })
    .from(evidence)
    .where(eq(evidence.id, input.evidenceId))
    .limit(1);
  if (!item) throw new Error(`Evidence missing: ${input.evidenceId}`);
  if (item.reviewStatus === 'accepted') return 'already_accepted' as const;
  if (item.reviewStatus !== 'pending') throw new Error(`Evidence is not reviewable: ${item.reviewStatus}.`);
  const [claim] = await db
    .select({
      status: acceptanceClaims.claimStatus,
      visibility: acceptanceClaims.visibility,
      updatedAt: acceptanceClaims.updatedAt,
    })
    .from(acceptanceClaims)
    .where(eq(acceptanceClaims.id, input.claimId))
    .limit(1);
  if (!claim) throw new Error(`Claim missing: ${input.claimId}`);
  const accepted = await db
    .select({ id: evidence.id })
    .from(evidence)
    .where(and(eq(evidence.claimId, input.claimId), eq(evidence.reviewStatus, 'accepted')))
    .orderBy(asc(evidence.id));
  const claimAssetRows = await db
    .select({ id: claimAssets.id })
    .from(claimAssets)
    .where(eq(claimAssets.claimId, input.claimId))
    .orderBy(asc(claimAssets.id));
  const decidedAt = new Date(
    Math.max(Date.now(), item.updatedAt.getTime() + 1_000, claim.updatedAt.getTime() + 1_000),
  );
  const nextReviewAt =
    input.claimAction === 'confirm'
      ? new Date(decidedAt.getTime() + NEXT_REVIEW_DAYS * 24 * 60 * 60 * 1_000)
      : null;
  const requestId = await uuid(
    `steak-n-shake:evidence-review:${input.claimAction}:${input.candidateId}:${input.evidenceId}`,
  );
  const context = authorizeEvidenceReview(reviewer, policy, requestId);
  const receipt = await createEvidenceReviewDecisionService(createDrizzleEvidenceReviewBackend(db)).decide(
    context,
    {
      evidenceId: input.evidenceId,
      claimId: input.claimId,
      expectedEvidenceUpdatedAt: item.updatedAt.toISOString(),
      expectedEvidenceReviewStatus: 'pending',
      expectedClaimUpdatedAt: claim.updatedAt.toISOString(),
      expectedClaimStatus: claim.status,
      expectedClaimVisibility: claim.visibility,
      expectedAcceptedEvidenceIds: accepted.map((row) => row.id),
      expectedClaimAssetIds: claimAssetRows.map((row) => row.id),
      decidedAt: decidedAt.toISOString(),
      disposition: 'accepted',
      finding: 'supports_claim',
      claimAction: input.claimAction,
      reasonCode: input.reasonCode,
      publicSummary: null,
      internalNote: input.note,
      nextReviewAt: nextReviewAt?.toISOString() ?? null,
      endedReason: null,
    },
  );
  return receipt.state;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing source-first mutation outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const promotionPolicy = readCandidatePromotionAuthorizationPolicy({
    CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: process.env.CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS,
  });
  const evidencePolicy = readEvidenceReviewAuthorizationPolicy({
    CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: process.env.CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS,
  });
  const reviewer = createDerivedStagingServiceIdentity('reviewer');
  if (!promotionPolicy.configured || !promotionPolicy.allowedSubjects.has(reviewer.subject)) {
    throw new Error('Staging reviewer is not authorized for Candidate promotion.');
  }
  if (!evidencePolicy.configured || !evidencePolicy.allowedSubjects.has(reviewer.subject)) {
    throw new Error('Staging reviewer is not authorized for Evidence review.');
  }

  const [directory, terms, speed] = await Promise.all([
    fetchDirectory(),
    fetchPage(TERMS_URL, 'steaknshake.com'),
    fetchPage(SPEED_URL, 'tryspeed.com'),
  ]);
  verifyTerms(terms.body);
  verifySpeed(speed.body);

  const validCoordinates = directory.rows.filter(
    (row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude),
  ).length;
  const phoneFieldRows = directory.rows.length;
  const withPhone = directory.rows.filter((row) => row.phone1 !== null).length;
  const withHours = directory.rows.filter((row) => row.openingHours.length > 0).length;
  const stateCount = new Set(directory.rows.map((row) => row.state)).size;
  if (validCoordinates !== directory.rows.length || withHours !== directory.rows.length) {
    throw new Error('Official directory completeness gate failed for coordinates or hours.');
  }

  const directorySource = await ensureSource(
    db,
    'official_site',
    'Steak n Shake official location directory',
    DIRECTORY_URL,
    'Steak n Shake official location directory',
  );
  const merchantSource = await ensureSource(
    db,
    'official_site',
    'Steak n Shake official site',
    'https://www.steaknshake.com/',
    'Steak n Shake official site',
  );
  const processorSource = await ensureSource(
    db,
    'processor',
    'Speed',
    'https://www.tryspeed.com/',
    'Speed payment infrastructure',
  );
  const speedProcessor = await ensureSpeedProcessor(db);

  const termsRecord = await ensureRecord(db, {
    sourceId: merchantSource.id,
    externalId: 'steak-n-shake:current-bitcoin-terms',
    sourceUrl: terms.url,
    officialDomain: 'steaknshake.com',
    rawPayload: {
      discovery: 'merchant_official_bitcoin_terms',
      merchant: 'Steak n Shake',
      claimScope: 'brand_region',
      region: 'US',
      orderScope: 'certain_in_store_or_drive_through_orders',
      paymentFlow: 'qr_btc',
    },
    fetchedAt: terms.fetchedAt,
    contentHash: terms.contentHash,
  });
  const speedRecord = await ensureRecord(db, {
    sourceId: processorSource.id,
    externalId: 'speed:steak-n-shake-current-us-rollout',
    sourceUrl: speed.url,
    officialDomain: 'tryspeed.com',
    rawPayload: {
      discovery: 'processor_current_implementation_material',
      merchant: 'Steak n Shake',
      claimScope: 'brand_region',
      region: 'US',
      rolloutCountAtLaunch: HISTORICAL_SPEED_ROLLOUT_COUNT,
      includesFranchiseAndCorporateOwnedLocations: true,
      asset: 'bitcoin',
      network: 'lightning',
      paymentFlow: 'qr',
    },
    fetchedAt: speed.fetchedAt,
    contentHash: speed.contentHash,
  });

  const externalIds = directory.rows.map((row) => `steak-n-shake:${row.id}:${row.slug}`);
  const sourceRecordIds = await Promise.all(
    externalIds.map((externalId) => uuid(`source-record:${directorySource.id}:${externalId}`)),
  );
  const candidateIds = await Promise.all(
    externalIds.map((externalId) => uuid(`candidate:${directorySource.id}:${externalId}`)),
  );
  const existingSources = await db
    .select({ id: sourceRecords.id })
    .from(sourceRecords)
    .where(inArray(sourceRecords.id, sourceRecordIds));
  const existingCandidates = await db
    .select({ id: sourceCandidates.id })
    .from(sourceCandidates)
    .where(inArray(sourceCandidates.id, candidateIds));
  const existingSourceIds = new Set(existingSources.map((row) => row.id));
  const existingCandidateIds = new Set(existingCandidates.map((row) => row.id));
  const sourceRecordsCreated = sourceRecordIds.filter((id) => !existingSourceIds.has(id)).length;
  const candidatesCreated = candidateIds.filter((id) => !existingCandidateIds.has(id)).length;

  const importBatchId = await uuid(`steak-n-shake:import-batch:${directorySource.id}:${directory.contentHash}`);
  const importRequestId = await uuid(`steak-n-shake:import-request:${directorySource.id}:${directory.contentHash}`);
  await db
    .insert(importBatches)
    .values({
      id: importBatchId,
      requestId: importRequestId,
      actorId: 'system:steak-n-shake-official-location-directory',
      actorType: 'system',
      sourceId: directorySource.id,
      importKind: 'physical_place',
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      importerVersion: IMPORTER_VERSION,
      inputChecksum: directory.contentHash,
      inputCount: directory.rows.length,
      acceptedCount: candidatesCreated,
      rejectedCount: 0,
      replayedCount: directory.rows.length - candidatesCreated,
      outOfScopeCount: 0,
      duplicateSignalCount: 0,
      automaticConfirmedCount: 0,
      rejectionSummary: {},
      startedAt: directory.fetchedAt,
      completedAt: new Date(),
    })
    .onConflictDoNothing();

  for (let index = 0; index < directory.rows.length; index += 1) {
    const row = directory.rows[index]!;
    const sourceRecordId = sourceRecordIds[index]!;
    const candidateId = candidateIds[index]!;
    const rawPayload = {
      sourceSystem: 'steak_n_shake_official_location_directory',
      importerVersion: IMPORTER_VERSION,
      officialLocationId: row.id,
      brandChainId: row.brandChainId,
      slug: row.slug,
      status: row.status,
      phone1: row.phone1,
      externalIds: row.externalIds,
      externalLinks: row.externalLinks,
      hours: row.hours,
      reviewSeed: {
        name: row.name,
        candidateType: 'physical_place',
        address: row.address1,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
        countryCode: 'US',
        latitude: row.latitude,
        longitude: row.longitude,
        phone: row.phone1,
        openingHours: row.openingHours,
        officialLocationId: row.id,
        officialSlug: row.slug,
        websiteUrl: DIRECTORY_URL,
      },
    };
    const contentHash = await sha256(JSON.stringify(rawPayload));
    await db
      .insert(sourceRecords)
      .values({
        id: sourceRecordId,
        sourceId: directorySource.id,
        externalId: externalIds[index]!,
        sourceUrl: DIRECTORY_URL,
        rawPayload,
        officialDomain: 'steaknshake.com',
        observedAt: directory.fetchedAt,
        fetchedAt: directory.fetchedAt,
        contentHash,
      })
      .onConflictDoNothing();
    await db
      .update(sourceRecords)
      .set({
        sourceUrl: DIRECTORY_URL,
        rawPayload,
        officialDomain: 'steaknshake.com',
        observedAt: directory.fetchedAt,
        fetchedAt: directory.fetchedAt,
        contentHash,
      })
      .where(eq(sourceRecords.id, sourceRecordId));
    await db
      .insert(sourceCandidates)
      .values({
        id: candidateId,
        candidateType: 'physical_place',
        normalizedName: normalizedName(row.name),
        candidateStatus: 'new',
        priority: 980,
        duplicateGroupId: null,
        firstSeenAt: directory.fetchedAt,
        lastSeenAt: directory.fetchedAt,
        importBatchId,
        canonicalEntityId: null,
        canonicalLocationId: null,
      })
      .onConflictDoNothing();
    await db
      .update(sourceCandidates)
      .set({ lastSeenAt: directory.fetchedAt })
      .where(eq(sourceCandidates.id, candidateId));
    await db
      .insert(candidateSourceRecords)
      .values({ candidateId, sourceRecordId, relationship: 'origin' })
      .onConflictDoNothing();
  }

  const [[bitcoin], [lightning], [lightningInvoice]] = await Promise.all([
    db.select({ id: assets.id }).from(assets).where(and(eq(assets.slug, 'bitcoin'), eq(assets.status, 'active'))).limit(1),
    db.select({ id: networks.id }).from(networks).where(and(eq(networks.slug, 'lightning'), eq(networks.status, 'active'))).limit(1),
    db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.slug, 'lightning_invoice'), eq(paymentMethods.status, 'active')))
      .limit(1),
  ]);
  if (!bitcoin || !lightning || !lightningInvoice) throw new Error('BTC/Lightning registries are not ready.');

  const candidates = await db
    .select({
      id: sourceCandidates.id,
      status: sourceCandidates.candidateStatus,
      updatedAt: sourceCandidates.updatedAt,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
    })
    .from(sourceCandidates)
    .where(inArray(sourceCandidates.id, candidateIds))
    .orderBy(asc(sourceCandidates.id));
  if (candidates.length !== directory.rows.length) {
    throw new Error(`Candidate resolution mismatch: ${candidates.length}/${directory.rows.length}.`);
  }

  const counters = {
    candidatesResolved: candidates.length,
    verifiedOfficialLocations: 0,
    promoted: 0,
    alreadyPromoted: 0,
    confirmed: 0,
    alreadyConfirmed: 0,
    officialEvidenceCreated: 0,
    processorEvidenceCreated: 0,
    processorEvidenceAccepted: 0,
  };

  for (const candidate of candidates) {
    if (!['new', 'triaged', 'promoted'].includes(candidate.status)) {
      throw new Error(`Unexpected Candidate status ${candidate.status}: ${candidate.id}.`);
    }
    const relations = await db
      .select({
        sourceRecordId: candidateSourceRecords.sourceRecordId,
        relationship: candidateSourceRecords.relationship,
        rawPayload: sourceRecords.rawPayload,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, candidate.id))
      .orderBy(asc(candidateSourceRecords.sourceRecordId));
    const origin = relations.find(
      (relation) =>
        relation.relationship === 'origin' &&
        object(relation.rawPayload).sourceSystem === 'steak_n_shake_official_location_directory',
    );
    const seed = object(object(origin?.rawPayload).reviewSeed);
    const officialLocationId = typeof seed.officialLocationId === 'string' ? seed.officialLocationId.trim() : '';
    const officialSlug = typeof seed.officialSlug === 'string' ? seed.officialSlug.trim() : '';
    const name = typeof seed.name === 'string' ? seed.name.trim() : '';
    const address = typeof seed.address === 'string' ? seed.address.trim() : '';
    const city = typeof seed.city === 'string' ? seed.city.trim() : '';
    const state = typeof seed.state === 'string' ? seed.state.trim() : '';
    const postalCode = typeof seed.postalCode === 'string' ? seed.postalCode.trim() : '';
    const phone = typeof seed.phone === 'string' && seed.phone.trim() ? seed.phone.trim() : null;
    const hours = typeof seed.openingHours === 'string' ? seed.openingHours.trim() : '';
    const latitude = typeof seed.latitude === 'number' ? seed.latitude : null;
    const longitude = typeof seed.longitude === 'number' ? seed.longitude : null;
    if (!origin || !officialLocationId || !officialSlug || !name || !address || !city || !state || !postalCode || !hours || latitude === null || longitude === null) {
      throw new Error(`Official origin profile incomplete for Candidate ${candidate.id}.`);
    }
    counters.verifiedOfficialLocations += 1;

    await db
      .insert(candidateSourceRecords)
      .values([
        { candidateId: candidate.id, sourceRecordId: termsRecord.id, relationship: 'supporting' },
        { candidateId: candidate.id, sourceRecordId: speedRecord.id, relationship: 'supporting' },
      ])
      .onConflictDoNothing();

    const officialEvidenceId = await uuid(`steak-n-shake:terms-evidence:${candidate.id}`);
    const processorEvidenceId = await uuid(`steak-n-shake:speed-evidence:${candidate.id}`);
    if (!(await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, officialEvidenceId)).limit(1))[0]) {
      await db.insert(evidence).values({
        id: officialEvidenceId,
        sourceRecordId: termsRecord.id,
        evidenceKind: 'official_payment_page',
        evidenceClass: 'a',
        sourceType: 'official_page',
        originRole: 'merchant_side',
        polarity: 'supporting',
        sourceName: 'Steak n Shake official Terms of Use',
        sourceUrl: terms.url,
        observedAt: terms.fetchedAt,
        fetchedAt: terms.fetchedAt,
        summary:
          'Official Steak n Shake Terms document Bitcoin payment for certain in-store or drive-through orders using a QR-code BTC flow. This brand-region Evidence is expanded only through the current official U.S. location directory.',
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: terms.contentHash,
      });
      counters.officialEvidenceCreated += 1;
    }
    if (!(await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, processorEvidenceId)).limit(1))[0]) {
      await db.insert(evidence).values({
        id: processorEvidenceId,
        sourceRecordId: speedRecord.id,
        evidenceKind: 'processor_case_study',
        evidenceClass: 'b',
        sourceType: 'processor',
        originRole: 'processor_side',
        polarity: 'supporting',
        sourceName: 'Speed current Steak n Shake implementation material',
        sourceUrl: speed.url,
        observedAt: speed.fetchedAt,
        fetchedAt: speed.fetchedAt,
        summary:
          'Speed documents the U.S. Steak n Shake Bitcoin rollout across all 393 locations at launch, including franchise and corporate-owned locations and Lightning QR payment. Current location count comes from the merchant directory, not the historical 393 figure.',
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: speed.contentHash,
        independenceKey: 'processor:tryspeed.com',
      });
      counters.processorEvidenceCreated += 1;
    }

    let claimId: string;
    if (candidate.status === 'promoted') {
      const [promotion] = await db
        .select({ claimId: candidatePromotionDecisions.claimId })
        .from(candidatePromotionDecisions)
        .where(eq(candidatePromotionDecisions.candidateId, candidate.id))
        .limit(1);
      if (!promotion) throw new Error('Promoted Candidate missing promotion decision.');
      claimId = promotion.claimId;
      counters.alreadyPromoted += 1;
    } else {
      if (candidate.canonicalEntityId || candidate.canonicalLocationId) {
        throw new Error('Unpromoted Candidate has canonical links.');
      }
      const entityId = await uuid(`steak-n-shake:entity:${candidate.id}`);
      const locationId = await uuid(`steak-n-shake:location:${candidate.id}`);
      claimId = await uuid(`steak-n-shake:claim:${candidate.id}`);
      const claimAssetId = await uuid(`steak-n-shake:claim-asset:${candidate.id}:lightning`);
      const requestId = await uuid(`steak-n-shake:promotion:${candidate.id}`);
      const promotedAt = new Date(Math.max(Date.now(), candidate.updatedAt.getTime() + 1_000));
      const context = authorizeCandidatePromotion(reviewer, promotionPolicy, requestId);
      const receipt = await createCandidatePromotionService(createDrizzleCandidatePromotionBackend(db)).promote(
        context,
        {
          candidateId: candidate.id,
          expectedCandidateType: 'physical_place',
          expectedCandidateUpdatedAt: candidate.updatedAt.toISOString(),
          promotedAt: promotedAt.toISOString(),
          entity: {
            id: entityId,
            value: {
              entityType: 'merchant',
              name: 'Steak n Shake',
              slug: null,
              legalName: null,
              websiteUrl: 'https://www.steaknshake.com/',
              countryCode: 'US',
              entityStatus: 'active',
              visibility: 'hidden',
            },
          },
          location: {
            id: locationId,
            value: {
              name,
              slug: `steak-n-shake-${officialLocationId}-${(await sha256(officialSlug)).slice(0, 10)}`.slice(0, 64),
              addressLine: address,
              locality: city,
              region: state,
              postalCode,
              countryCode: 'US',
              latitude,
              longitude,
              locationStatus: 'active',
              visibility: 'hidden',
              websiteUrl: DIRECTORY_URL,
              phone,
              description: `Official Steak n Shake restaurant location in ${city}, ${state}.`,
              openingHours: hours,
              amenities: [],
              socialLinks: [],
              osmType: null,
              osmId: null,
            },
          },
          claim: {
            id: claimId,
            value: {
              entityId,
              locationId,
              claimScope: 'location_specific',
              routeType: 'processor_checkout',
              acceptanceScope: 'selected_products',
              claimStatus: 'candidate',
              visibility: 'hidden',
              customerPaysCrypto: true,
              merchantExplicitlyAcceptsCrypto: true,
              processorId: speedProcessor.id,
              howToPay:
                'For an eligible in-store or drive-through order, choose Bitcoin when offered, scan the displayed QR code with a Bitcoin Lightning wallet, and complete the BTC payment.',
              instructionsLanguage: 'en',
              merchantReceives: 'not_publicly_confirmed',
              restrictions:
                'Official terms describe Bitcoin for certain in-store or drive-through orders; availability can vary by order flow.',
              firstConfirmedAt: null,
              lastConfirmedAt: null,
              nextReviewAt: null,
              endedAt: null,
              endedReason: null,
            },
          },
          claimAssets: [
            {
              id: claimAssetId,
              value: {
                claimId,
                assetId: bitcoin.id,
                networkId: lightning.id,
                paymentMethodId: lightningInvoice.id,
                contractAddress: null,
                isPrimary: true,
                notes: 'Current Speed material documents the Bitcoin Lightning QR payment rail.',
              },
            },
          ],
          sourceRecordIds: [
            ...new Set([
              ...relations.map((relation) => relation.sourceRecordId),
              termsRecord.id,
              speedRecord.id,
            ]),
          ],
        },
      );
      if (receipt.state === 'committed') counters.promoted += 1;
    }

    const evidenceRows = await db
      .select({ id: evidence.id, claimId: evidence.claimId })
      .from(evidence)
      .where(inArray(evidence.id, [officialEvidenceId, processorEvidenceId]));
    for (const item of evidenceRows) {
      if (item.claimId === null) {
        await db
          .update(evidence)
          .set({ claimId })
          .where(and(eq(evidence.id, item.id), isNull(evidence.claimId)));
      } else if (item.claimId !== claimId) {
        throw new Error(`Evidence ${item.id} is bound to another Claim.`);
      }
    }

    // PostgreSQL default now() retains sub-millisecond precision while JS Date does not.
    // Align only pending private Evidence before the strict optimistic-lock review guard;
    // do not relax the guard and do not alter already-reviewed Evidence.
    const reviewReadyAt = new Date(Math.ceil(Date.now() / 1_000) * 1_000);
    await db
      .update(evidence)
      .set({ updatedAt: reviewReadyAt })
      .where(
        and(
          inArray(evidence.id, [officialEvidenceId, processorEvidenceId]),
          eq(evidence.reviewStatus, 'pending'),
        ),
      );

    const processorState = await acceptEvidence(db, reviewer, evidencePolicy, {
      candidateId: candidate.id,
      claimId,
      evidenceId: processorEvidenceId,
      claimAction: 'no_change',
      reasonCode: 'processor_case_study_verified',
      note:
        'Accepted current Speed B2 evidence for the Steak n Shake U.S. brand-region rollout. Expansion remains gated by the current merchant directory and merchant A2 Terms.',
    });
    if (processorState !== 'already_accepted') counters.processorEvidenceAccepted += 1;

    const [claim] = await db
      .select({ status: acceptanceClaims.claimStatus })
      .from(acceptanceClaims)
      .where(eq(acceptanceClaims.id, claimId))
      .limit(1);
    if (!claim) throw new Error('Claim missing after processor Evidence review.');
    if (claim.status === 'confirmed') {
      counters.alreadyConfirmed += 1;
      continue;
    }
    if (claim.status !== 'candidate') throw new Error(`Unexpected Claim status ${claim.status}.`);

    const merchantState = await acceptEvidence(db, reviewer, evidencePolicy, {
      candidateId: candidate.id,
      claimId,
      evidenceId: officialEvidenceId,
      claimAction: 'confirm',
      reasonCode: 'official_payment_page_verified',
      note:
        'Confirmed from merchant A2 Terms plus accepted Speed B2 evidence. The source Evidence is brand_region for U.S. stores; this location-specific derived Claim exists only after current first-party directory, all-U.S. rollout, franchise/corporate coverage, and coordinate/hour completeness gates passed.',
    });
    if (merchantState !== 'already_accepted') counters.confirmed += 1;
  }

  const branchExpansionGatePassed =
    directory.rows.length >= MIN_DIRECTORY_COUNT &&
    directory.rows.length <= MAX_DIRECTORY_COUNT &&
    validCoordinates === directory.rows.length &&
    phoneFieldRows === directory.rows.length &&
    withHours === directory.rows.length &&
    counters.verifiedOfficialLocations === directory.rows.length;
  if (!branchExpansionGatePassed) throw new Error('Steak n Shake brand-region expansion gate failed.');

  console.log(
    JSON.stringify({
      target: TARGET,
      merchant: 'Steak n Shake',
      sourceSystem: 'steak_n_shake_official_location_directory',
      officialDirectoryFetched: directory.rows.length,
      validCoordinates,
      phoneFieldRows,
      withPhone,
      withHours,
      stateCount,
      directorySourceRecordsCreated: sourceRecordsCreated,
      directorySourceRecordsReplayed: directory.rows.length - sourceRecordsCreated,
      candidatesCreated,
      candidatesReplayed: directory.rows.length - candidatesCreated,
      historicalSpeedRolloutCount: HISTORICAL_SPEED_ROLLOUT_COUNT,
      currentDirectoryCount: directory.rows.length,
      merchantTermsReverified: true,
      currentSpeedRolloutReverified: true,
      franchiseAndCorporateCoverageReverified: true,
      branchExpansionGatePassed,
      speedProcessorSlug: speedProcessor.slug,
      ...counters,
      automaticPublicVisibility: false,
      candidatePayloadExposed: false,
    }),
  );
}

await main();
