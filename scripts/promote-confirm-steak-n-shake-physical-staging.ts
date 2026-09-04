import { and, asc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { createDerivedStagingServiceIdentity } from '../src/admin/access/identity';
import { authorizeEvidenceReview, readEvidenceReviewAuthorizationPolicy } from '../src/admin/evidence-review/authorization';
import { createEvidenceReviewDecisionService } from '../src/admin/evidence-review/decision';
import { createDrizzleEvidenceReviewBackend } from '../src/admin/evidence-review/drizzle-backend';
import { authorizeCandidatePromotion, readCandidatePromotionAuthorizationPolicy } from '../src/admin/promotion/authorization';
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
  networks,
  paymentMethods,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const TERMS_URL = 'https://www.steaknshake.com/terms-of-use/';
const SPEED_URL = 'https://www.tryspeed.com/steaknshake';
const MAX_TARGETS = 60;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, child]) =>
      typeof child === 'string' ? [[key, child] as const] : [],
    ),
  );
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function text(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function fetchText(url: string): Promise<{ url: string; body: string; fetchedAt: Date }> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'user-agent': 'CryptoPayMap-physical-source-review/1.0',
      accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
    },
  });
  if (!response.ok) throw new Error(`Source verification failed: HTTP ${response.status} ${url}`);
  return { url: response.url, body: await response.text(), fetchedAt: new Date() };
}

function verifyMerchantTerms(body: string): void {
  const value = text(body);
  if (!/bitcoin payments/.test(value)) throw new Error('Steak n Shake Terms lost the Bitcoin Payments section.');
  if (!/(in-store|in store)[^.!?]{0,120}(drive-through|drive through)[^.!?]{0,180}(bitcoin|btc)|(bitcoin|btc)[^.!?]{0,180}(in-store|in store|drive-through|drive through)/i.test(value)) {
    throw new Error('Steak n Shake Terms no longer verify in-store/drive-through Bitcoin payments.');
  }
  if (!/(scan a qr code|scan[^.!?]{0,50}qr code)/i.test(value)) {
    throw new Error('Steak n Shake Terms no longer expose the expected Bitcoin QR checkout flow.');
  }
}

function verifyProcessorCaseStudy(body: string): void {
  const value = text(body);
  const allLocations = /(all\s+393\s+(u\.s\.|us|united states)\s+locations)|(all\s+300\+\s+steak[^.!?]{0,80}locations)|(all\s+locations[^.!?]{0,120}(united states|u\.s\.|us))/i.test(value);
  const lightning = /lightning network|bitcoin lightning|lightning payments/i.test(value);
  if (!allLocations || !lightning) {
    throw new Error('Speed case study no longer verifies all-location U.S. Lightning deployment.');
  }
}

function countryCode(relations: Array<{ rawPayload: unknown }>, tags: Record<string, string>): string | null {
  const direct = tags['addr:country']?.trim().toUpperCase();
  if (direct && /^[A-Z]{2}$/.test(direct)) return direct;
  for (const relation of relations) {
    const payload = record(relation.rawPayload);
    if (payload.sourceSystem !== 'openstreetmap_nominatim') continue;
    const value = typeof payload.countryCode === 'string' ? payload.countryCode.trim().toUpperCase() : '';
    if (/^[A-Z]{2}$/.test(value)) return value;
  }
  return null;
}

async function ensureSource(db: ReturnType<typeof createDatabase>, sourceType: 'official_site' | 'processor', name: string, baseUrl: string) {
  let row = (await db.select().from(sources).where(and(eq(sources.sourceType, sourceType), eq(sources.name, name))).limit(1))[0];
  if (!row) {
    [row] = await db.insert(sources).values({ sourceType, name, baseUrl, isActive: true }).returning();
  }
  if (!row) throw new Error(`Failed to resolve source ${name}.`);
  return row;
}

async function ensureSourceRecord(
  db: ReturnType<typeof createDatabase>,
  input: { sourceId: string; externalId: string; sourceUrl: string; officialDomain: string; rawPayload: JsonRecord; fetchedAt: Date },
) {
  await db.insert(sourceRecords).values(input).onConflictDoNothing();
  const [row] = await db.select().from(sourceRecords).where(and(eq(sourceRecords.sourceId, input.sourceId), eq(sourceRecords.externalId, input.externalId))).limit(1);
  if (!row) throw new Error(`Failed to resolve source record ${input.externalId}.`);
  return row;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) throw new Error(`Refusing mutation outside ${TARGET}.`);
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

  const [terms, speed] = await Promise.all([fetchText(TERMS_URL), fetchText(SPEED_URL)]);
  verifyMerchantTerms(terms.body);
  verifyProcessorCaseStudy(speed.body);

  const merchantSource = await ensureSource(db, 'official_site', 'Steak n Shake official site', 'https://www.steaknshake.com/');
  const processorSource = await ensureSource(db, 'processor', 'Speed', 'https://www.tryspeed.com/');
  const merchantRecord = await ensureSourceRecord(db, {
    sourceId: merchantSource.id,
    externalId: 'steaknshake:bitcoin-terms:2025-06-03',
    sourceUrl: TERMS_URL,
    officialDomain: 'steaknshake.com',
    rawPayload: { discovery: 'merchant_official_payment_terms', merchant: 'Steak n Shake', scope: 'in_store_or_drive_through_bitcoin', fetchedUrl: terms.url },
    fetchedAt: terms.fetchedAt,
  });
  const processorRecord = await ensureSourceRecord(db, {
    sourceId: processorSource.id,
    externalId: 'speed:steaknshake:all-us-lightning:2025-05',
    sourceUrl: SPEED_URL,
    officialDomain: 'tryspeed.com',
    rawPayload: { discovery: 'processor_case_study', merchant: 'Steak n Shake', scope: 'all_393_us_locations', rail: 'lightning', fetchedUrl: speed.url },
    fetchedAt: speed.fetchedAt,
  });

  const [[bitcoin], [lightning], [lightningInvoice]] = await Promise.all([
    db.select({ id: assets.id }).from(assets).where(and(eq(assets.slug, 'bitcoin'), eq(assets.status, 'active'))).limit(1),
    db.select({ id: networks.id }).from(networks).where(and(eq(networks.slug, 'lightning'), eq(networks.status, 'active'))).limit(1),
    db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.slug, 'lightning_invoice'), eq(paymentMethods.status, 'active'))).limit(1),
  ]);
  if (!bitcoin || !lightning || !lightningInvoice) throw new Error('BTC/Lightning staging registries are not ready.');

  const candidates = await db
    .select({ id: sourceCandidates.id, status: sourceCandidates.candidateStatus, updatedAt: sourceCandidates.updatedAt, canonicalEntityId: sourceCandidates.canonicalEntityId, canonicalLocationId: sourceCandidates.canonicalLocationId })
    .from(sourceCandidates)
    .where(and(eq(sourceCandidates.candidateType, 'physical_place'), ilike(sourceCandidates.normalizedName, '%steak%n%shake%'), isNull(sourceCandidates.duplicateGroupId), inArray(sourceCandidates.candidateStatus, ['new','triaged','promoted'])))
    .orderBy(asc(sourceCandidates.id))
    .limit(MAX_TARGETS);

  const counters = { candidates: candidates.length, verifiedLightningCandidates: 0, skippedMissingOrigin: 0, skippedMissingCountry: 0, promoted: 0, alreadyPromoted: 0, confirmed: 0, alreadyConfirmed: 0, officialEvidenceCreated: 0, processorEvidenceCreated: 0 };

  for (const candidate of candidates) {
    const relations = await db
      .select({ sourceRecordId: candidateSourceRecords.sourceRecordId, relationship: candidateSourceRecords.relationship, rawPayload: sourceRecords.rawPayload })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, candidate.id))
      .orderBy(asc(candidateSourceRecords.sourceRecordId));
    const origin = relations.find((row) => row.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload.reviewSeed);
    const element = record(originPayload.element);
    const tags = stringMap(element.tags);
    const paymentTags = stringMap(seed.paymentTags);
    const name = typeof seed.name === 'string' ? seed.name.trim() : '';
    const latitude = typeof seed.latitude === 'number' ? seed.latitude : null;
    const longitude = typeof seed.longitude === 'number' ? seed.longitude : null;
    const osmType = String(element.type ?? '');
    const osmId = element.id;
    const lightningTagged = ['yes','only'].includes((paymentTags['payment:lightning'] ?? '').toLowerCase());
    if (!origin || !name || latitude === null || longitude === null || !['node','way','relation'].includes(osmType) || typeof osmId !== 'number' || !Number.isSafeInteger(osmId) || !lightningTagged) {
      counters.skippedMissingOrigin += 1;
      continue;
    }
    const cc = countryCode(relations, tags);
    if (cc !== 'US') {
      counters.skippedMissingCountry += 1;
      continue;
    }
    counters.verifiedLightningCandidates += 1;

    await db.insert(candidateSourceRecords).values([
      { candidateId: candidate.id, sourceRecordId: merchantRecord.id, relationship: 'supporting' },
      { candidateId: candidate.id, sourceRecordId: processorRecord.id, relationship: 'supporting' },
    ]).onConflictDoNothing();

    const officialEvidenceId = await deterministicUuid(`steaknshake:official-terms:evidence:${candidate.id}`);
    const processorEvidenceId = await deterministicUuid(`steaknshake:speed:evidence:${candidate.id}`);
    const existingOfficial = (await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, officialEvidenceId)).limit(1))[0];
    if (!existingOfficial) {
      await db.insert(evidence).values({
        id: officialEvidenceId,
        sourceRecordId: merchantRecord.id,
        evidenceKind: 'official_payment_page',
        evidenceClass: 'a',
        sourceType: 'official_page',
        originRole: 'merchant_side',
        polarity: 'supporting',
        sourceName: 'Steak n Shake Terms of Use',
        sourceUrl: TERMS_URL,
        observedAt: terms.fetchedAt,
        fetchedAt: terms.fetchedAt,
        summary: 'Steak n Shake official Terms state that customers may pay for certain in-store or drive-through orders using Bitcoin by scanning a QR code.',
        visibility: 'private',
        reviewStatus: 'pending',
      });
      counters.officialEvidenceCreated += 1;
    }
    const existingProcessor = (await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, processorEvidenceId)).limit(1))[0];
    if (!existingProcessor) {
      await db.insert(evidence).values({
        id: processorEvidenceId,
        sourceRecordId: processorRecord.id,
        evidenceKind: 'processor_case_study',
        evidenceClass: 'b',
        sourceType: 'processor',
        originRole: 'processor_side',
        polarity: 'supporting',
        sourceName: 'Speed Steak n Shake case study',
        sourceUrl: SPEED_URL,
        observedAt: speed.fetchedAt,
        fetchedAt: speed.fetchedAt,
        summary: 'Speed states that Bitcoin Lightning payments were deployed across all 393 U.S. Steak n Shake locations.',
        visibility: 'private',
        reviewStatus: 'pending',
        independenceKey: 'processor:tryspeed.com',
      });
      counters.processorEvidenceCreated += 1;
    }

    let claimId: string;
    if (candidate.status === 'promoted') {
      const [existingPromotion] = await db.select({ claimId: candidatePromotionDecisions.claimId }).from(candidatePromotionDecisions).where(eq(candidatePromotionDecisions.candidateId, candidate.id)).limit(1);
      if (!existingPromotion) throw new Error('Promoted Candidate is missing its promotion decision.');
      claimId = existingPromotion.claimId;
      counters.alreadyPromoted += 1;
    } else {
      if (candidate.canonicalEntityId || candidate.canonicalLocationId) throw new Error('Unpromoted Candidate has canonical links.');
      const entityId = await deterministicUuid(`steaknshake:entity:${candidate.id}`);
      const locationId = await deterministicUuid(`steaknshake:location:${candidate.id}`);
      claimId = await deterministicUuid(`steaknshake:claim:${candidate.id}`);
      const claimAssetId = await deterministicUuid(`steaknshake:claim-asset:${candidate.id}:lightning`);
      const requestId = await deterministicUuid(`steaknshake:promotion:${candidate.id}`);
      const promotedAt = new Date(Math.max(Date.now(), candidate.updatedAt.getTime() + 1_000));
      const context = authorizeCandidatePromotion(reviewer, promotionPolicy, requestId);
      const receipt = await createCandidatePromotionService(createDrizzleCandidatePromotionBackend(db)).promote(context, {
        candidateId: candidate.id,
        expectedCandidateType: 'physical_place',
        expectedCandidateUpdatedAt: candidate.updatedAt.toISOString(),
        promotedAt: promotedAt.toISOString(),
        entity: { id: entityId, value: { entityType: 'merchant', name, slug: null, legalName: null, websiteUrl: 'https://www.steaknshake.com/', countryCode: 'US', entityStatus: 'active', visibility: 'hidden' } },
        location: { id: locationId, value: { name, slug: `osm-${osmType}-${String(osmId)}`.slice(0,64), addressLine: null, locality: null, region: null, postalCode: null, countryCode: 'US', latitude, longitude, locationStatus: 'active', visibility: 'hidden', websiteUrl: 'https://www.steaknshake.com/', phone: typeof seed.phone === 'string' && seed.phone.trim() ? seed.phone.trim() : null, description: null, openingHours: tags.opening_hours?.trim() || null, amenities: [], socialLinks: [], osmType: osmType as 'node'|'way'|'relation', osmId } },
        claim: { id: claimId, value: { entityId, locationId, claimScope: 'location_specific', routeType: 'direct_wallet', acceptanceScope: 'all_checkout', claimStatus: 'candidate', visibility: 'hidden', customerPaysCrypto: true, merchantExplicitlyAcceptsCrypto: true, processorId: null, howToPay: 'At checkout, choose Bitcoin and scan the displayed QR code with a compatible Lightning-enabled Bitcoin wallet.', instructionsLanguage: 'en', merchantReceives: 'not_publicly_confirmed', restrictions: 'Availability is subject to Steak n Shake terms and applicable law.', firstConfirmedAt: null, lastConfirmedAt: null, nextReviewAt: null, endedAt: null, endedReason: null } },
        claimAssets: [{ id: claimAssetId, value: { claimId, assetId: bitcoin.id, networkId: lightning.id, paymentMethodId: lightningInvoice.id, contractAddress: null, isPrimary: true, notes: null } }],
        sourceRecordIds: [...new Set([...relations.map((row) => row.sourceRecordId), merchantRecord.id, processorRecord.id])],
      });
      if (receipt.state === 'committed') counters.promoted += 1;
    }

    const [claim] = await db.select({ id: acceptanceClaims.id, claimStatus: acceptanceClaims.claimStatus, visibility: acceptanceClaims.visibility, updatedAt: acceptanceClaims.updatedAt }).from(acceptanceClaims).where(eq(acceptanceClaims.id, claimId)).limit(1);
    if (!claim) throw new Error('Promoted claim missing.');
    if (claim.claimStatus === 'confirmed') {
      counters.alreadyConfirmed += 1;
      continue;
    }

    const [officialRow] = await db.select({ claimId: evidence.claimId, reviewStatus: evidence.reviewStatus, visibility: evidence.visibility, updatedAt: evidence.updatedAt }).from(evidence).where(eq(evidence.id, officialEvidenceId)).limit(1);
    if (!officialRow) throw new Error('Official Evidence missing.');
    let evidenceUpdatedAt = officialRow.updatedAt;
    if (officialRow.claimId === null) {
      const bindAt = new Date(Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, officialRow.updatedAt.getTime() + 1_000));
      const [bound] = await db.update(evidence).set({ claimId, updatedAt: bindAt }).where(and(eq(evidence.id, officialEvidenceId), isNull(evidence.claimId))).returning({ updatedAt: evidence.updatedAt });
      if (!bound) throw new Error('Failed to bind official Evidence.');
      evidenceUpdatedAt = bound.updatedAt;
    }
    await db.update(evidence).set({ claimId }).where(and(eq(evidence.id, processorEvidenceId), isNull(evidence.claimId)));

    const acceptedRows = await db.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.claimId, claimId), eq(evidence.reviewStatus, 'accepted'))).orderBy(asc(evidence.id));
    const assetRows = await db.select({ id: claimAssets.id }).from(claimAssets).where(eq(claimAssets.claimId, claimId)).orderBy(asc(claimAssets.id));
    const decidedAt = new Date(Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, evidenceUpdatedAt.getTime() + 1_000));
    const nextReviewAt = new Date(decidedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
    const requestId = await deterministicUuid(`steaknshake:evidence-review:${candidate.id}`);
    const context = authorizeEvidenceReview(reviewer, evidencePolicy, requestId);
    const receipt = await createEvidenceReviewDecisionService(createDrizzleEvidenceReviewBackend(db)).decide(context, {
      evidenceId: officialEvidenceId,
      claimId,
      expectedEvidenceUpdatedAt: evidenceUpdatedAt.toISOString(),
      expectedEvidenceReviewStatus: 'pending',
      expectedClaimUpdatedAt: claim.updatedAt.toISOString(),
      expectedClaimStatus: 'candidate',
      expectedClaimVisibility: 'hidden',
      expectedAcceptedEvidenceIds: acceptedRows.map((row) => row.id),
      expectedClaimAssetIds: assetRows.map((row) => row.id),
      decidedAt: decidedAt.toISOString(),
      disposition: 'accepted',
      finding: 'supports_claim',
      claimAction: 'confirm',
      reasonCode: 'official_payment_page_verified',
      publicSummary: null,
      internalNote: 'Confirmed from current Steak n Shake official Bitcoin payment Terms, current Speed all-U.S.-locations Lightning case study, and location-specific OSM Lightning tag.',
      nextReviewAt: nextReviewAt.toISOString(),
      endedReason: null,
    });
    if (receipt.state === 'committed' && receipt.claimStatus === 'confirmed') counters.confirmed += 1;
  }

  console.log(JSON.stringify({
    target: TARGET,
    merchant: 'Steak n Shake',
    officialTermsReverified: true,
    processorAllLocationsLightningReverified: true,
    maxTargets: MAX_TARGETS,
    ...counters,
    automaticPublicVisibility: false,
    candidatePayloadExposed: false,
  }));
}

await main();
