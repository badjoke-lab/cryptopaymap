import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { createDerivedStagingServiceIdentity } from '../src/admin/access/identity';
import {
  authorizeCandidatePromotion,
  readCandidatePromotionAuthorizationPolicy,
} from '../src/admin/promotion/authorization';
import { createCandidatePromotionService } from '../src/admin/promotion/candidate-promotion';
import { createDrizzleCandidatePromotionBackend } from '../src/admin/promotion/drizzle-candidate-promotion-backend';
import { createDatabase } from '../src/db/client';
import {
  assets,
  candidateSourceRecords,
  evidence,
  networks,
  paymentMethods,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const EXPECTED_CANDIDATE_HASH = '52d2304917b9d88e1a598cccfa2bdf592cd3dc8a506a78edf2ec725bbde45ba2';
const EXPECTED_CANDIDATE_UPDATED_AT = '2026-08-30T03:12:30.602Z';
const EXPECTED_EVIDENCE_UPDATED_AT = '2026-08-30T03:16:03.378Z';
const EXPECTED_COUNTRY_CODE = 'DE';
const REVIEW_BATCH_IDS = [
  'd0e17010-611c-48b2-a75d-8b389c1bee60',
  '5c85e86a-bc05-4f9d-a1f3-9d5e6135ef81',
  '8d9d6627-48f6-43e7-b7f0-7a90e1ed4689',
  '8e2c7c6a-e300-4747-90f7-290327870426',
  '3808ea78-195f-4558-8088-37c172be6b63',
] as const;

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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing reviewed Europe-west promotion outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      candidateUpdatedAt: sourceCandidates.updatedAt,
      evidenceId: evidence.id,
      evidenceClass: evidence.evidenceClass,
      evidenceSourceType: evidence.sourceType,
      evidenceOriginRole: evidence.originRole,
      evidencePolarity: evidence.polarity,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceUpdatedAt: evidence.updatedAt,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, [...REVIEW_BATCH_IDS]),
        eq(evidence.evidenceKind, 'official_payment_page'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const matches: (typeof rows)[number][] = [];
  for (const row of rows) {
    if ((await sha256(row.candidateId)) === EXPECTED_CANDIDATE_HASH) matches.push(row);
  }
  if (matches.length !== 1) throw new Error('Exact reviewed Candidate/Evidence pair is missing or ambiguous.');
  const selected = matches[0];
  if (!selected) throw new Error('Exact reviewed Candidate was not selected.');

  const alreadyPromoted = selected.candidateStatus === 'promoted';
  const expectedCurrentCandidateUpdatedAt = new Date(
    Date.parse(EXPECTED_CANDIDATE_UPDATED_AT) + (alreadyPromoted ? 1_000 : 0),
  ).toISOString();

  if (
    selected.candidateType !== 'physical_place' ||
    selected.duplicateGroupId !== null ||
    (!alreadyPromoted && !['new', 'triaged'].includes(selected.candidateStatus)) ||
    (alreadyPromoted
      ? selected.canonicalEntityId === null || selected.canonicalLocationId === null
      : selected.canonicalEntityId !== null || selected.canonicalLocationId !== null) ||
    selected.evidenceClass !== 'a' ||
    selected.evidenceSourceType !== 'official_page' ||
    selected.evidenceOriginRole !== 'merchant_side' ||
    selected.evidencePolarity !== 'supporting' ||
    selected.evidenceReviewStatus !== 'pending' ||
    selected.evidenceVisibility !== 'private' ||
    selected.candidateUpdatedAt.toISOString() !== expectedCurrentCandidateUpdatedAt ||
    selected.evidenceUpdatedAt.toISOString() !== EXPECTED_EVIDENCE_UPDATED_AT
  ) {
    throw new Error('Exact reviewed Candidate/Evidence state changed after review; refusing promotion.');
  }

  const relations = await db
    .select({
      sourceRecordId: candidateSourceRecords.sourceRecordId,
      relationship: candidateSourceRecords.relationship,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(eq(candidateSourceRecords.candidateId, selected.candidateId))
    .orderBy(asc(candidateSourceRecords.sourceRecordId));
  const sourceRecordIds = relations.map((row) => row.sourceRecordId);
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
  const lightningTagged = ['yes', 'only'].includes(
    (paymentTags['payment:lightning'] ?? '').toLowerCase(),
  );
  const countrySource = relations.some((row) => {
    const payload = record(row.rawPayload);
    return (
      payload?.sourceSystem === 'openstreetmap_nominatim' &&
      payload?.countryCode === EXPECTED_COUNTRY_CODE
    );
  });

  const [[bitcoin], [lightning], [lightningInvoice], [assetCount], [networkCount], [methodCount]] =
    await Promise.all([
      db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.symbol, 'BTC'), eq(assets.status, 'active')))
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
      db.select({ count: sql<number>`count(*)::int` }).from(assets),
      db.select({ count: sql<number>`count(*)::int` }).from(networks),
      db.select({ count: sql<number>`count(*)::int` }).from(paymentMethods),
    ]);

  const registry = {
    bitcoinAssetReady: Boolean(bitcoin),
    lightningNetworkReady: Boolean(lightning),
    lightningInvoiceReady: Boolean(lightningInvoice),
    assetCount: Number(assetCount?.count ?? 0),
    networkCount: Number(networkCount?.count ?? 0),
    paymentMethodCount: Number(methodCount?.count ?? 0),
  };
  const sourceReady = Boolean(
    name &&
      latitude !== null &&
      longitude !== null &&
      (osmType === 'node' || osmType === 'way' || osmType === 'relation') &&
      typeof osmId === 'number' &&
      Number.isSafeInteger(osmId) &&
      lightningTagged &&
      countrySource,
  );

  const policy = readCandidatePromotionAuthorizationPolicy({
    CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: process.env.CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS,
  });
  const reviewer = createDerivedStagingServiceIdentity('reviewer');
  const reviewerAuthorized = policy.configured && policy.allowedSubjects.has(reviewer.subject);
  if (!bitcoin || !lightning || !lightningInvoice || !sourceReady || !reviewerAuthorized) {
    throw new Error('Exact reviewed Candidate no longer satisfies promotion prerequisites.');
  }

  const requestId = await deterministicUuid(`europe-west-reviewed:request:${selected.candidateId}`);
  const entityId = await deterministicUuid(`europe-west-reviewed:entity:${selected.candidateId}`);
  const locationId = await deterministicUuid(`europe-west-reviewed:location:${selected.candidateId}`);
  const claimId = await deterministicUuid(`europe-west-reviewed:claim:${selected.candidateId}`);
  const claimAssetId = await deterministicUuid(`europe-west-reviewed:claim-asset:${selected.candidateId}`);
  const promotedAt = new Date(Date.parse(EXPECTED_CANDIDATE_UPDATED_AT) + 1_000);
  const locationSlug = `osm-${String(osmType)}-${String(osmId)}`.slice(0, 64);
  const websiteUrl = safeHttps(seed?.websiteUrl);
  const phone =
    typeof seed?.phone === 'string' && seed.phone.trim().length > 0 ? seed.phone.trim() : null;

  const context = authorizeCandidatePromotion(reviewer, policy, requestId);
  const receipt = await createCandidatePromotionService(
    createDrizzleCandidatePromotionBackend(db),
  ).promote(context, {
    candidateId: selected.candidateId,
    expectedCandidateType: 'physical_place',
    expectedCandidateUpdatedAt: EXPECTED_CANDIDATE_UPDATED_AT,
    promotedAt: promotedAt.toISOString(),
    entity: {
      id: entityId,
      value: {
        entityType: 'merchant',
        name,
        slug: null,
        legalName: null,
        websiteUrl,
        countryCode: EXPECTED_COUNTRY_CODE,
        entityStatus: 'active',
        visibility: 'hidden',
      },
    },
    location: {
      id: locationId,
      value: {
        name,
        slug: locationSlug,
        addressLine: null,
        locality: null,
        region: null,
        postalCode: null,
        countryCode: EXPECTED_COUNTRY_CODE,
        latitude: latitude as number,
        longitude: longitude as number,
        locationStatus: 'active',
        visibility: 'hidden',
        websiteUrl,
        phone,
        description: null,
        openingHours:
          typeof tags.opening_hours === 'string' && tags.opening_hours.trim().length > 0
            ? tags.opening_hours.trim()
            : null,
        amenities: [],
        socialLinks: [],
        osmType: osmType as 'node' | 'way' | 'relation',
        osmId: osmId as number,
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

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      exactReviewedCandidates: 1,
      sourceReady: true,
      registry,
      reviewerAuthorized: true,
      mutationPerformed: receipt.state === 'committed',
      replayed: receipt.state === 'replayed',
      candidateStateAfter: 'promoted',
      claimStatus: receipt.claimStatus,
      visibility: receipt.visibility,
      publicDataChanged: false,
      payloadExposed: false,
    }),
  );
}

await main();
