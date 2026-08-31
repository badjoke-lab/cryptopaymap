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
  networks,
  paymentMethods,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const DEFAULT_MAX_TARGETS = 50;
const HARD_MAX_TARGETS = 100;
const MAX_BATCH_IDS = 50;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_CHARS = 750_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

type CandidateRow = {
  candidateId: string;
  candidateType: string;
  candidateStatus: string;
  duplicateGroupId: string | null;
  canonicalEntityId: string | null;
  canonicalLocationId: string | null;
  updatedAt: Date;
  evidenceId: string;
  evidenceSourceRecordId: string;
  evidenceSourceUrl: string | null;
  evidenceReviewStatus: string;
  evidenceVisibility: string;
  evidenceClaimId: string | null;
  evidenceUpdatedAt: Date;
};

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

function batchIdsFromEnvironment(): string[] {
  const values = [
    ...new Set(
      (process.env.CPM_OFFICIAL_EVIDENCE_BATCH_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (values.length === 0) throw new Error('CPM_OFFICIAL_EVIDENCE_BATCH_IDS is required.');
  if (values.length > MAX_BATCH_IDS) throw new Error(`At most ${MAX_BATCH_IDS} batch IDs may be reviewed per run.`);
  if (values.some((value) => !UUID_PATTERN.test(value))) {
    throw new Error('Every batch ID must be a UUID.');
  }
  return values;
}

function maxTargetsFromEnvironment(): number {
  const raw = process.env.CPM_OFFICIAL_EVIDENCE_MAX_TARGETS?.trim();
  const value = raw ? Number(raw) : DEFAULT_MAX_TARGETS;
  if (!Number.isInteger(value) || value < 1 || value > HARD_MAX_TARGETS) {
    throw new Error(`CPM_OFFICIAL_EVIDENCE_MAX_TARGETS must be 1-${HARD_MAX_TARGETS}.`);
  }
  return value;
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeHttps(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function sameOfficialDomain(urlValue: string, domainValue: string): boolean {
  try {
    const host = normalizeHost(new URL(urlValue).hostname);
    const domain = normalizeHost(domainValue);
    return Boolean(domain && (host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`)));
  } catch {
    return false;
  }
}

function normalizedPageText(html: string): string {
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

function hasNegatedLightningAcceptance(text: string): boolean {
  return [
    /(?:do not|don't|does not|doesn't|no longer|not|cannot|can't)\s+(?:currently\s+)?(?:accept|support|take|offer)[^.!?]{0,100}(?:bitcoin|btc|lightning|crypto)/i,
    /(?:bitcoin|btc|lightning|crypto)[^.!?]{0,100}(?:not accepted|not supported|unavailable|no longer accepted)/i,
    /(?:ビットコイン|ライトニング|暗号資産|仮想通貨)[^。！？]{0,80}(?:利用できません|対応していません|受け付けていません|終了しました)/i,
  ].some((pattern) => pattern.test(text));
}

function hasPositiveLightningAcceptance(text: string): boolean {
  if (hasNegatedLightningAcceptance(text)) return false;
  return [
    /(?:accept|accepts|accepted|support|supports|take|takes|offer|offers)[^.!?]{0,100}(?:bitcoin|btc)[^.!?]{0,80}lightning/i,
    /(?:bitcoin|btc)[^.!?]{0,80}lightning[^.!?]{0,100}(?:accept|accepted|payment|pay|checkout)/i,
    /(?:pay|payment|checkout)[^.!?]{0,100}(?:bitcoin|btc)[^.!?]{0,80}lightning/i,
    /(?:lightning)[^.!?]{0,100}(?:invoice|payment|pay|checkout|accepted)/i,
    /(?:ビットコイン|btc)[^。！？]{0,80}ライトニング[^。！？]{0,100}(?:決済|支払|支払い|利用|対応)/i,
    /ライトニング[^。！？]{0,100}(?:決済|支払|支払い|利用|対応)/i,
  ].some((pattern) => pattern.test(text));
}

async function reverifyOfficialEvidence(url: string, officialDomain: string): Promise<boolean> {
  if (!sameOfficialDomain(url, officialDomain)) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'CryptoPayMap-official-payment-review/1.0',
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
      },
    });
    if (!response.ok) return false;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return false;
    if (!sameOfficialDomain(response.url, officialDomain)) return false;
    const body = (await response.text()).slice(0, MAX_BODY_CHARS);
    return hasPositiveLightningAcceptance(normalizedPageText(body));
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function countryCodeFromRelations(
  relations: Array<{ relationship: string; rawPayload: unknown }>,
  tags: Record<string, string>,
): string | null {
  const osmCountry = tags['addr:country']?.trim().toUpperCase();
  if (osmCountry && COUNTRY_CODE_PATTERN.test(osmCountry)) return osmCountry;
  for (const relation of relations) {
    const payload = record(relation.rawPayload);
    if (payload?.sourceSystem !== 'openstreetmap_nominatim') continue;
    const value = typeof payload.countryCode === 'string' ? payload.countryCode.trim().toUpperCase() : '';
    if (COUNTRY_CODE_PATTERN.test(value)) return value;
  }
  return null;
}

async function loadCandidates(db: ReturnType<typeof createDatabase>, batchIds: string[]): Promise<CandidateRow[]> {
  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      updatedAt: sourceCandidates.updatedAt,
      evidenceId: evidence.id,
      evidenceSourceRecordId: evidence.sourceRecordId,
      evidenceSourceUrl: evidence.sourceUrl,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceClaimId: evidence.claimId,
      evidenceUpdatedAt: evidence.updatedAt,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, batchIds),
        eq(sourceCandidates.candidateType, 'physical_place'),
        isNull(sourceCandidates.duplicateGroupId),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged', 'promoted']),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.originRole, 'merchant_side'),
        eq(evidence.polarity, 'supporting'),
        eq(evidence.visibility, 'private'),
        inArray(evidence.reviewStatus, ['pending', 'accepted']),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));
  const unique = new Map<string, CandidateRow>();
  for (const row of rows) if (!unique.has(row.candidateId)) unique.set(row.candidateId, row as CandidateRow);
  return [...unique.values()];
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing batch promotion/confirmation outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const batchIds = batchIdsFromEnvironment();
  const maxTargets = maxTargetsFromEnvironment();
  const db = createDatabase(databaseUrl);

  const promotionPolicy = readCandidatePromotionAuthorizationPolicy({
    CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: process.env.CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS,
  });
  const evidencePolicy = readEvidenceReviewAuthorizationPolicy({
    CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: process.env.CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS,
  });
  const reviewer = createDerivedStagingServiceIdentity('reviewer');
  const promotionAuthorized = promotionPolicy.configured && promotionPolicy.allowedSubjects.has(reviewer.subject);
  const evidenceReviewAuthorized = evidencePolicy.configured && evidencePolicy.allowedSubjects.has(reviewer.subject);
  if (!promotionAuthorized || !evidenceReviewAuthorized) {
    throw new Error('The staging reviewer is not authorized for both Candidate promotion and Evidence review.');
  }

  const [[bitcoin], [lightning], [lightningInvoice]] = await Promise.all([
    db.select({ id: assets.id }).from(assets).where(and(eq(assets.slug, 'bitcoin'), eq(assets.status, 'active'))).limit(1),
    db.select({ id: networks.id }).from(networks).where(and(eq(networks.slug, 'lightning'), eq(networks.status, 'active'))).limit(1),
    db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.slug, 'lightning_invoice'), eq(paymentMethods.status, 'active'))).limit(1),
  ]);
  if (!bitcoin || !lightning || !lightningInvoice) {
    throw new Error('BTC / Lightning / lightning_invoice staging registry is not ready.');
  }

  const candidates = await loadCandidates(db, batchIds);
  const counters = {
    candidatesBeforeLimit: candidates.length,
    considered: 0,
    skippedMissingOrigin: 0,
    skippedNotLightningTagged: 0,
    skippedMissingCountry: 0,
    skippedOfficialReverification: 0,
    promoted: 0,
    alreadyPromoted: 0,
    confirmed: 0,
    alreadyConfirmed: 0,
  };

  for (const candidate of candidates.slice(0, maxTargets)) {
    counters.considered += 1;
    const relations = await db
      .select({
        sourceRecordId: candidateSourceRecords.sourceRecordId,
        relationship: candidateSourceRecords.relationship,
        rawPayload: sourceRecords.rawPayload,
        officialDomain: sourceRecords.officialDomain,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, candidate.candidateId))
      .orderBy(asc(candidateSourceRecords.sourceRecordId));
    const origin = relations.find((row) => row.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload?.reviewSeed);
    const element = record(originPayload?.element);
    const tags = stringMap(element?.tags);
    const paymentTags = stringMap(seed?.paymentTags);
    const name = typeof seed?.name === 'string' ? seed.name.trim() : '';
    const latitude = typeof seed?.latitude === 'number' ? seed.latitude : null;
    const longitude = typeof seed?.longitude === 'number' ? seed.longitude : null;
    const osmType = element?.type;
    const osmId = element?.id;
    const originDomain = origin?.officialDomain?.trim() ?? '';
    const evidenceUrl = safeHttps(candidate.evidenceSourceUrl);
    const lightningTagged = ['yes', 'only'].includes((paymentTags['payment:lightning'] ?? '').toLowerCase());
    if (
      !name ||
      latitude === null ||
      longitude === null ||
      !['node', 'way', 'relation'].includes(String(osmType)) ||
      typeof osmId !== 'number' ||
      !Number.isSafeInteger(osmId) ||
      !originDomain ||
      !evidenceUrl
    ) {
      counters.skippedMissingOrigin += 1;
      continue;
    }
    if (!lightningTagged) {
      counters.skippedNotLightningTagged += 1;
      continue;
    }
    const countryCode = countryCodeFromRelations(relations, tags);
    if (!countryCode) {
      counters.skippedMissingCountry += 1;
      continue;
    }
    if (!(await reverifyOfficialEvidence(evidenceUrl, originDomain))) {
      counters.skippedOfficialReverification += 1;
      continue;
    }

    let claimId: string;
    if (candidate.candidateStatus === 'promoted') {
      const [existingPromotion] = await db
        .select({ claimId: candidatePromotionDecisions.claimId })
        .from(candidatePromotionDecisions)
        .where(eq(candidatePromotionDecisions.candidateId, candidate.candidateId))
        .limit(1);
      if (!existingPromotion) throw new Error('Promoted Candidate is missing its promotion decision.');
      claimId = existingPromotion.claimId;
      counters.alreadyPromoted += 1;
    } else {
      if (candidate.canonicalEntityId !== null || candidate.canonicalLocationId !== null) {
        throw new Error('Unpromoted Candidate has unexpected canonical links.');
      }
      const requestId = await deterministicUuid(`official-evidence-batch:promotion:${candidate.candidateId}`);
      const entityId = await deterministicUuid(`official-evidence-batch:entity:${candidate.candidateId}`);
      const locationId = await deterministicUuid(`official-evidence-batch:location:${candidate.candidateId}`);
      claimId = await deterministicUuid(`official-evidence-batch:claim:${candidate.candidateId}`);
      const claimAssetId = await deterministicUuid(`official-evidence-batch:claim-asset:${candidate.candidateId}`);
      const promotedAt = new Date(Math.max(Date.now(), candidate.updatedAt.getTime() + 1_000));
      const websiteUrl = safeHttps(seed?.websiteUrl);
      const phone = typeof seed?.phone === 'string' && seed.phone.trim().length > 0 ? seed.phone.trim() : null;
      const sourceRecordIds = relations.map((row) => row.sourceRecordId);
      const context = authorizeCandidatePromotion(reviewer, promotionPolicy, requestId);
      const receipt = await createCandidatePromotionService(createDrizzleCandidatePromotionBackend(db)).promote(context, {
        candidateId: candidate.candidateId,
        expectedCandidateType: 'physical_place',
        expectedCandidateUpdatedAt: candidate.updatedAt.toISOString(),
        promotedAt: promotedAt.toISOString(),
        entity: {
          id: entityId,
          value: {
            entityType: 'merchant',
            name,
            slug: null,
            legalName: null,
            websiteUrl,
            countryCode,
            entityStatus: 'active',
            visibility: 'hidden',
          },
        },
        location: {
          id: locationId,
          value: {
            name,
            slug: `osm-${String(osmType)}-${String(osmId)}`.slice(0, 64),
            addressLine: null,
            locality: null,
            region: null,
            postalCode: null,
            countryCode,
            latitude,
            longitude,
            locationStatus: 'active',
            visibility: 'hidden',
            websiteUrl,
            phone,
            description: null,
            openingHours: tags.opening_hours?.trim() || null,
            amenities: [],
            socialLinks: [],
            osmType: osmType as 'node' | 'way' | 'relation',
            osmId,
          },
        },
        claim: {
          id: claimId,
          value: {
            entityId,
            locationId,
            claimScope: 'location_specific',
            routeType: 'direct_wallet',
            acceptanceScope: 'all_checkout',
            claimStatus: 'candidate',
            visibility: 'hidden',
            customerPaysCrypto: true,
            merchantExplicitlyAcceptsCrypto: true,
            processorId: null,
            howToPay: "Pay with Bitcoin over the Lightning Network using the merchant's Lightning payment option.",
            instructionsLanguage: 'en',
            merchantReceives: 'not_publicly_confirmed',
            restrictions: null,
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
              notes: null,
            },
          },
        ],
        sourceRecordIds,
      });
      if (receipt.state === 'committed') counters.promoted += 1;
    }

    const [claim] = await db
      .select({
        id: acceptanceClaims.id,
        claimStatus: acceptanceClaims.claimStatus,
        visibility: acceptanceClaims.visibility,
        updatedAt: acceptanceClaims.updatedAt,
      })
      .from(acceptanceClaims)
      .where(eq(acceptanceClaims.id, claimId))
      .limit(1);
    if (!claim) throw new Error('Promoted Claim is missing.');
    const [freshEvidence] = await db
      .select({
        claimId: evidence.claimId,
        reviewStatus: evidence.reviewStatus,
        visibility: evidence.visibility,
        updatedAt: evidence.updatedAt,
      })
      .from(evidence)
      .where(eq(evidence.id, candidate.evidenceId))
      .limit(1);
    if (!freshEvidence) throw new Error('Official Evidence disappeared during batch review.');
    if (claim.claimStatus === 'confirmed' && freshEvidence.reviewStatus === 'accepted') {
      counters.alreadyConfirmed += 1;
      continue;
    }
    if (claim.claimStatus !== 'candidate' || claim.visibility !== 'hidden') {
      throw new Error('Claim is not a hidden candidate Claim before confirmation.');
    }
    if (freshEvidence.reviewStatus !== 'pending' || freshEvidence.visibility !== 'private') {
      throw new Error('Evidence is not pending/private before confirmation.');
    }

    let evidenceUpdatedAt = freshEvidence.updatedAt;
    if (freshEvidence.claimId === null) {
      const bindAt = new Date(Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, freshEvidence.updatedAt.getTime() + 1_000));
      const [bound] = await db
        .update(evidence)
        .set({ claimId: claim.id, updatedAt: bindAt })
        .where(and(eq(evidence.id, candidate.evidenceId), eq(evidence.reviewStatus, 'pending'), isNull(evidence.claimId)))
        .returning({ claimId: evidence.claimId, updatedAt: evidence.updatedAt });
      if (!bound || bound.claimId !== claim.id) throw new Error('Failed to bind official Evidence to promoted Claim.');
      evidenceUpdatedAt = bound.updatedAt;
    } else if (freshEvidence.claimId !== claim.id) {
      throw new Error('Official Evidence is bound to a different Claim.');
    }

    const acceptedRows = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.claimId, claim.id), eq(evidence.reviewStatus, 'accepted')))
      .orderBy(asc(evidence.id));
    const assetRows = await db
      .select({ id: claimAssets.id })
      .from(claimAssets)
      .where(eq(claimAssets.claimId, claim.id))
      .orderBy(asc(claimAssets.id));
    if (assetRows.length !== 1) throw new Error('Batch Claim must have exactly one payment combination.');
    const decidedAt = new Date(Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, evidenceUpdatedAt.getTime() + 1_000));
    const nextReviewAt = new Date(decidedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
    const requestId = await deterministicUuid(`official-evidence-batch:review:${candidate.candidateId}`);
    const context = authorizeEvidenceReview(reviewer, evidencePolicy, requestId);
    const receipt = await createEvidenceReviewDecisionService(createDrizzleEvidenceReviewBackend(db)).decide(context, {
      evidenceId: candidate.evidenceId,
      claimId: claim.id,
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
      internalNote: 'Fixed-review staging batch confirmation from reverified official merchant Lightning payment Evidence.',
      nextReviewAt: nextReviewAt.toISOString(),
      endedReason: null,
    });
    if (receipt.state === 'committed' && receipt.claimStatus === 'confirmed') counters.confirmed += 1;
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchIds,
      maxTargets,
      evidenceKind: 'official_payment_page',
      paymentRail: 'BTC/Lightning',
      strictOfficialReverification: true,
      ...counters,
      automaticPublicVisibility: false,
      candidatePayloadExposed: false,
    }),
  );
}

await main();
