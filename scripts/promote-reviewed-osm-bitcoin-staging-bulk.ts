import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createEvidenceReviewDecisionService } from '../src/admin/evidence-review/decision';
import { createDrizzleEvidenceReviewBackend } from '../src/admin/evidence-review/drizzle-backend';
import { createCandidatePromotionService } from '../src/admin/promotion/candidate-promotion';
import { createDrizzleCandidatePromotionBackend } from '../src/admin/promotion/drizzle-candidate-promotion-backend';
import { createDrizzlePromotionRegistryBackend } from '../src/admin/promotion/drizzle-promotion-registry-backend';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const MAX_BATCH = 500;
const REVIEW_DAYS = 90;
const ACTOR_ID = 'bounded-osm-official-a2-reviewer';

type JsonRecord = Record<string, unknown>;

type CandidateRow = {
  candidateId: string;
  candidateUpdatedAt: Date;
  evidenceId: string;
  evidenceSourceUrl: string;
  evidenceObservedAt: Date | null;
  evidenceContentHash: string | null;
  evidenceRawPayload: unknown;
  originOfficialDomain: string | null;
  originRawPayload: unknown;
};

function object(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const row = object(value);
  if (!row) return {};
  return Object.fromEntries(
    Object.entries(row).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function deterministicUuid(label: string): string {
  const bytes = Uint8Array.from(createHash('sha256').update(label).digest().subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function publicSlug(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || 'merchant';
}

function yes(value: string | undefined): boolean {
  return ['yes', 'only', 'accepted'].includes(value?.trim().toLowerCase() ?? '');
}

function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function domain(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function osmCountry(tags: Record<string, string>): string | null {
  const value = tags['addr:country']?.trim().toUpperCase() ?? '';
  return /^[A-Z]{2}$/.test(value) ? value : null;
}

function candidateData(row: CandidateRow, scopedCountryCode: string) {
  const origin = object(row.originRawPayload);
  const element = object(origin?.element);
  const tags = stringMap(element?.tags);
  const reviewSeed = object(origin?.reviewSeed);
  const evidencePayload = object(row.evidenceRawPayload);
  const discovery = typeof evidencePayload?.discovery === 'string' ? evidencePayload.discovery : null;
  const discoveryVersion =
    typeof evidencePayload?.discoveryVersion === 'string' ? evidencePayload.discoveryVersion : null;
  const name = typeof reviewSeed?.name === 'string' ? reviewSeed.name.trim() : '';
  const latitude = typeof reviewSeed?.latitude === 'number' ? reviewSeed.latitude : null;
  const longitude = typeof reviewSeed?.longitude === 'number' ? reviewSeed.longitude : null;
  const osmType = element?.type;
  const osmId = element?.id;
  const taggedCountry = osmCountry(tags);
  const officialDomain = row.originOfficialDomain?.toLowerCase().replace(/^www\./, '') ?? null;
  const evidenceDomain = domain(row.evidenceSourceUrl);

  if (!name || latitude === null || longitude === null) return null;
  if (taggedCountry !== null && taggedCountry !== scopedCountryCode) return null;
  if (!['node', 'way', 'relation'].includes(String(osmType))) return null;
  if (typeof osmId !== 'number' || !Number.isInteger(osmId) || osmId <= 0) return null;
  if (!yes(tags['payment:bitcoin'])) return null;
  if (!officialDomain || evidenceDomain !== officialDomain) return null;
  if (discovery !== 'official_payment_language_same_domain_crawl') return null;
  if (discoveryVersion !== 'official-payment-crawl-v2') return null;
  if (!row.evidenceContentHash || row.evidenceObservedAt === null) return null;

  const website = httpsUrl(tags.website ?? tags['contact:website']);
  return {
    tags,
    name,
    latitude,
    longitude,
    countryCode: scopedCountryCode,
    osmType: osmType as 'node' | 'way' | 'relation',
    osmId,
    locationSlug: publicSlug(`osm-${osmType}-${osmId}`),
    entitySlug: publicSlug(`merchant-osm-${osmType}-${osmId}`),
    website,
    addressLine: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || null,
    locality: tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'] ?? null,
    region: tags['addr:state'] ?? tags['addr:province'] ?? null,
    postalCode: tags['addr:postcode'] ?? null,
    phone: tags.phone ?? tags['contact:phone'] ?? null,
  };
}

function configuredBatchIds(): string[] {
  const ids = (process.env.CPM_BULK_REVIEW_BATCH_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.length < 1 || ids.length > 100) {
    throw new Error('CPM_BULK_REVIEW_BATCH_IDS must contain 1-100 explicit acquisition batch IDs.');
  }
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error('CPM_BULK_REVIEW_BATCH_IDS contains an invalid UUID.');
  }
  return [...new Set(ids)].sort();
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing bounded bulk promotion outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const countryCode = (process.env.CPM_BULK_REVIEW_COUNTRY_CODE ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('CPM_BULK_REVIEW_COUNTRY_CODE must be an explicit ISO alpha-2 country code.');
  }
  const batchIds = configuredBatchIds();
  const requested = Number(process.env.CPM_BULK_REVIEW_LIMIT ?? String(MAX_BATCH));
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_BATCH) {
    throw new Error(`CPM_BULK_REVIEW_LIMIT must be 1-${MAX_BATCH}.`);
  }

  const db = createDatabase(databaseUrl);
  const registry = await createDrizzlePromotionRegistryBackend(db).loadRegistryOptions();
  const bitcoin = registry.assets.find((item) => item.slug === 'bitcoin');
  const bitcoinNetwork = registry.networks.find((item) => item.slug === 'bitcoin');
  const onchain = registry.paymentMethods.find((item) => item.slug === 'onchain');
  if (!bitcoin || !bitcoinNetwork || !onchain) {
    throw new Error('Active bitcoin / bitcoin network / onchain payment registries are required.');
  }

  const originRows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateUpdatedAt: sourceCandidates.updatedAt,
      originOfficialDomain: sourceRecords.officialDomain,
      originRawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, batchIds),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
        eq(sourceCandidates.candidateType, 'physical_place'),
        isNull(sourceCandidates.duplicateGroupId),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    )
    .orderBy(asc(sourceCandidates.id));

  const candidateIds = originRows.map((row) => row.candidateId);
  if (candidateIds.length === 0) {
    console.log(JSON.stringify({ target: EXPECTED_TARGET, acquisitionBatches: batchIds.length, reviewed: 0, promoted: 0, confirmed: 0 }));
    return;
  }

  const supportingRows = await db
    .select({
      candidateId: candidateSourceRecords.candidateId,
      evidenceId: evidence.id,
      evidenceSourceUrl: evidence.sourceUrl,
      evidenceObservedAt: evidence.observedAt,
      evidenceContentHash: evidence.contentHash,
      evidenceRawPayload: sourceRecords.rawPayload,
    })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .innerJoin(evidence, eq(evidence.sourceRecordId, sourceRecords.id))
    .where(
      and(
        inArray(candidateSourceRecords.candidateId, candidateIds),
        eq(candidateSourceRecords.relationship, 'supporting'),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.polarity, 'supporting'),
        eq(evidence.reviewStatus, 'pending'),
        eq(evidence.visibility, 'private'),
      ),
    )
    .orderBy(asc(candidateSourceRecords.candidateId), asc(evidence.id));

  const originByCandidate = new Map(originRows.map((row) => [row.candidateId, row]));
  const firstEvidenceByCandidate = new Map<string, (typeof supportingRows)[number]>();
  for (const row of supportingRows) {
    if (!firstEvidenceByCandidate.has(row.candidateId)) firstEvidenceByCandidate.set(row.candidateId, row);
  }

  const eligible: CandidateRow[] = [];
  for (const [candidateId, support] of firstEvidenceByCandidate) {
    const origin = originByCandidate.get(candidateId);
    if (!origin) continue;
    const row: CandidateRow = { ...origin, ...support };
    if (candidateData(row, countryCode) !== null) eligible.push(row);
  }
  eligible.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const targets = eligible.slice(0, requested);

  const targetIds = targets.map((row) => row.candidateId);
  const sourceLinks = targetIds.length
    ? await db
        .select({ candidateId: candidateSourceRecords.candidateId, sourceRecordId: candidateSourceRecords.sourceRecordId })
        .from(candidateSourceRecords)
        .where(inArray(candidateSourceRecords.candidateId, targetIds))
        .orderBy(asc(candidateSourceRecords.candidateId), asc(candidateSourceRecords.sourceRecordId))
    : [];
  const sourceIdsByCandidate = new Map<string, string[]>();
  for (const row of sourceLinks) {
    const ids = sourceIdsByCandidate.get(row.candidateId) ?? [];
    ids.push(row.sourceRecordId);
    sourceIdsByCandidate.set(row.candidateId, ids);
  }

  const promotionService = createCandidatePromotionService(createDrizzleCandidatePromotionBackend(db));
  const evidenceService = createEvidenceReviewDecisionService(createDrizzleEvidenceReviewBackend(db));
  let promoted = 0;
  let confirmed = 0;
  let failed = 0;

  for (const row of targets) {
    const data = candidateData(row, countryCode);
    if (!data) continue;
    const promotedAt = new Date();
    const entityId = deterministicUuid(`bulk-osm:entity:${row.candidateId}`);
    const locationId = deterministicUuid(`bulk-osm:location:${row.candidateId}`);
    const claimId = deterministicUuid(`bulk-osm:claim:${row.candidateId}`);
    const claimAssetId = deterministicUuid(`bulk-osm:claim-asset:${row.candidateId}:bitcoin:onchain`);
    const promotionRequestId = deterministicUuid(`bulk-osm:promotion:${row.candidateId}`);
    const sourceRecordIds = sourceIdsByCandidate.get(row.candidateId) ?? [];

    try {
      const receipt = await promotionService.promote(
        { requestId: promotionRequestId, actorId: ACTOR_ID, actorType: 'system', capabilities: ['candidate:promote'] },
        {
          candidateId: row.candidateId,
          expectedCandidateType: 'physical_place',
          expectedCandidateUpdatedAt: row.candidateUpdatedAt.toISOString(),
          promotedAt: promotedAt.toISOString(),
          entity: {
            id: entityId,
            value: {
              entityType: 'merchant', name: data.name, slug: data.entitySlug, legalName: null,
              websiteUrl: data.website, countryCode: data.countryCode, entityStatus: 'active', visibility: 'hidden',
            },
          },
          location: {
            id: locationId,
            value: {
              name: data.name, slug: data.locationSlug, addressLine: data.addressLine, locality: data.locality,
              region: data.region, postalCode: data.postalCode, countryCode: data.countryCode,
              latitude: data.latitude, longitude: data.longitude, locationStatus: 'active', visibility: 'hidden',
              websiteUrl: data.website, phone: data.phone, description: null,
              openingHours: data.tags.opening_hours ?? null, amenities: [], socialLinks: [],
              osmType: data.osmType, osmId: data.osmId,
            },
          },
          claim: {
            id: claimId,
            value: {
              entityId, locationId, claimScope: 'location_specific', routeType: 'direct_wallet',
              acceptanceScope: 'all_checkout', claimStatus: 'candidate', visibility: 'hidden',
              customerPaysCrypto: true, merchantExplicitlyAcceptsCrypto: true, processorId: null,
              howToPay: 'Ask to pay with Bitcoin using the merchant’s advertised cryptocurrency payment option.',
              instructionsLanguage: 'en', merchantReceives: 'not_publicly_confirmed', restrictions: null,
              firstConfirmedAt: null, lastConfirmedAt: null, nextReviewAt: null, endedAt: null, endedReason: null,
            },
          },
          claimAssets: [{
            id: claimAssetId,
            value: {
              claimId, assetId: bitcoin.id, networkId: bitcoinNetwork.id, paymentMethodId: onchain.id,
              contractAddress: null, isPrimary: true, notes: null,
            },
          }],
          sourceRecordIds,
        },
      );
      if (receipt.state === 'committed') promoted += 1;

      const evidenceLinkedAt = new Date();
      await db.update(evidence).set({ claimId, updatedAt: evidenceLinkedAt }).where(eq(evidence.id, row.evidenceId));
      const currentRows = await db
        .select({
          claimUpdatedAt: acceptanceClaims.updatedAt,
          claimStatus: acceptanceClaims.claimStatus,
          claimVisibility: acceptanceClaims.visibility,
          evidenceUpdatedAt: evidence.updatedAt,
        })
        .from(acceptanceClaims)
        .innerJoin(evidence, eq(evidence.claimId, acceptanceClaims.id))
        .where(and(eq(acceptanceClaims.id, claimId), eq(evidence.id, row.evidenceId)))
        .limit(1);
      const current = currentRows[0];
      if (!current || current.claimStatus !== 'candidate' || current.claimVisibility !== 'hidden') {
        throw new Error('Promoted claim/evidence state could not be reloaded for review.');
      }

      const decidedAt = new Date(Math.max(Date.now(), current.claimUpdatedAt.getTime(), current.evidenceUpdatedAt.getTime()) + 1);
      const nextReviewAt = new Date(decidedAt.getTime() + REVIEW_DAYS * 24 * 60 * 60 * 1000);
      const review = await evidenceService.decide(
        {
          requestId: deterministicUuid(`bulk-osm:evidence-review:${row.candidateId}`),
          actorId: ACTOR_ID,
          actorType: 'system',
          capabilities: ['evidence:review'],
        },
        {
          evidenceId: row.evidenceId,
          claimId,
          expectedEvidenceUpdatedAt: current.evidenceUpdatedAt.toISOString(),
          expectedEvidenceReviewStatus: 'pending',
          expectedClaimUpdatedAt: current.claimUpdatedAt.toISOString(),
          expectedClaimStatus: 'candidate',
          expectedClaimVisibility: 'hidden',
          expectedAcceptedEvidenceIds: [],
          expectedClaimAssetIds: [claimAssetId],
          decidedAt: decidedAt.toISOString(),
          disposition: 'accepted',
          finding: 'supports_claim',
          claimAction: 'confirm',
          reasonCode: 'official_a2_osm_bitcoin_match',
          publicSummary: 'Official merchant payment Evidence and the OSM payment tag both identify Bitcoin payment support.',
          internalNote: 'System-reviewed under the bounded same-domain A2 plus explicit OSM Bitcoin rule.',
          nextReviewAt: nextReviewAt.toISOString(),
          endedReason: null,
        },
      );
      if (review.claimStatus !== 'confirmed') throw new Error('Evidence review did not confirm the claim.');
      confirmed += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ candidateId: row.candidateId, error: error instanceof Error ? error.message : String(error) }));
    }
  }

  console.log(JSON.stringify({
    target: EXPECTED_TARGET,
    acquisitionBatchIds: batchIds,
    countryCode,
    sourceCandidatesScanned: originRows.length,
    eligibleBeforeLimit: eligible.length,
    selected: targets.length,
    promoted,
    confirmed,
    failed,
    automaticRawCandidatePublication: false,
    evidenceRule: 'same-domain official A2 + explicit OSM payment:bitcoin + scoped country + no duplicate group',
  }));
}

await main();
