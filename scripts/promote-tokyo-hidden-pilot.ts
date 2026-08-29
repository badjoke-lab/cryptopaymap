import { and, asc, eq } from 'drizzle-orm';
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
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';

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
    throw new Error('Refusing Tokyo pilot promotion outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const candidateRows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      updatedAt: sourceCandidates.updatedAt,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.reviewStatus, 'pending'),
        eq(evidence.visibility, 'private'),
      ),
    )
    .orderBy(asc(sourceCandidates.id));

  const unique = new Map(candidateRows.map((row) => [row.candidateId, row]));
  const candidates = [...unique.values()].filter(
    (row) =>
      row.candidateType === 'physical_place' &&
      row.duplicateGroupId === null &&
      (['new', 'triaged', 'promoted'].includes(row.candidateStatus)),
  );
  const pilot = candidates[0];
  if (!pilot) throw new Error('No bounded Tokyo pilot Candidate is available.');

  const relations = await db
    .select({
      sourceRecordId: candidateSourceRecords.sourceRecordId,
      relationship: candidateSourceRecords.relationship,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(eq(candidateSourceRecords.candidateId, pilot.candidateId))
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
  const lightningTagged = ['yes', 'only'].includes((paymentTags['payment:lightning'] ?? '').toLowerCase());
  const countrySource = relations.some((row) => {
    const payload = record(row.rawPayload);
    return payload?.sourceSystem === 'openstreetmap_nominatim' && payload?.countryCode === 'JP';
  });

  const [bitcoin] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.symbol, 'BTC'), eq(assets.status, 'active')))
    .limit(1);
  const [lightning] = await db
    .select({ id: networks.id })
    .from(networks)
    .where(and(eq(networks.slug, 'lightning'), eq(networks.status, 'active')))
    .limit(1);
  const [lightningInvoice] = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.slug, 'lightning_invoice'), eq(paymentMethods.status, 'active')))
    .limit(1);

  const registryReady = Boolean(bitcoin && lightning && lightningInvoice);
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
  const subjectAuthorized = policy.configured && policy.allowedSubjects.has(reviewer.subject);

  if (!registryReady || !sourceReady || !subjectAuthorized) {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        batchId: TOKYO_BATCH_ID,
        boundedPilotSelected: true,
        candidateState: pilot.candidateStatus,
        sourceReady,
        registryReady,
        authorizationConfigured: policy.configured,
        reviewerAuthorized: subjectAuthorized,
        mutationPerformed: false,
        publicDataChanged: false,
        payloadExposed: false,
      }),
    );
    return;
  }

  if (pilot.candidateStatus === 'promoted') {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        batchId: TOKYO_BATCH_ID,
        boundedPilotSelected: true,
        candidateState: 'promoted',
        sourceReady,
        registryReady,
        authorizationConfigured: true,
        reviewerAuthorized: true,
        mutationPerformed: false,
        alreadyPromoted: true,
        publicDataChanged: false,
        payloadExposed: false,
      }),
    );
    return;
  }

  if (pilot.canonicalEntityId !== null || pilot.canonicalLocationId !== null) {
    throw new Error('Pilot Candidate has unexpected canonical links before promotion.');
  }

  const requestId = await deterministicUuid(`tokyo-hidden-pilot:request:${pilot.candidateId}`);
  const entityId = await deterministicUuid(`tokyo-hidden-pilot:entity:${pilot.candidateId}`);
  const locationId = await deterministicUuid(`tokyo-hidden-pilot:location:${pilot.candidateId}`);
  const claimId = await deterministicUuid(`tokyo-hidden-pilot:claim:${pilot.candidateId}`);
  const claimAssetId = await deterministicUuid(`tokyo-hidden-pilot:claim-asset:${pilot.candidateId}`);
  const promotedAt = new Date(pilot.updatedAt.getTime() + 1_000);
  const locationSlug = `osm-${String(osmType)}-${String(osmId)}`.slice(0, 64);
  const websiteUrl = safeHttps(seed?.websiteUrl);
  const phone = typeof seed?.phone === 'string' && seed.phone.trim().length > 0 ? seed.phone.trim() : null;

  const context = authorizeCandidatePromotion(reviewer, policy, requestId);
  const receipt = await createCandidatePromotionService(createDrizzleCandidatePromotionBackend(db)).promote(
    context,
    {
      candidateId: pilot.candidateId,
      expectedCandidateType: 'physical_place',
      expectedCandidateUpdatedAt: pilot.updatedAt.toISOString(),
      promotedAt: promotedAt.toISOString(),
      entity: {
        id: entityId,
        value: {
          entityType: 'merchant',
          name,
          slug: null,
          legalName: null,
          websiteUrl,
          countryCode: 'JP',
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
          countryCode: 'JP',
          latitude: latitude as number,
          longitude: longitude as number,
          locationStatus: 'active',
          visibility: 'hidden',
          websiteUrl,
          phone,
          description: null,
          openingHours: typeof tags.opening_hours === 'string' && tags.opening_hours.trim().length > 0 ? tags.opening_hours.trim() : null,
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
    },
  );

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      boundedPilotSelected: true,
      sourceReady: true,
      registryReady: true,
      authorizationConfigured: true,
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
