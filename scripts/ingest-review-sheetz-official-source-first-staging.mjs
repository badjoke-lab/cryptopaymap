import { readFile } from 'node:fs/promises';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createDerivedStagingServiceIdentity } from '../src/admin/access/identity.ts';
import {
  authorizeEvidenceReview,
  readEvidenceReviewAuthorizationPolicy,
} from '../src/admin/evidence-review/authorization.ts';
import { createEvidenceReviewDecisionService } from '../src/admin/evidence-review/decision.ts';
import { createDrizzleEvidenceReviewBackend } from '../src/admin/evidence-review/drizzle-backend.ts';
import {
  authorizeCandidatePromotion,
  readCandidatePromotionAuthorizationPolicy,
} from '../src/admin/promotion/authorization.ts';
import { createCandidatePromotionService } from '../src/admin/promotion/candidate-promotion.ts';
import { createDrizzleCandidatePromotionBackend } from '../src/admin/promotion/drizzle-candidate-promotion-backend.ts';
import { createDatabase } from '../src/db/client.ts';
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
} from '../src/db/schema/index.ts';

const TARGET = 'fixed-review-staging';
const DIRECTORY_FILE = 'sheetz-official-directory.json';
const LOCATOR_URL = 'https://orders.sheetz.com/findASheetz';
const FLEXA_SHEETZ_URL = 'https://flexa.co/newsroom/sheetz';
const FLEXA_CURRENCIES_URL = 'https://docs.flexa.co/payments/currencies';
const FLEXA_HOW_TO_PAY_URL = 'https://support.flexa.co/en/articles/7243531-how-do-i-pay-with-flexa';
const MIN_DIRECTORY_COUNT = 800;
const MAX_DIRECTORY_COUNT = 950;
const MIN_ELIGIBLE_COUNT = 500;
const MAX_ELIGIBLE_COUNT = 800;
const NEXT_REVIEW_DAYS = 120;
const IMPORTER_VERSION = 'sheetz-source-first-v1';
const SOURCE_SCHEMA_VERSION = 'sheetz-official-store-locator-v1';
const SOURCE_SYNC_CONCURRENCY = 8;
const REVIEW_CONCURRENCY = 8;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function normalizedName(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function pageText(value) {
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

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uuid(label) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)),
  ).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameDomain(url, expected) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === expected || host.endsWith(`.${expected}`);
  } catch {
    return false;
  }
}

async function fetchPage(url, domain) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
    headers: {
      'user-agent': 'CryptoPayMap-source-first-review/3.0',
      accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
    },
  });
  if (!response.ok) throw new Error(`Source verification failed: HTTP ${response.status} ${url}`);
  if (!sameDomain(response.url, domain)) throw new Error(`Source redirected outside ${domain}: ${response.url}`);
  const body = await response.text();
  return {
    url: response.url,
    body,
    fetchedAt: new Date(),
    contentHash: await sha256(pageText(body)),
  };
}

function verifyFlexaSheetz(body) {
  const value = pageText(body);
  if (!/sheetz/.test(value) || !/bitcoin/.test(value)) {
    throw new Error('Flexa Sheetz implementation material no longer verifies Sheetz + Bitcoin.');
  }
  if (!/in-store/.test(value) || !/point-of-sale/.test(value)) {
    throw new Error('Flexa Sheetz material no longer verifies the in-store POS integration.');
  }
  if (!/(750\+|750 locations)/.test(value)) {
    throw new Error('Flexa Sheetz material lost its historical rollout scope.');
  }
}

function verifyFlexaCurrencies(body) {
  const value = pageText(body);
  if (!/bitcoin/.test(value) || !/\bbtc\b/.test(value) || !/lightning/.test(value)) {
    throw new Error('Current Flexa currency documentation no longer verifies BTC on Lightning.');
  }
}

function verifyFlexaHowToPay(body) {
  const value = pageText(body);
  if (!/flexa-branded qr code/.test(value) || !/scan/.test(value)) {
    throw new Error('Current Flexa payment instructions no longer verify the QR flow.');
  }
  if (!/select the asset/.test(value) || !/pay now/.test(value)) {
    throw new Error('Current Flexa payment instructions lost asset-selection/payment steps.');
  }
}

async function readDirectory() {
  const parsed = JSON.parse(await readFile(DIRECTORY_FILE, 'utf8'));
  if (!Array.isArray(parsed?.rows)) throw new Error(`${DIRECTORY_FILE} is missing rows.`);
  const fetchedAt = new Date(parsed.fetchedAt);
  if (!Number.isFinite(fetchedAt.getTime())) throw new Error('Sheetz directory fetchedAt is invalid.');
  if (parsed.rows.length < MIN_DIRECTORY_COUNT || parsed.rows.length > MAX_DIRECTORY_COUNT) {
    throw new Error(`Sheetz official directory count outside guard range: ${parsed.rows.length}.`);
  }

  const rows = parsed.rows.map((raw) => {
    const row = object(raw);
    const features = object(row.features);
    const storeNumber = text(row.storeNumber);
    const address = text(row.address);
    const city = text(row.city);
    const state = text(row.state).toUpperCase();
    const postalCode = text(row.zip);
    const phone = text(row.phone);
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (
      !storeNumber || !address || !city || !/^[A-Z]{2}$/.test(state) || !postalCode || !phone ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)
    ) {
      throw new Error(`Sheetz official row has an incomplete profile: store=${storeNumber || '?'}.`);
    }
    if (typeof features.cryptoFlexaPay !== 'boolean' || typeof features.cryptoCurrencyAcceptance !== 'boolean') {
      throw new Error(`Sheetz official row is missing crypto booleans: store=${storeNumber}.`);
    }
    if (features.cryptoFlexaPay !== features.cryptoCurrencyAcceptance) {
      throw new Error(`Sheetz crypto flags disagree: store=${storeNumber}.`);
    }
    return {
      raw: row,
      storeNumber,
      name: `Sheetz #${storeNumber}`,
      address,
      city,
      state,
      postalCode,
      phone,
      latitude,
      longitude,
      cryptoFlexaPay: features.cryptoFlexaPay,
      cryptoCurrencyAcceptance: features.cryptoCurrencyAcceptance,
    };
  });

  if (new Set(rows.map((row) => row.storeNumber)).size !== rows.length) {
    throw new Error('Sheetz official directory contains duplicate store numbers.');
  }
  if (new Set(rows.map((row) => `${row.latitude.toFixed(6)},${row.longitude.toFixed(6)}`)).size !== rows.length) {
    throw new Error('Sheetz official directory contains duplicate coordinates.');
  }
  const eligible = rows.filter((row) => row.cryptoFlexaPay && row.cryptoCurrencyAcceptance);
  if (eligible.length < MIN_ELIGIBLE_COUNT || eligible.length > MAX_ELIGIBLE_COUNT) {
    throw new Error(`Sheetz current Pay with Crypto count outside guard range: ${eligible.length}.`);
  }
  return {
    rows,
    eligible,
    fetchedAt,
    source: text(parsed.source) || 'https://orders.sheetz.com/anybff/api/stores/search',
    locator: text(parsed.locator) || LOCATOR_URL,
  };
}

async function ensureSource(db, sourceType, name, baseUrl, attributionText) {
  let [row] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.sourceType, sourceType), eq(sources.name, name)))
    .limit(1);
  if (!row) {
    [row] = await db
      .insert(sources)
      .values({ sourceType, name, baseUrl, attributionText, isActive: true })
      .returning();
  }
  if (!row) throw new Error(`Failed to resolve Source ${name}.`);
  return row;
}

async function ensureRecord(db, input) {
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

async function ensureFlexaProcessor(db) {
  let [row] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.entityType, 'payment_processor'), eq(entities.name, 'Flexa')))
    .limit(1);
  if (!row) {
    const id = await uuid('cryptopaymap:processor:flexa.co');
    [row] = await db
      .insert(entities)
      .values({
        id,
        entityType: 'payment_processor',
        name: 'Flexa',
        slug: 'flexa-payment-processor',
        legalName: null,
        websiteUrl: 'https://flexa.co/',
        countryCode: null,
        entityStatus: 'active',
        visibility: 'hidden',
      })
      .onConflictDoNothing()
      .returning();
    if (!row) [row] = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
  }
  if (!row) throw new Error('Failed to resolve Flexa processor Entity.');
  const slug = row.slug ?? 'flexa-payment-processor';
  if (row.slug === null || row.websiteUrl !== 'https://flexa.co/' || row.entityStatus !== 'active') {
    await db
      .update(entities)
      .set({ slug, websiteUrl: 'https://flexa.co/', entityStatus: 'active' })
      .where(eq(entities.id, row.id));
    [row] = await db.select().from(entities).where(eq(entities.id, row.id)).limit(1);
  }
  if (!row?.slug) throw new Error('Flexa processor Entity is missing its processor slug.');
  return row;
}

async function acceptEvidence(db, reviewer, policy, input) {
  const [item] = await db
    .select({ reviewStatus: evidence.reviewStatus, updatedAt: evidence.updatedAt })
    .from(evidence)
    .where(eq(evidence.id, input.evidenceId))
    .limit(1);
  if (!item) throw new Error(`Evidence missing: ${input.evidenceId}`);
  if (item.reviewStatus === 'accepted') return 'already_accepted';
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
  const nextReviewAt = input.claimAction === 'confirm'
    ? new Date(decidedAt.getTime() + NEXT_REVIEW_DAYS * 24 * 60 * 60 * 1_000)
    : null;
  const requestId = await uuid(
    `sheetz:evidence-review:${input.claimAction}:${input.candidateId}:${input.evidenceId}`,
  );
  const context = authorizeEvidenceReview(reviewer, policy, requestId);
  const receipt = await createEvidenceReviewDecisionService(
    createDrizzleEvidenceReviewBackend(db),
  ).decide(context, {
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
  });
  return receipt.state;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Sheetz source-first mutation outside ${TARGET}.`);
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

  const [directory, flexaSheetz, flexaCurrencies, flexaHowToPay] = await Promise.all([
    readDirectory(),
    fetchPage(FLEXA_SHEETZ_URL, 'flexa.co'),
    fetchPage(FLEXA_CURRENCIES_URL, 'docs.flexa.co'),
    fetchPage(FLEXA_HOW_TO_PAY_URL, 'support.flexa.co'),
  ]);
  verifyFlexaSheetz(flexaSheetz.body);
  verifyFlexaCurrencies(flexaCurrencies.body);
  verifyFlexaHowToPay(flexaHowToPay.body);

  const directorySource = await ensureSource(
    db,
    'official_site',
    'Sheetz official Store Locator',
    LOCATOR_URL,
    'Sheetz official Store Locator',
  );
  const processorSource = await ensureSource(
    db,
    'processor',
    'Flexa',
    'https://flexa.co/',
    'Flexa digital payments',
  );
  const flexaProcessor = await ensureFlexaProcessor(db);

  const implementationRecord = await ensureRecord(db, {
    sourceId: processorSource.id,
    externalId: 'flexa:sheetz-in-store-bitcoin-implementation',
    sourceUrl: flexaSheetz.url,
    officialDomain: 'flexa.co',
    rawPayload: {
      discovery: 'processor_sheetz_implementation',
      merchant: 'Sheetz',
      claimScope: 'brand_region',
      historicalRollout: 'all_750_plus_locations',
      includesBitcoin: true,
      inStorePosIntegration: true,
      currentLocationEligibilityControlledByMerchantDirectory: true,
    },
    fetchedAt: flexaSheetz.fetchedAt,
    contentHash: flexaSheetz.contentHash,
  });
  const currenciesRecord = await ensureRecord(db, {
    sourceId: processorSource.id,
    externalId: 'flexa:current-bitcoin-network-support',
    sourceUrl: flexaCurrencies.url,
    officialDomain: 'docs.flexa.co',
    rawPayload: {
      discovery: 'processor_current_currency_documentation',
      asset: 'bitcoin',
      symbol: 'BTC',
      networks: ['bitcoin', 'lightning'],
    },
    fetchedAt: flexaCurrencies.fetchedAt,
    contentHash: flexaCurrencies.contentHash,
  });
  const howToPayRecord = await ensureRecord(db, {
    sourceId: processorSource.id,
    externalId: 'flexa:current-in-person-qr-flow',
    sourceUrl: flexaHowToPay.url,
    officialDomain: 'support.flexa.co',
    rawPayload: {
      discovery: 'processor_current_payment_instructions',
      flow: 'flexa_branded_qr',
      customerSteps: ['scan_qr', 'select_app', 'select_asset', 'pay_now'],
    },
    fetchedAt: flexaHowToPay.fetchedAt,
    contentHash: flexaHowToPay.contentHash,
  });

  const eligible = directory.eligible;
  const externalIds = eligible.map((row) => `sheetz:${row.storeNumber}`);
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

  const directoryFingerprint = await sha256(
    JSON.stringify(eligible.map((row) => [row.storeNumber, row.cryptoFlexaPay, row.latitude, row.longitude])),
  );
  const importBatchId = await uuid(`sheetz:import-batch:${directorySource.id}:${directoryFingerprint}`);
  const importRequestId = await uuid(`sheetz:import-request:${directorySource.id}:${directoryFingerprint}`);
  await db
    .insert(importBatches)
    .values({
      id: importBatchId,
      requestId: importRequestId,
      actorId: 'system:sheetz-official-store-locator',
      actorType: 'system',
      sourceId: directorySource.id,
      importKind: 'physical_place',
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      importerVersion: IMPORTER_VERSION,
      inputChecksum: directoryFingerprint,
      inputCount: eligible.length,
      acceptedCount: candidatesCreated,
      rejectedCount: 0,
      replayedCount: eligible.length - candidatesCreated,
      outOfScopeCount: directory.rows.length - eligible.length,
      duplicateSignalCount: 0,
      automaticConfirmedCount: 0,
      rejectionSummary: {},
      startedAt: directory.fetchedAt,
      completedAt: new Date(),
    })
    .onConflictDoNothing();

  const syncRow = async (index) => {
    const row = eligible[index];
    const sourceRecordId = sourceRecordIds[index];
    const candidateId = candidateIds[index];
    const rawPayload = {
      sourceSystem: 'sheetz_official_store_locator',
      importerVersion: IMPORTER_VERSION,
      merchantOwnedCryptoFlags: {
        cryptoFlexaPay: row.cryptoFlexaPay,
        cryptoCurrencyAcceptance: row.cryptoCurrencyAcceptance,
      },
      officialStore: row.raw,
      reviewSeed: {
        name: row.name,
        candidateType: 'physical_place',
        storeNumber: row.storeNumber,
        address: row.address,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
        countryCode: 'US',
        latitude: row.latitude,
        longitude: row.longitude,
        phone: row.phone,
        websiteUrl: LOCATOR_URL,
      },
    };
    const contentHash = await sha256(JSON.stringify(rawPayload));
    await db
      .insert(sourceRecords)
      .values({
        id: sourceRecordId,
        sourceId: directorySource.id,
        externalId: externalIds[index],
        sourceUrl: LOCATOR_URL,
        rawPayload,
        officialDomain: 'sheetz.com',
        observedAt: directory.fetchedAt,
        fetchedAt: directory.fetchedAt,
        contentHash,
      })
      .onConflictDoNothing();
    await db
      .update(sourceRecords)
      .set({
        sourceUrl: LOCATOR_URL,
        rawPayload,
        officialDomain: 'sheetz.com',
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
        priority: 990,
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
  };

  for (let offset = 0; offset < eligible.length; offset += SOURCE_SYNC_CONCURRENCY) {
    const indexes = Array.from(
      { length: Math.min(SOURCE_SYNC_CONCURRENCY, eligible.length - offset) },
      (_, index) => offset + index,
    );
    await Promise.all(indexes.map(syncRow));
  }

  const [[bitcoin], [lightning], [lightningInvoice]] = await Promise.all([
    db.select({ id: assets.id }).from(assets).where(and(eq(assets.slug, 'bitcoin'), eq(assets.status, 'active'))).limit(1),
    db.select({ id: networks.id }).from(networks).where(and(eq(networks.slug, 'lightning'), eq(networks.status, 'active'))).limit(1),
    db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.slug, 'lightning_invoice'), eq(paymentMethods.status, 'active'))).limit(1),
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
  if (candidates.length !== eligible.length) {
    throw new Error(`Sheetz Candidate resolution mismatch: ${candidates.length}/${eligible.length}.`);
  }

  const counters = {
    candidatesResolved: candidates.length,
    verifiedOfficialLocations: 0,
    promoted: 0,
    alreadyPromoted: 0,
    confirmed: 0,
    alreadyConfirmed: 0,
    merchantEvidenceCreated: 0,
    processorImplementationEvidenceCreated: 0,
    processorCurrencyEvidenceCreated: 0,
    processorHowToPayEvidenceCreated: 0,
    processorEvidenceAccepted: 0,
  };

  const processCandidate = async (candidate) => {
    if (!['new', 'triaged', 'promoted'].includes(candidate.status)) {
      throw new Error(`Unexpected Candidate status ${candidate.status}: ${candidate.id}.`);
    }
    const relations = await db
      .select({
        sourceRecordId: candidateSourceRecords.sourceRecordId,
        relationship: candidateSourceRecords.relationship,
        rawPayload: sourceRecords.rawPayload,
        contentHash: sourceRecords.contentHash,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, candidate.id))
      .orderBy(asc(candidateSourceRecords.sourceRecordId));
    const origin = relations.find(
      (relation) => relation.relationship === 'origin' && object(relation.rawPayload).sourceSystem === 'sheetz_official_store_locator',
    );
    const originPayload = object(origin?.rawPayload);
    const flags = object(originPayload.merchantOwnedCryptoFlags);
    const seed = object(originPayload.reviewSeed);
    const storeNumber = text(seed.storeNumber);
    const name = text(seed.name);
    const address = text(seed.address);
    const city = text(seed.city);
    const state = text(seed.state);
    const postalCode = text(seed.postalCode);
    const phone = text(seed.phone);
    const latitude = typeof seed.latitude === 'number' ? seed.latitude : Number(seed.latitude);
    const longitude = typeof seed.longitude === 'number' ? seed.longitude : Number(seed.longitude);
    if (
      !origin || !storeNumber || !name || !address || !city || !state || !postalCode || !phone ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)
    ) {
      throw new Error(`Official Sheetz origin profile incomplete for Candidate ${candidate.id}.`);
    }
    if (flags.cryptoFlexaPay !== true || flags.cryptoCurrencyAcceptance !== true) {
      throw new Error(`Candidate ${candidate.id} is no longer merchant-marked Pay with Crypto.`);
    }
    counters.verifiedOfficialLocations += 1;

    await db
      .insert(candidateSourceRecords)
      .values([
        { candidateId: candidate.id, sourceRecordId: implementationRecord.id, relationship: 'supporting' },
        { candidateId: candidate.id, sourceRecordId: currenciesRecord.id, relationship: 'supporting' },
        { candidateId: candidate.id, sourceRecordId: howToPayRecord.id, relationship: 'supporting' },
      ])
      .onConflictDoNothing();

    const merchantEvidenceId = await uuid(`sheetz:merchant-location-evidence:${candidate.id}`);
    const implementationEvidenceId = await uuid(`sheetz:flexa-implementation-evidence:${candidate.id}`);
    const currencyEvidenceId = await uuid(`sheetz:flexa-currency-evidence:${candidate.id}`);
    const howToPayEvidenceId = await uuid(`sheetz:flexa-how-to-pay-evidence:${candidate.id}`);

    if (!(await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, merchantEvidenceId)).limit(1))[0]) {
      await db.insert(evidence).values({
        id: merchantEvidenceId,
        sourceRecordId: origin.sourceRecordId,
        evidenceKind: 'official_payment_page',
        evidenceClass: 'a',
        sourceType: 'official_page',
        originRole: 'merchant_side',
        polarity: 'supporting',
        sourceName: 'Sheetz official Store Locator',
        sourceUrl: LOCATOR_URL,
        sourceNativeId: `store:${storeNumber}`,
        observedAt: directory.fetchedAt,
        fetchedAt: directory.fetchedAt,
        summary: `Sheetz's current official Store Locator marks Store #${storeNumber} as Pay with Crypto (cryptoFlexaPay=true) and cryptoCurrencyAcceptance=true.`,
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: origin.contentHash,
      });
      counters.merchantEvidenceCreated += 1;
    }
    if (!(await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, implementationEvidenceId)).limit(1))[0]) {
      await db.insert(evidence).values({
        id: implementationEvidenceId,
        sourceRecordId: implementationRecord.id,
        evidenceKind: 'processor_case_study',
        evidenceClass: 'b',
        sourceType: 'processor',
        originRole: 'processor_side',
        polarity: 'supporting',
        sourceName: 'Flexa Sheetz implementation announcement',
        sourceUrl: flexaSheetz.url,
        observedAt: flexaSheetz.fetchedAt,
        fetchedAt: flexaSheetz.fetchedAt,
        summary: 'Flexa documents Sheetz in-store digital-asset acceptance integrated with Sheetz POS and explicitly includes bitcoin. Historical all-store rollout language is not used to override current merchant location flags.',
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: flexaSheetz.contentHash,
        independenceKey: 'processor:flexa.co',
      });
      counters.processorImplementationEvidenceCreated += 1;
    }
    if (!(await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, currencyEvidenceId)).limit(1))[0]) {
      await db.insert(evidence).values({
        id: currencyEvidenceId,
        sourceRecordId: currenciesRecord.id,
        evidenceKind: 'platform_capability',
        evidenceClass: 'b',
        sourceType: 'processor',
        originRole: 'processor_side',
        polarity: 'supporting',
        sourceName: 'Flexa current supported currencies',
        sourceUrl: flexaCurrencies.url,
        observedAt: flexaCurrencies.fetchedAt,
        fetchedAt: flexaCurrencies.fetchedAt,
        summary: 'Current Flexa Payments documentation lists Bitcoin (BTC) with network support on Bitcoin and Lightning.',
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: flexaCurrencies.contentHash,
        independenceKey: 'processor:flexa.co',
      });
      counters.processorCurrencyEvidenceCreated += 1;
    }
    if (!(await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, howToPayEvidenceId)).limit(1))[0]) {
      await db.insert(evidence).values({
        id: howToPayEvidenceId,
        sourceRecordId: howToPayRecord.id,
        evidenceKind: 'platform_capability',
        evidenceClass: 'b',
        sourceType: 'processor',
        originRole: 'processor_side',
        polarity: 'supporting',
        sourceName: 'Flexa current payment instructions',
        sourceUrl: flexaHowToPay.url,
        observedAt: flexaHowToPay.fetchedAt,
        fetchedAt: flexaHowToPay.fetchedAt,
        summary: 'Current Flexa instructions describe scanning a Flexa-branded QR code, choosing an app and payment asset, and completing the payment.',
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: flexaHowToPay.contentHash,
        independenceKey: 'processor:flexa.co',
      });
      counters.processorHowToPayEvidenceCreated += 1;
    }

    let claimId;
    if (candidate.status === 'promoted') {
      const [promotion] = await db
        .select({ claimId: candidatePromotionDecisions.claimId })
        .from(candidatePromotionDecisions)
        .where(eq(candidatePromotionDecisions.candidateId, candidate.id))
        .limit(1);
      if (!promotion) throw new Error('Promoted Sheetz Candidate missing promotion decision.');
      claimId = promotion.claimId;
      counters.alreadyPromoted += 1;
    } else {
      if (candidate.canonicalEntityId || candidate.canonicalLocationId) {
        throw new Error('Unpromoted Sheetz Candidate has canonical links.');
      }
      const entityId = await uuid(`sheetz:entity:${candidate.id}`);
      const locationId = await uuid(`sheetz:location:${candidate.id}`);
      claimId = await uuid(`sheetz:claim:${candidate.id}`);
      const claimAssetId = await uuid(`sheetz:claim-asset:${candidate.id}:lightning`);
      const requestId = await uuid(`sheetz:promotion:${candidate.id}`);
      const promotedAt = new Date(Math.max(Date.now(), candidate.updatedAt.getTime() + 1_000));
      const context = authorizeCandidatePromotion(reviewer, promotionPolicy, requestId);
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
            name: 'Sheetz',
            slug: null,
            legalName: null,
            websiteUrl: 'https://www.sheetz.com/',
            countryCode: 'US',
            entityStatus: 'active',
            visibility: 'hidden',
          },
        },
        location: {
          id: locationId,
          value: {
            name,
            slug: `sheetz-${storeNumber}`.slice(0, 64),
            addressLine: address,
            locality: city,
            region: state,
            postalCode,
            countryCode: 'US',
            latitude,
            longitude,
            locationStatus: 'active',
            visibility: 'hidden',
            websiteUrl: LOCATOR_URL,
            phone,
            description: `Official Sheetz convenience store location in ${city}, ${state}.`,
            openingHours: null,
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
            processorId: flexaProcessor.id,
            howToPay: 'At a Sheetz store currently marked Pay with Crypto, use the Flexa in-person payment flow when presented: scan the Flexa QR, choose a compatible app, select Bitcoin, and complete the payment.',
            instructionsLanguage: 'en',
            merchantReceives: 'not_publicly_confirmed',
            restrictions: 'Current inclusion is limited to Sheetz official Store Locator rows where both cryptoFlexaPay and cryptoCurrencyAcceptance are true. Checkout availability can vary by transaction and compatible wallet.',
            firstConfirmedAt: null,
            lastConfirmedAt: null,
            nextReviewAt: null,
            endedAt: null,
            endedReason: null,
          },
        },
        claimAssets: [{
          id: claimAssetId,
          value: {
            claimId,
            assetId: bitcoin.id,
            networkId: lightning.id,
            paymentMethodId: lightningInvoice.id,
            contractAddress: null,
            isPrimary: true,
            notes: 'Flexa current currency documentation lists Bitcoin with Lightning network support.',
          },
        }],
        sourceRecordIds: [
          ...new Set([
            ...relations.map((relation) => relation.sourceRecordId),
            implementationRecord.id,
            currenciesRecord.id,
            howToPayRecord.id,
          ]),
        ],
      });
      if (receipt.state === 'committed') counters.promoted += 1;
    }

    const evidenceIds = [merchantEvidenceId, implementationEvidenceId, currencyEvidenceId, howToPayEvidenceId];
    const evidenceRows = await db
      .select({ id: evidence.id, claimId: evidence.claimId })
      .from(evidence)
      .where(inArray(evidence.id, evidenceIds));
    for (const item of evidenceRows) {
      if (item.claimId === null) {
        await db.update(evidence).set({ claimId }).where(and(eq(evidence.id, item.id), isNull(evidence.claimId)));
      } else if (item.claimId !== claimId) {
        throw new Error(`Sheetz Evidence ${item.id} is bound to another Claim.`);
      }
    }

    const reviewReadyAt = new Date(Math.ceil(Date.now() / 1_000) * 1_000);
    await db
      .update(evidence)
      .set({ updatedAt: reviewReadyAt })
      .where(and(inArray(evidence.id, evidenceIds), eq(evidence.reviewStatus, 'pending')));

    for (const processorEvidence of [
      [implementationEvidenceId, 'processor_case_study_verified', 'Accepted Flexa B2 Sheetz implementation evidence; current merchant location flags remain the location-specific eligibility gate.'],
      [currencyEvidenceId, 'processor_capability_verified', 'Accepted current Flexa B2 BTC/Lightning capability evidence.'],
      [howToPayEvidenceId, 'processor_payment_flow_verified', 'Accepted current Flexa B2 in-person QR payment-flow evidence.'],
    ]) {
      const stateResult = await acceptEvidence(db, reviewer, evidencePolicy, {
        candidateId: candidate.id,
        claimId,
        evidenceId: processorEvidence[0],
        claimAction: 'no_change',
        reasonCode: processorEvidence[1],
        note: processorEvidence[2],
      });
      if (stateResult !== 'already_accepted') counters.processorEvidenceAccepted += 1;
    }

    const [claim] = await db
      .select({ status: acceptanceClaims.claimStatus })
      .from(acceptanceClaims)
      .where(eq(acceptanceClaims.id, claimId))
      .limit(1);
    if (!claim) throw new Error('Sheetz Claim missing after processor Evidence review.');
    if (claim.status === 'confirmed') {
      counters.alreadyConfirmed += 1;
      return;
    }
    if (claim.status !== 'candidate') throw new Error(`Unexpected Sheetz Claim status ${claim.status}.`);

    const merchantState = await acceptEvidence(db, reviewer, evidencePolicy, {
      candidateId: candidate.id,
      claimId,
      evidenceId: merchantEvidenceId,
      claimAction: 'confirm',
      reasonCode: 'official_location_payment_flag_verified',
      note: `Confirmed Store #${storeNumber} from current merchant-owned location-specific cryptoFlexaPay=true and cryptoCurrencyAcceptance=true, plus accepted Flexa implementation, BTC/Lightning, and QR-flow evidence.`,
    });
    if (merchantState !== 'already_accepted') counters.confirmed += 1;
  };

  for (let offset = 0; offset < candidates.length; offset += REVIEW_CONCURRENCY) {
    await Promise.all(candidates.slice(offset, offset + REVIEW_CONCURRENCY).map(processCandidate));
  }

  const currentLocationSpecificFlagGatePassed =
    directory.rows.length >= MIN_DIRECTORY_COUNT &&
    directory.rows.length <= MAX_DIRECTORY_COUNT &&
    eligible.length >= MIN_ELIGIBLE_COUNT &&
    eligible.length <= MAX_ELIGIBLE_COUNT &&
    directory.rows.every((row) => row.cryptoFlexaPay === row.cryptoCurrencyAcceptance) &&
    counters.verifiedOfficialLocations === eligible.length;
  if (!currentLocationSpecificFlagGatePassed) {
    throw new Error('Sheetz current location-specific Pay with Crypto gate failed.');
  }

  console.log(JSON.stringify({
    target: TARGET,
    merchant: 'Sheetz',
    sourceSystem: 'sheetz_official_store_locator',
    officialDirectoryFetched: directory.rows.length,
    eligibleCryptoLocations: eligible.length,
    nonEligibleCryptoLocations: directory.rows.length - eligible.length,
    validCoordinates: directory.rows.filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)).length,
    withAddress: directory.rows.filter((row) => row.address && row.city && row.postalCode).length,
    withPhone: directory.rows.filter((row) => row.phone).length,
    cryptoFlexaPayTrue: directory.rows.filter((row) => row.cryptoFlexaPay).length,
    cryptoFlexaPayFalse: directory.rows.filter((row) => !row.cryptoFlexaPay).length,
    cryptoCurrencyAcceptanceTrue: directory.rows.filter((row) => row.cryptoCurrencyAcceptance).length,
    cryptoCurrencyAcceptanceFalse: directory.rows.filter((row) => !row.cryptoCurrencyAcceptance).length,
    cryptoFlagsCrossChecked: true,
    directorySourceRecordsCreated: sourceRecordsCreated,
    directorySourceRecordsReplayed: eligible.length - sourceRecordsCreated,
    candidatesCreated,
    candidatesReplayed: eligible.length - candidatesCreated,
    currentLocationSpecificFlagGatePassed,
    flexaSheetzImplementationReverified: true,
    flexaBitcoinLightningReverified: true,
    flexaQrFlowReverified: true,
    flexaProcessorSlug: flexaProcessor.slug,
    ...counters,
    automaticPublicVisibility: false,
    candidatePayloadExposed: false,
  }));
}

await main();
