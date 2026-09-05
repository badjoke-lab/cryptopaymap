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
  evidence,
  importBatches,
  networks,
  paymentMethods,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const DIRECTORY_URL = 'https://www.steaknshake.com/locations/';
const DIRECTORY_AJAX_URL = 'https://www.steaknshake.com/wp-admin/admin-ajax.php';
const TERMS_URL = 'https://www.steaknshake.com/terms-of-use/';
const SPEED_URL = 'https://www.tryspeed.com/playbook/bitcoin-stablecoin-payment-infrastructure';
const DIRECTORY_SOURCE_NAME = 'Steak n Shake official location directory';
const MERCHANT_SOURCE_NAME = 'Steak n Shake official site';
const PROCESSOR_SOURCE_NAME = 'Speed';
const SOURCE_SCHEMA_VERSION = 'steak-n-shake-location-directory-v1';
const IMPORTER_VERSION = 'steak-n-shake-official-source-first-v1';
const MIN_DIRECTORY_COUNT = 300;
const MAX_DIRECTORY_COUNT = 500;
const NEXT_REVIEW_DAYS = 180;
const HISTORICAL_SPEED_ROLLOUT_COUNT = 393;

type JsonRecord = Record<string, unknown>;
type FeedRow = {
  id: string;
  brandChainId: unknown;
  slug: string;
  status: unknown;
  name: string;
  phone1: string;
  address: {
    address1: string;
    city: string;
    zip: string;
    country: string;
    region: string;
    loc: [string, string];
  };
  externalIds: unknown;
  externalLinks: unknown;
  hours: unknown;
};

type SourceFetch = {
  url: string;
  body: string;
  fetchedAt: Date;
  contentHash: string;
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
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

function normalizedPageText(html: string): string {
  return html
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

async function deterministicUuid(label: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)),
  ).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x80;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hostMatches(urlValue: string, expectedDomain: string): boolean {
  try {
    const host = new URL(urlValue).hostname.toLowerCase().replace(/^www\./, '');
    return host === expectedDomain || host.endsWith(`.${expectedDomain}`);
  } catch {
    return false;
  }
}

async function fetchText(url: string, expectedDomain: string): Promise<SourceFetch> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    headers: {
      'user-agent': 'CryptoPayMap-source-first-review/1.0',
      accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
    },
  });
  if (!response.ok) throw new Error(`Source verification failed: HTTP ${response.status} ${url}`);
  if (!hostMatches(response.url, expectedDomain)) {
    throw new Error(`Source redirected outside ${expectedDomain}: ${response.url}`);
  }
  const body = await response.text();
  const fetchedAt = new Date();
  return { url: response.url, body, fetchedAt, contentHash: await sha256(normalizedPageText(body)) };
}

function verifyTerms(body: string): void {
  const text = normalizedPageText(body);
  if (!/bitcoin payments/.test(text)) {
    throw new Error('Steak n Shake Terms no longer contain the Bitcoin Payments section.');
  }
  if (!/certain in-store or drive-through orders/.test(text)) {
    throw new Error('Steak n Shake Terms no longer contain the required in-store/drive-through scope.');
  }
  if (!/scan a qr code/.test(text) || !/payment transaction in btc/.test(text)) {
    throw new Error('Steak n Shake Terms no longer contain the required QR/BTC payment flow.');
  }
}

function verifySpeed(body: string): void {
  const text = normalizedPageText(body);
  if (!/steak\s*['’]?n\s*shake/.test(text)) {
    throw new Error('Current Speed implementation material no longer identifies Steak n Shake.');
  }
  if (!/all 393 (?:u\.?s\.?|us) locations/.test(text)) {
    throw new Error('Current Speed material no longer verifies the all-U.S.-locations rollout.');
  }
  if (!/franchise and corporate-owned locations/.test(text)) {
    throw new Error('Current Speed material no longer covers the franchise/corporate footprint.');
  }
  if (!/lightning/.test(text) || !/bitcoin/.test(text) || !/qr code/.test(text)) {
    throw new Error('Current Speed material no longer verifies the Bitcoin Lightning QR flow.');
  }
}

function parseFeedRow(value: unknown): FeedRow | null {
  const row = record(value);
  const address = record(row.address);
  const loc = Array.isArray(address.loc) ? address.loc : [];
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const phone1 = typeof row.phone1 === 'string' ? row.phone1.trim() : '';
  const address1 = typeof address.address1 === 'string' ? address.address1.trim() : '';
  const city = typeof address.city === 'string' ? address.city.trim() : '';
  const zip = typeof address.zip === 'string' || typeof address.zip === 'number' ? String(address.zip).trim() : '';
  const country = typeof address.country === 'string' ? address.country.trim() : '';
  const region = typeof address.region === 'string' ? address.region.trim().toUpperCase() : '';
  const longitude = typeof loc[0] === 'string' || typeof loc[0] === 'number' ? String(loc[0]).trim() : '';
  const latitude = typeof loc[1] === 'string' || typeof loc[1] === 'number' ? String(loc[1]).trim() : '';
  if (
    !id ||
    !slug ||
    !name ||
    !phone1 ||
    !address1 ||
    !city ||
    !zip ||
    country !== 'United States' ||
    !/^[A-Z]{2}$/.test(region) ||
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude)) ||
    !row.hours ||
    typeof row.hours !== 'object'
  ) {
    return null;
  }
  return {
    id,
    brandChainId: row.brandChainId,
    slug,
    status: row.status,
    name,
    phone1,
    address: { address1, city, zip, country, region, loc: [longitude, latitude] },
    externalIds: row.externalIds,
    externalLinks: row.externalLinks,
    hours: row.hours,
  };
}

async function fetchOfficialDirectory(): Promise<{ rows: FeedRow[]; fetchedAt: Date; contentHash: string }> {
  const response = await fetch(DIRECTORY_AJAX_URL, {
    method: 'POST',
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'user-agent': 'CryptoPayMap-source-first-directory/1.0',
      accept: 'application/json,text/plain;q=0.9,*/*;q=0.1',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: 'https://www.steaknshake.com',
      referer: DIRECTORY_URL,
    },
    body: new URLSearchParams({ action: 'get_location_data_from_plugin' }).toString(),
  });
  if (!response.ok) throw new Error(`Steak n Shake official directory returned HTTP ${response.status}.`);
  if (!hostMatches(response.url, 'steaknshake.com')) {
    throw new Error('Steak n Shake official directory redirected outside the merchant domain.');
  }
  const raw = await response.text();
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Steak n Shake official directory did not return an array.');
  if (parsed.length < MIN_DIRECTORY_COUNT || parsed.length > MAX_DIRECTORY_COUNT) {
    throw new Error(
      `Steak n Shake official directory count is outside the fail-closed range: ${parsed.length}.`,
    );
  }
  const rows = parsed.map(parseFeedRow);
  const validRows = rows.filter((row): row is FeedRow => row !== null);
  if (validRows.length !== parsed.length) {
    throw new Error(
      `Steak n Shake directory contains invalid location rows: valid=${validRows.length}, fetched=${parsed.length}.`,
    );
  }
  if (new Set(validRows.map((row) => row.id)).size !== validRows.length) {
    throw new Error('Steak n Shake official directory contains duplicate official location IDs.');
  }
  const fetchedAt = new Date();
  return { rows: validRows, fetchedAt, contentHash: await sha256(raw) };
}

function openingHoursText(hours: unknown): string | null {
  const sets = Array.isArray(record(hours).sets) ? (record(hours).sets as unknown[]) : [];
  for (const value of sets) {
    const hoursMap = record(record(value).hours);
    const pairs = Object.entries(hoursMap)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
      .map(([label, text]) => `${label}: ${text.trim()}`);
    if (pairs.length > 0) return pairs.join('; ');
  }
  return null;
}

async function ensureSource(
  db: ReturnType<typeof createDatabase>,
  sourceType: 'official_site' | 'processor',
  name: string,
  baseUrl: string,
  attributionText: string,
) {
  let row = (
    await db
      .select()
      .from(sources)
      .where(and(eq(sources.sourceType, sourceType), eq(sources.name, name)))
      .limit(1)
  )[0];
  if (!row) {
    [row] = await db
      .insert(sources)
      .values({ sourceType, name, baseUrl, attributionText, isActive: true })
      .returning();
  }
  if (!row) throw new Error(`Failed to resolve source ${name}.`);
  return row;
}

async function ensureSharedSourceRecord(
  db: ReturnType<typeof createDatabase>,
  input: {
    sourceId: string;
    externalId: string;
    sourceUrl: string;
    officialDomain: string;
    rawPayload: JsonRecord;
    fetchedAt: Date;
    contentHash: string;
  },
) {
  await db.insert(sourceRecords).values({
    ...input,
    observedAt: input.fetchedAt,
  }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(sourceRecords)
    .where(and(eq(sourceRecords.sourceId, input.sourceId), eq(sourceRecords.externalId, input.externalId)))
    .limit(1);
  if (!row) throw new Error(`Failed to resolve source record ${input.externalId}.`);
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

async function reviewSupportingEvidenceNoChange(
  db: ReturnType<typeof createDatabase>,
  reviewer: ReturnType<typeof createDerivedStagingServiceIdentity>,
  evidencePolicy: ReturnType<typeof readEvidenceReviewAuthorizationPolicy>,
  claimId: string,
  evidenceId: string,
  candidateId: string,
): Promise<void> {
  const [evidenceRow] = await db
    .select({ reviewStatus: evidence.reviewStatus, updatedAt: evidence.updatedAt })
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .limit(1);
  if (!evidenceRow) throw new Error(`Missing processor Evidence ${evidenceId}.`);
  if (evidenceRow.reviewStatus === 'accepted') return;
  if (evidenceRow.reviewStatus !== 'pending') {
    throw new Error(`Processor Evidence is not reviewable: ${evidenceRow.reviewStatus}.`);
  }
  const [claim] = await db
    .select({
      claimStatus: acceptanceClaims.claimStatus,
      visibility: acceptanceClaims.visibility,
      updatedAt: acceptanceClaims.updatedAt,
    })
    .from(acceptanceClaims)
    .where(eq(acceptanceClaims.id, claimId))
    .limit(1);
  if (!claim) throw new Error('Claim missing before processor Evidence review.');
  const acceptedRows = await db
    .select({ id: evidence.id })
    .from(evidence)
    .where(and(eq(evidence.claimId, claimId), eq(evidence.reviewStatus, 'accepted')))
    .orderBy(asc(evidence.id));
  const assetRows = await db
    .select({ id: claimAssets.id })
    .from(claimAssets)
    .where(eq(claimAssets.claimId, claimId))
    .orderBy(asc(claimAssets.id));
  const decidedAt = new Date(
    Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, evidenceRow.updatedAt.getTime() + 1_000),
  );
  const requestId = await deterministicUuid(`steak-n-shake:speed-review:${candidateId}`);
  const context = authorizeEvidenceReview(reviewer, evidencePolicy, requestId);
  await createEvidenceReviewDecisionService(createDrizzleEvidenceReviewBackend(db)).decide(context, {
    evidenceId,
    claimId,
    expectedEvidenceUpdatedAt: evidenceRow.updatedAt.toISOString(),
    expectedEvidenceReviewStatus: 'pending',
    expectedClaimUpdatedAt: claim.updatedAt.toISOString(),
    expectedClaimStatus: claim.claimStatus,
    expectedClaimVisibility: claim.visibility,
    expectedAcceptedEvidenceIds: acceptedRows.map((row) => row.id),
    expectedClaimAssetIds: assetRows.map((row) => row.id),
    decidedAt: decidedAt.toISOString(),
    disposition: 'accepted',
    finding: 'supports_claim',
    claimAction: 'no_change',
    reasonCode: 'processor_case_study_verified',
    publicSummary: null,
    internalNote:
      'Accepted current Speed B2 evidence for the Steak n Shake U.S. brand-region rollout. Location expansion remains gated by the current merchant directory and merchant A2 Terms.',
    nextReviewAt: null,
    endedReason: null,
  });
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Steak n Shake source-first mutation outside ${TARGET}.`);
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
    fetchOfficialDirectory(),
    fetchText(TERMS_URL, 'steaknshake.com'),
    fetchText(SPEED_URL, 'tryspeed.com'),
  ]);
  verifyTerms(terms.body);
  verifySpeed(speed.body);

  const validCoordinates = directory.rows.filter((row) => {
    const [longitude, latitude] = row.address.loc;
    return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  }).length;
  const withPhone = directory.rows.filter((row) => row.phone1.length > 0).length;
  const withHours = directory.rows.filter((row) => openingHoursText(row.hours) !== null).length;
  const stateCount = new Set(directory.rows.map((row) => row.address.region)).size;
  if (
    validCoordinates !== directory.rows.length ||
    withPhone !== directory.rows.length ||
    withHours !== directory.rows.length
  ) {
    throw new Error('Official directory completeness gate failed for coordinates, phone, or hours.');
  }

  const directorySource = await ensureSource(
    db,
    'official_site',
    DIRECTORY_SOURCE_NAME,
    DIRECTORY_URL,
    'Steak n Shake official location directory',
  );
  const merchantSource = await ensureSource(
    db,
    'official_site',
    MERCHANT_SOURCE_NAME,
    'https://www.steaknshake.com/',
    'Steak n Shake official site',
  );
  const processorSource = await ensureSource(
    db,
    'processor',
    PROCESSOR_SOURCE_NAME,
    'https://www.tryspeed.com/',
    'Speed payment infrastructure',
  );

  const termsRecord = await ensureSharedSourceRecord(db, {
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
  const speedRecord = await ensureSharedSourceRecord(db, {
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
      network: 'lightning',
      paymentFlow: 'qr',
    },
    fetchedAt: speed.fetchedAt,
    contentHash: speed.contentHash,
  });

  const externalIds = directory.rows.map((row) => `steak-n-shake:${row.id}`);
  const sourceRecordIds = await Promise.all(
    externalIds.map((externalId) => deterministicUuid(`source-record:${directorySource.id}:${externalId}`)),
  );
  const candidateIds = await Promise.all(
    externalIds.map((externalId) => deterministicUuid(`candidate:${directorySource.id}:${externalId}`)),
  );
  const existingSourceRows = await db
    .select({ id: sourceRecords.id })
    .from(sourceRecords)
    .where(inArray(sourceRecords.id, sourceRecordIds));
  const existingCandidateRows = await db
    .select({ id: sourceCandidates.id })
    .from(sourceCandidates)
    .where(inArray(sourceCandidates.id, candidateIds));
  const existingSourceIds = new Set(existingSourceRows.map((row) => row.id));
  const existingCandidateIds = new Set(existingCandidateRows.map((row) => row.id));
  const directorySourceRecordsCreated = sourceRecordIds.filter((id) => !existingSourceIds.has(id)).length;
  const candidatesCreated = candidateIds.filter((id) => !existingCandidateIds.has(id)).length;

  const importBatchId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  await db.insert(importBatches).values({
    id: importBatchId,
    requestId,
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
  });

  for (let index = 0; index < directory.rows.length; index += 1) {
    const row = directory.rows[index]!;
    const sourceRecordId = sourceRecordIds[index]!;
    const candidateId = candidateIds[index]!;
    const longitude = Number(row.address.loc[0]);
    const latitude = Number(row.address.loc[1]);
    const rawPayload = {
      sourceSystem: 'steak_n_shake_official_location_directory',
      importerVersion: IMPORTER_VERSION,
      officialLocationId: row.id,
      brandChainId: row.brandChainId,
      slug: row.slug,
      status: row.status,
      externalIds: row.externalIds,
      externalLinks: row.externalLinks,
      hours: row.hours,
      reviewSeed: {
        name: row.name,
        candidateType: 'physical_place',
        address: row.address.address1,
        city: row.address.city,
        state: row.address.region,
        postalCode: row.address.zip,
        countryCode: 'US',
        latitude,
        longitude,
        phone: row.phone1,
        openingHours: openingHoursText(row.hours),
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
        normalizedName: normalizeName(row.name),
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
    db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.slug, 'bitcoin'), eq(assets.status, 'active')))
      .limit(1),
    db
      .select({ id: networks.id })
      .from(networks)
      .where(and(eq(networks.slug, 'lightning'), eq(networks.status, 'active')))
      .limit(1),
    db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.slug, 'lightning_invoice'), eq(paymentMethods.status, 'active')))
      .limit(1),
  ]);
  if (!bitcoin || !lightning || !lightningInvoice) {
    throw new Error('BTC/Lightning staging registries are not ready.');
  }

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
    throw new Error(
      `Official directory Candidate resolution mismatch: candidates=${candidates.length}, directory=${directory.rows.length}.`,
    );
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
      throw new Error(`Unexpected Steak n Shake Candidate status ${candidate.status}: ${candidate.id}`);
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
        record(relation.rawPayload).sourceSystem === 'steak_n_shake_official_location_directory',
    );
    const seed = record(record(origin?.rawPayload).reviewSeed);
    const officialLocationId =
      typeof seed.officialLocationId === 'string' ? seed.officialLocationId.trim() : '';
    const name = typeof seed.name === 'string' ? seed.name.trim() : '';
    const address = typeof seed.address === 'string' ? seed.address.trim() : '';
    const city = typeof seed.city === 'string' ? seed.city.trim() : '';
    const state = typeof seed.state === 'string' ? seed.state.trim() : '';
    const postalCode = typeof seed.postalCode === 'string' ? seed.postalCode.trim() : '';
    const phone = typeof seed.phone === 'string' ? seed.phone.trim() : '';
    const openingHours = typeof seed.openingHours === 'string' ? seed.openingHours.trim() : null;
    const latitude = typeof seed.latitude === 'number' ? seed.latitude : null;
    const longitude = typeof seed.longitude === 'number' ? seed.longitude : null;
    if (
      !origin ||
      !officialLocationId ||
      !name ||
      !address ||
      !city ||
      !state ||
      !postalCode ||
      !phone ||
      latitude === null ||
      longitude === null
    ) {
      throw new Error(`Official origin profile is incomplete for Candidate ${candidate.id}.`);
    }
    counters.verifiedOfficialLocations += 1;

    await db
      .insert(candidateSourceRecords)
      .values([
        { candidateId: candidate.id, sourceRecordId: termsRecord.id, relationship: 'supporting' },
        { candidateId: candidate.id, sourceRecordId: speedRecord.id, relationship: 'supporting' },
      ])
      .onConflictDoNothing();

    const officialEvidenceId = await deterministicUuid(
      `steak-n-shake:official-terms:evidence:${candidate.id}`,
    );
    const processorEvidenceId = await deterministicUuid(
      `steak-n-shake:speed:evidence:${candidate.id}`,
    );
    const [existingOfficialEvidence] = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(eq(evidence.id, officialEvidenceId))
      .limit(1);
    if (!existingOfficialEvidence) {
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
          'Steak n Shake official Terms currently document BTC payment for certain in-store or drive-through orders, including a QR-code payment flow. This Evidence is brand-region scope and is expanded only through the current official U.S. location directory.',
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: terms.contentHash,
      });
      counters.officialEvidenceCreated += 1;
    }
    const [existingProcessorEvidence] = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(eq(evidence.id, processorEvidenceId))
      .limit(1);
    if (!existingProcessorEvidence) {
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
          'Speed describes the U.S. Steak n Shake rollout across all 393 locations at launch, including franchise and corporate-owned footprint and Bitcoin Lightning QR payment flows. Current location count is taken from the merchant directory, not fixed to the historical 393 figure.',
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
      if (!promotion) throw new Error('Promoted Candidate is missing its promotion decision.');
      claimId = promotion.claimId;
      counters.alreadyPromoted += 1;
    } else {
      if (candidate.canonicalEntityId || candidate.canonicalLocationId) {
        throw new Error('Unpromoted Candidate already has canonical links.');
      }
      const entityId = await deterministicUuid(`steak-n-shake:entity:${candidate.id}`);
      const locationId = await deterministicUuid(`steak-n-shake:location:${candidate.id}`);
      claimId = await deterministicUuid(`steak-n-shake:claim:${candidate.id}`);
      const claimAssetId = await deterministicUuid(
        `steak-n-shake:claim-asset:${candidate.id}:lightning`,
      );
      const promotionRequestId = await deterministicUuid(`steak-n-shake:promotion:${candidate.id}`);
      const promotedAt = new Date(Math.max(Date.now(), candidate.updatedAt.getTime() + 1_000));
      const context = authorizeCandidatePromotion(reviewer, promotionPolicy, promotionRequestId);
      const receipt = await createCandidatePromotionService(
        createDrizzleCandidatePromotionBackend(db),
      ).promote(context, {
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
            slug: `steak-n-shake-${officialLocationId}`.slice(0, 64),
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
            description: null,
            openingHours,
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
            acceptanceScope: 'all_checkout',
            claimStatus: 'candidate',
            visibility: 'hidden',
            customerPaysCrypto: true,
            merchantExplicitlyAcceptsCrypto: true,
            processorId: null,
            howToPay:
              'At a supported Steak n Shake in-store or drive-through checkout, choose Bitcoin when offered, scan the displayed QR code with a Bitcoin Lightning wallet, and complete the BTC payment.',
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
              notes:
                'Lightning rail supported by current Speed implementation material; merchant Terms document the BTC QR flow.',
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
      });
      if (receipt.state === 'committed') counters.promoted += 1;
    }

    let [claim] = await db
      .select({
        claimStatus: acceptanceClaims.claimStatus,
        visibility: acceptanceClaims.visibility,
        updatedAt: acceptanceClaims.updatedAt,
      })
      .from(acceptanceClaims)
      .where(eq(acceptanceClaims.id, claimId))
      .limit(1);
    if (!claim) throw new Error('Promoted Claim is missing.');

    const evidenceRows = await db
      .select({ id: evidence.id, claimId: evidence.claimId })
      .from(evidence)
      .where(inArray(evidence.id, [officialEvidenceId, processorEvidenceId]));
    for (const row of evidenceRows) {
      if (row.claimId === null) {
        await db
          .update(evidence)
          .set({ claimId })
          .where(and(eq(evidence.id, row.id), isNull(evidence.claimId)));
      } else if (row.claimId !== claimId) {
        throw new Error(`Evidence ${row.id} is already bound to another Claim.`);
      }
    }

    const [processorBefore] = await db
      .select({ reviewStatus: evidence.reviewStatus })
      .from(evidence)
      .where(eq(evidence.id, processorEvidenceId))
      .limit(1);
    await reviewSupportingEvidenceNoChange(
      db,
      reviewer,
      evidencePolicy,
      claimId,
      processorEvidenceId,
      candidate.id,
    );
    if (processorBefore?.reviewStatus === 'pending') counters.processorEvidenceAccepted += 1;

    [claim] = await db
      .select({
        claimStatus: acceptanceClaims.claimStatus,
        visibility: acceptanceClaims.visibility,
        updatedAt: acceptanceClaims.updatedAt,
      })
      .from(acceptanceClaims)
      .where(eq(acceptanceClaims.id, claimId))
      .limit(1);
    if (!claim) throw new Error('Claim disappeared after processor Evidence review.');
    if (claim.claimStatus === 'confirmed') {
      counters.alreadyConfirmed += 1;
      continue;
    }
    if (claim.claimStatus !== 'candidate') {
      throw new Error(`Unexpected Claim status before merchant Evidence review: ${claim.claimStatus}.`);
    }

    const [officialRow] = await db
      .select({ reviewStatus: evidence.reviewStatus, updatedAt: evidence.updatedAt })
      .from(evidence)
      .where(eq(evidence.id, officialEvidenceId))
      .limit(1);
    if (!officialRow) throw new Error('Official merchant Evidence is missing.');
    if (officialRow.reviewStatus !== 'pending') {
      throw new Error(
        `Official merchant Evidence is not pending while Claim is unconfirmed: ${officialRow.reviewStatus}.`,
      );
    }
    const acceptedRows = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.claimId, claimId), eq(evidence.reviewStatus, 'accepted')))
      .orderBy(asc(evidence.id));
    const assetRows = await db
      .select({ id: claimAssets.id })
      .from(claimAssets)
      .where(eq(claimAssets.claimId, claimId))
      .orderBy(asc(claimAssets.id));
    const decidedAt = new Date(
      Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, officialRow.updatedAt.getTime() + 1_000),
    );
    const nextReviewAt = new Date(
      decidedAt.getTime() + NEXT_REVIEW_DAYS * 24 * 60 * 60 * 1_000,
    );
    const reviewRequestId = await deterministicUuid(
      `steak-n-shake:merchant-evidence-review:${candidate.id}`,
    );
    const reviewContext = authorizeEvidenceReview(reviewer, evidencePolicy, reviewRequestId);
    const receipt = await createEvidenceReviewDecisionService(
      createDrizzleEvidenceReviewBackend(db),
    ).decide(reviewContext, {
      evidenceId: officialEvidenceId,
      claimId,
      expectedEvidenceUpdatedAt: officialRow.updatedAt.toISOString(),
      expectedEvidenceReviewStatus: 'pending',
      expectedClaimUpdatedAt: claim.updatedAt.toISOString(),
      expectedClaimStatus: 'candidate',
      expectedClaimVisibility: claim.visibility,
      expectedAcceptedEvidenceIds: acceptedRows.map((row) => row.id),
      expectedClaimAssetIds: assetRows.map((row) => row.id),
      decidedAt: decidedAt.toISOString(),
      disposition: 'accepted',
      finding: 'supports_claim',
      claimAction: 'confirm',
      reasonCode: 'official_payment_page_verified',
      publicSummary: null,
      internalNote:
        'Confirmed from merchant A2 Terms plus accepted Speed B2 evidence. The source claim is brand_region for U.S. stores; this location-specific derived Claim was created only after the current first-party directory, all-U.S. Speed rollout, franchise/corporate coverage, and 100% coordinate completeness gates passed.',
      nextReviewAt: nextReviewAt.toISOString(),
      endedReason: null,
    });
    if (receipt.state === 'committed' && receipt.claimStatus === 'confirmed') {
      counters.confirmed += 1;
    }
  }

  const branchExpansionGatePassed =
    directory.rows.length >= MIN_DIRECTORY_COUNT &&
    directory.rows.length <= MAX_DIRECTORY_COUNT &&
    validCoordinates === directory.rows.length &&
    withPhone === directory.rows.length &&
    withHours === directory.rows.length &&
    counters.verifiedOfficialLocations === directory.rows.length;
  if (!branchExpansionGatePassed) {
    throw new Error('Steak n Shake brand-region branch expansion gate failed.');
  }

  console.log(
    JSON.stringify({
      target: TARGET,
      merchant: 'Steak n Shake',
      sourceSystem: 'steak_n_shake_official_location_directory',
      officialDirectoryFetched: directory.rows.length,
      validCoordinates,
      withPhone,
      withHours,
      stateCount,
      directorySourceRecordsCreated,
      directorySourceRecordsReplayed: directory.rows.length - directorySourceRecordsCreated,
      candidatesCreated,
      candidatesReplayed: directory.rows.length - candidatesCreated,
      historicalSpeedRolloutCount: HISTORICAL_SPEED_ROLLOUT_COUNT,
      currentDirectoryCount: directory.rows.length,
      merchantTermsReverified: true,
      currentSpeedRolloutReverified: true,
      franchiseAndCorporateCoverageReverified: true,
      branchExpansionGatePassed,
      ...counters,
      automaticPublicVisibility: false,
      candidatePayloadExposed: false,
    }),
  );
}

await main();
