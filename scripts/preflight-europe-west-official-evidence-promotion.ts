import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { createDerivedStagingServiceIdentity } from '../src/admin/access/identity';
import {
  readCandidatePromotionAuthorizationPolicy,
} from '../src/admin/promotion/authorization';
import {
  readEvidenceReviewAuthorizationPolicy,
} from '../src/admin/evidence-review/authorization';
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const ids = [
    ...new Set(
      (process.env.CPM_REVIEW_BATCH_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0 || ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error('CPM_REVIEW_BATCH_IDS must contain one or more UUIDs.');
  }
  return ids;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing promotion preflight outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const batchIds = batchIdsFromEnvironment();
  const db = createDatabase(databaseUrl);
  const reviewer = createDerivedStagingServiceIdentity('reviewer');
  const promotionPolicy = readCandidatePromotionAuthorizationPolicy({
    CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: process.env.CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS,
  });
  const evidencePolicy = readEvidenceReviewAuthorizationPolicy({
    CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: process.env.CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS,
  });

  const candidateRows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      updatedAt: sourceCandidates.updatedAt,
      evidenceId: evidence.id,
      evidenceClass: evidence.evidenceClass,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceUpdatedAt: evidence.updatedAt,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, batchIds),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.originRole, 'merchant_side'),
        eq(evidence.polarity, 'supporting'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const unique = new Map<string, (typeof candidateRows)[number]>();
  for (const row of candidateRows) if (!unique.has(row.candidateId)) unique.set(row.candidateId, row);

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

  const registryReady = Boolean(bitcoin && lightning && lightningInvoice);
  const promotionAuthorized =
    promotionPolicy.configured && promotionPolicy.allowedSubjects.has(reviewer.subject);
  const evidenceReviewAuthorized =
    evidencePolicy.configured && evidencePolicy.allowedSubjects.has(reviewer.subject);

  const details: Array<Record<string, unknown>> = [];
  let structuralEligible = 0;
  let lightningSourceReady = 0;
  let exactPromotionReady = 0;

  for (const row of unique.values()) {
    const relations = await db
      .select({
        relationship: candidateSourceRecords.relationship,
        rawPayload: sourceRecords.rawPayload,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, row.candidateId));

    const origin = relations.find((relation) => relation.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload?.reviewSeed);
    const element = record(originPayload?.element);
    const paymentTags = stringMap(seed?.paymentTags);
    const name = typeof seed?.name === 'string' ? seed.name.trim() : '';
    const latitude = typeof seed?.latitude === 'number' ? seed.latitude : null;
    const longitude = typeof seed?.longitude === 'number' ? seed.longitude : null;
    const osmType = element?.type;
    const osmId = element?.id;
    const lightningTagged = ['yes', 'only'].includes(
      (paymentTags['payment:lightning'] ?? '').toLowerCase(),
    );
    const countryCodes = relations
      .map((relation) => record(relation.rawPayload))
      .filter((payload) => payload?.sourceSystem === 'openstreetmap_nominatim')
      .map((payload) => payload?.countryCode)
      .filter((value): value is string => typeof value === 'string' && /^[A-Z]{2}$/.test(value));
    const countryCode = countryCodes[0] ?? null;

    const structural =
      row.candidateType === 'physical_place' &&
      row.duplicateGroupId === null &&
      ['new', 'triaged'].includes(row.candidateStatus) &&
      row.canonicalEntityId === null &&
      row.canonicalLocationId === null &&
      row.evidenceClass === 'a' &&
      row.evidenceReviewStatus === 'pending' &&
      row.evidenceVisibility === 'private';
    const sourceReady = Boolean(
      name &&
        latitude !== null &&
        longitude !== null &&
        (osmType === 'node' || osmType === 'way' || osmType === 'relation') &&
        typeof osmId === 'number' &&
        Number.isSafeInteger(osmId) &&
        lightningTagged &&
        countryCode,
    );
    const ready =
      structural && sourceReady && registryReady && promotionAuthorized && evidenceReviewAuthorized;

    if (structural) structuralEligible += 1;
    if (sourceReady) lightningSourceReady += 1;
    if (ready) exactPromotionReady += 1;

    details.push({
      candidateId: row.candidateId,
      candidateUpdatedAt: row.updatedAt.toISOString(),
      evidenceId: row.evidenceId,
      evidenceUpdatedAt: row.evidenceUpdatedAt.toISOString(),
      countryCode,
      structural,
      sourceReady,
      lightningTagged,
      registryReady,
      promotionAuthorized,
      evidenceReviewAuthorized,
      exactPromotionReady: ready,
    });
  }

  const result = {
    target: EXPECTED_TARGET,
    importBatchCount: batchIds.length,
    officialEvidenceCandidates: unique.size,
    structuralEligible,
    lightningSourceReady,
    exactPromotionReady,
    registry: {
      bitcoinAssetReady: Boolean(bitcoin),
      lightningNetworkReady: Boolean(lightning),
      lightningInvoiceReady: Boolean(lightningInvoice),
      assetCount: Number(assetCount?.count ?? 0),
      networkCount: Number(networkCount?.count ?? 0),
      paymentMethodCount: Number(methodCount?.count ?? 0),
    },
    promotionAuthorizationConfigured: promotionPolicy.configured,
    reviewerPromotionAuthorized: promotionAuthorized,
    evidenceReviewAuthorizationConfigured: evidencePolicy.configured,
    reviewerEvidenceReviewAuthorized: evidenceReviewAuthorized,
    mutationPerformed: false,
    publicDataChanged: false,
    payloadExposed: false,
    details,
  };

  process.stdout.write(JSON.stringify(result));
}

await main();
