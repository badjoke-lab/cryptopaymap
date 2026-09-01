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
  networks,
  paymentMethods,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const BITPAY_SOURCE_NAME = 'BitPay Merchant Directory';
const MAX_TARGETS = 50;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_CHARS = 800_000;

type CandidateRow = {
  candidateId: string;
  normalizedName: string;
  candidateStatus: string;
  duplicateGroupId: string | null;
  canonicalEntityId: string | null;
  canonicalLocationId: string | null;
  updatedAt: Date;
  evidenceId: string;
  evidenceSourceRecordId: string;
  evidenceSourceUrl: string | null;
  evidenceUpdatedAt: Date;
  evidenceReviewStatus: string;
  evidenceClaimId: string | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function publicSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return normalized || 'online-service';
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)),
  ).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x40;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function fetchText(url: string): Promise<{ url: string; text: string } | null> {
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
    const html = (await response.text()).slice(0, MAX_BODY_CHARS);
    return {
      url: response.url,
      text: html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase(),
    };
  } catch {
    return null;
  }
}

function merchantAcceptance(text: string): boolean {
  const negated = [
    /(?:do not|don't|does not|doesn't|no longer|not|cannot|can't)\s+(?:currently\s+)?(?:accept|support|take|offer)[^.!?]{0,120}(?:bitcoin|btc|cryptocurrency|crypto|bitpay)/i,
    /(?:bitcoin|btc|cryptocurrency|crypto|bitpay)[^.!?]{0,120}(?:not accepted|not supported|unavailable|no longer accepted)/i,
  ].some((pattern) => pattern.test(text));
  if (negated) return false;
  return [
    /(?:accept|accepts|accepted|support|supports|take|takes|offer|offers)[^.!?]{0,140}(?:bitcoin|btc|cryptocurrency|crypto)/i,
    /(?:bitcoin|btc|cryptocurrency|crypto)[^.!?]{0,140}(?:accept|accepted|payment|pay|checkout)/i,
    /(?:pay|payment|checkout)[^.!?]{0,140}(?:bitcoin|btc|cryptocurrency|crypto)/i,
    /(?:choose|select|use)[^.!?]{0,100}bitpay[^.!?]{0,100}(?:checkout|payment|pay)/i,
    /bitpay[^.!?]{0,120}(?:checkout|payment|pay|invoice)/i,
  ].some((pattern) => pattern.test(text));
}

function bitpayPayDirect(text: string): boolean {
  return /pay direct/i.test(text) && /(?:bitcoin|crypto|cryptocurrency|wallet|checkout|payment)/i.test(text);
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing online promotion outside ${TARGET}.`);
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
  if (
    !promotionPolicy.configured ||
    !promotionPolicy.allowedSubjects.has(reviewer.subject) ||
    !evidencePolicy.configured ||
    !evidencePolicy.allowedSubjects.has(reviewer.subject)
  ) {
    throw new Error('The staging reviewer is not authorized for online promotion and Evidence review.');
  }

  const [bitpaySource] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.sourceType, 'processor'), eq(sources.name, BITPAY_SOURCE_NAME)))
    .limit(1);
  if (!bitpaySource) throw new Error('BitPay processor source is missing.');

  const [[bitcoin], [bitcoinNetwork], [processorCheckout]] = await Promise.all([
    db.select({ id: assets.id }).from(assets).where(and(eq(assets.slug, 'bitcoin'), eq(assets.status, 'active'))).limit(1),
    db.select({ id: networks.id }).from(networks).where(and(eq(networks.slug, 'bitcoin'), eq(networks.status, 'active'))).limit(1),
    db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.slug, 'processor_checkout'), eq(paymentMethods.status, 'active'))).limit(1),
  ]);
  if (!bitcoin || !bitcoinNetwork || !processorCheckout) {
    throw new Error('Bitcoin processor-checkout registries are not ready.');
  }

  let [bitpayEntity] = await db
    .select({ id: entities.id, slug: entities.slug })
    .from(entities)
    .where(and(eq(entities.entityType, 'payment_processor'), eq(entities.slug, 'bitpay')))
    .limit(1);
  if (!bitpayEntity) {
    const id = await deterministicUuid('canonical-payment-processor:bitpay');
    [bitpayEntity] = await db
      .insert(entities)
      .values({
        id,
        entityType: 'payment_processor',
        name: 'BitPay',
        slug: 'bitpay',
        legalName: null,
        websiteUrl: 'https://www.bitpay.com/',
        countryCode: null,
        entityStatus: 'active',
        visibility: 'hidden',
      })
      .returning({ id: entities.id, slug: entities.slug });
  }
  if (!bitpayEntity?.id || bitpayEntity.slug !== 'bitpay') throw new Error('Failed to resolve BitPay canonical processor.');

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      normalizedName: sourceCandidates.normalizedName,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      updatedAt: sourceCandidates.updatedAt,
      evidenceId: evidence.id,
      evidenceSourceRecordId: evidence.sourceRecordId,
      evidenceSourceUrl: evidence.sourceUrl,
      evidenceUpdatedAt: evidence.updatedAt,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceClaimId: evidence.claimId,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'online_service'),
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

  const candidates = [...new Map(rows.map((row) => [row.candidateId, row as CandidateRow])).values()].slice(0, MAX_TARGETS);
  const counters = {
    candidatesBeforeLimit: rows.length,
    considered: 0,
    skippedMissingOrigin: 0,
    skippedFirstPartyReverification: 0,
    skippedBitPayReverification: 0,
    skippedSlugCollision: 0,
    promoted: 0,
    alreadyPromoted: 0,
    confirmed: 0,
    alreadyConfirmed: 0,
  };

  for (const candidate of candidates) {
    counters.considered += 1;
    const relations = await db
      .select({
        sourceRecordId: candidateSourceRecords.sourceRecordId,
        relationship: candidateSourceRecords.relationship,
        sourceId: sourceRecords.sourceId,
        sourceUrl: sourceRecords.sourceUrl,
        rawPayload: sourceRecords.rawPayload,
        officialDomain: sourceRecords.officialDomain,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, candidate.candidateId))
      .orderBy(asc(candidateSourceRecords.sourceRecordId));
    const origin = relations.find((row) => row.relationship === 'origin' && row.sourceId === bitpaySource.id);
    const supporting = relations.find((row) => row.sourceRecordId === candidate.evidenceSourceRecordId);
    const originSeed = object(object(origin?.rawPayload)?.reviewSeed);
    const name = typeof originSeed?.name === 'string' ? originSeed.name.trim() : '';
    const officialDomain = supporting?.officialDomain ? normalizeHost(supporting.officialDomain) : '';
    const evidenceUrl = candidate.evidenceSourceUrl?.trim() ?? '';
    const bitpayUrl = origin?.sourceUrl?.trim() ?? '';
    if (!name || !officialDomain || !evidenceUrl || !bitpayUrl) {
      counters.skippedMissingOrigin += 1;
      continue;
    }

    const firstParty = await fetchText(evidenceUrl);
    if (!firstParty || normalizeHost(new URL(firstParty.url).hostname) !== officialDomain || !merchantAcceptance(firstParty.text)) {
      counters.skippedFirstPartyReverification += 1;
      continue;
    }
    const bitpay = await fetchText(bitpayUrl);
    if (!bitpay || normalizeHost(new URL(bitpay.url).hostname) !== 'bitpay.com' || !bitpayPayDirect(bitpay.text)) {
      counters.skippedBitPayReverification += 1;
      continue;
    }

    const serviceSlug = publicSlug(officialDomain);
    let claimId: string;
    if (candidate.candidateStatus === 'promoted') {
      const [promotion] = await db
        .select({ claimId: candidatePromotionDecisions.claimId })
        .from(candidatePromotionDecisions)
        .where(eq(candidatePromotionDecisions.candidateId, candidate.candidateId))
        .limit(1);
      if (!promotion) throw new Error('Promoted online Candidate is missing its promotion decision.');
      claimId = promotion.claimId;
      counters.alreadyPromoted += 1;
    } else {
      if (candidate.canonicalEntityId !== null || candidate.canonicalLocationId !== null) {
        throw new Error('Unpromoted online Candidate has unexpected canonical links.');
      }
      const [slugOwner] = await db.select({ id: entities.id }).from(entities).where(eq(entities.slug, serviceSlug)).limit(1);
      if (slugOwner) {
        counters.skippedSlugCollision += 1;
        continue;
      }
      const requestId = await deterministicUuid(`online-official-evidence:promotion:${candidate.candidateId}`);
      const entityId = await deterministicUuid(`online-official-evidence:entity:${candidate.candidateId}`);
      claimId = await deterministicUuid(`online-official-evidence:claim:${candidate.candidateId}`);
      const claimAssetId = await deterministicUuid(`online-official-evidence:claim-asset:${candidate.candidateId}`);
      const promotedAt = new Date(Math.max(Date.now(), candidate.updatedAt.getTime() + 1_000));
      const sourceRecordIds = relations.map((row) => row.sourceRecordId);
      const context = authorizeCandidatePromotion(reviewer, promotionPolicy, requestId);
      const receipt = await createCandidatePromotionService(createDrizzleCandidatePromotionBackend(db)).promote(context, {
        candidateId: candidate.candidateId,
        expectedCandidateType: 'online_service',
        expectedCandidateUpdatedAt: candidate.updatedAt.toISOString(),
        promotedAt: promotedAt.toISOString(),
        entity: {
          id: entityId,
          value: {
            entityType: 'online_service',
            name,
            slug: serviceSlug,
            legalName: null,
            websiteUrl: `https://${officialDomain}/`,
            countryCode: null,
            entityStatus: 'active',
            visibility: 'hidden',
          },
        },
        location: null,
        claim: {
          id: claimId,
          value: {
            entityId,
            locationId: null,
            claimScope: 'online_service',
            routeType: 'processor_checkout',
            acceptanceScope: 'all_checkout',
            claimStatus: 'candidate',
            visibility: 'hidden',
            customerPaysCrypto: true,
            merchantExplicitlyAcceptsCrypto: true,
            processorId: bitpayEntity.id,
            howToPay: 'Choose BitPay at the merchant checkout, open the BitPay invoice, and complete the cryptocurrency payment from a compatible wallet.',
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
        claimAssets: [{
          id: claimAssetId,
          value: {
            claimId,
            assetId: bitcoin.id,
            networkId: bitcoinNetwork.id,
            paymentMethodId: processorCheckout.id,
            contractAddress: null,
            isPrimary: true,
            notes: 'BitPay Pay Direct processor route; merchant acceptance independently reverified on the merchant first-party site.',
          },
        }],
        sourceRecordIds,
      });
      if (receipt.state === 'committed') counters.promoted += 1;
    }

    const [claim] = await db
      .select({ id: acceptanceClaims.id, claimStatus: acceptanceClaims.claimStatus, visibility: acceptanceClaims.visibility, updatedAt: acceptanceClaims.updatedAt })
      .from(acceptanceClaims)
      .where(eq(acceptanceClaims.id, claimId))
      .limit(1);
    if (!claim) throw new Error('Promoted online Claim is missing.');
    const [freshEvidence] = await db
      .select({ claimId: evidence.claimId, reviewStatus: evidence.reviewStatus, visibility: evidence.visibility, updatedAt: evidence.updatedAt })
      .from(evidence)
      .where(eq(evidence.id, candidate.evidenceId))
      .limit(1);
    if (!freshEvidence) throw new Error('Online first-party Evidence disappeared during review.');
    if (claim.claimStatus === 'confirmed' && freshEvidence.reviewStatus === 'accepted') {
      counters.alreadyConfirmed += 1;
      continue;
    }
    if (claim.claimStatus !== 'candidate' || claim.visibility !== 'hidden') {
      throw new Error('Online Claim is not hidden/candidate before confirmation.');
    }
    if (freshEvidence.reviewStatus !== 'pending' || freshEvidence.visibility !== 'private') {
      throw new Error('Online Evidence is not pending/private before confirmation.');
    }

    let evidenceUpdatedAt = freshEvidence.updatedAt;
    if (freshEvidence.claimId === null) {
      const boundAt = new Date(Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, freshEvidence.updatedAt.getTime() + 1_000));
      const [bound] = await db
        .update(evidence)
        .set({ claimId: claim.id, updatedAt: boundAt })
        .where(and(eq(evidence.id, candidate.evidenceId), eq(evidence.reviewStatus, 'pending'), isNull(evidence.claimId)))
        .returning({ claimId: evidence.claimId, updatedAt: evidence.updatedAt });
      if (!bound || bound.claimId !== claim.id) throw new Error('Failed to bind online Evidence to Claim.');
      evidenceUpdatedAt = bound.updatedAt;
    } else if (freshEvidence.claimId !== claim.id) {
      throw new Error('Online Evidence is bound to a different Claim.');
    }

    const acceptedRows = await db.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.claimId, claim.id), eq(evidence.reviewStatus, 'accepted'))).orderBy(asc(evidence.id));
    const assetRows = await db.select({ id: claimAssets.id }).from(claimAssets).where(eq(claimAssets.claimId, claim.id)).orderBy(asc(claimAssets.id));
    if (assetRows.length !== 1) throw new Error('Online Claim must have exactly one payment combination in this batch.');
    const decidedAt = new Date(Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, evidenceUpdatedAt.getTime() + 1_000));
    const nextReviewAt = new Date(decidedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
    const requestId = await deterministicUuid(`online-official-evidence:review:${candidate.candidateId}`);
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
      internalNote: 'Fixed-review staging online confirmation from reverified merchant first-party payment Evidence plus current BitPay Pay Direct processor listing.',
      nextReviewAt: nextReviewAt.toISOString(),
      endedReason: null,
    });
    if (receipt.state === 'committed' && receipt.claimStatus === 'confirmed') counters.confirmed += 1;
  }

  console.log(JSON.stringify({
    target: TARGET,
    evidenceClass: 'a',
    evidenceKind: 'official_payment_page',
    routeType: 'processor_checkout',
    processor: 'bitpay',
    ...counters,
    automaticPublicVisibility: false,
    candidatePayloadExposed: false,
  }));
}

await main();
