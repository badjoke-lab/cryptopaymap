import { readFile, writeFile } from 'node:fs/promises';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  entities,
  evidence,
  networks,
  paymentMethods,
  sourceCandidates,
} from '../src/db/schema';
import {
  canonicalPublicJson,
  hashPublicArtifact,
  validatePublicArtifactSet,
} from '../src/publication/export-boundary';
import { publicExportPaths } from '../src/schemas/public-exports';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const SCHEMA_VERSION = '1.0.0';
const dataDirectory = new URL('../public/data/', import.meta.url);
const versionPath = new URL('../public/version.json', import.meta.url);

type JsonRecord = Record<string, unknown>;
type FileWithRecords = { schemaVersion: string; generatedAt: string; records: unknown[] };
type StatsFile = { schemaVersion: string; generatedAt: string; stats: JsonRecord };

function record(value: unknown): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON object while extending staging public artifacts.');
  }
  return value as JsonRecord;
}

async function readJson(path: string): Promise<unknown> {
  const url = path === '/version.json' ? versionPath : new URL(path.replace('/data/', ''), dataDirectory);
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

function iso(value: Date | null, field: string): string {
  if (!value) throw new Error(`Missing required online public timestamp: ${field}`);
  return value.toISOString();
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing online public materialization outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const onlineRows = await db
    .select({
      candidateId: sourceCandidates.id,
      entityId: entities.id,
      entitySlug: entities.slug,
      entityName: entities.name,
      entityStatus: entities.entityStatus,
      entityCountryCode: entities.countryCode,
      entityWebsiteUrl: entities.websiteUrl,
      claimId: acceptanceClaims.id,
      claimScope: acceptanceClaims.claimScope,
      acceptanceScope: acceptanceClaims.acceptanceScope,
      claimStatus: acceptanceClaims.claimStatus,
      routeType: acceptanceClaims.routeType,
      processorId: acceptanceClaims.processorId,
      howToPay: acceptanceClaims.howToPay,
      instructionsLanguage: acceptanceClaims.instructionsLanguage,
      merchantReceives: acceptanceClaims.merchantReceives,
      restrictions: acceptanceClaims.restrictions,
      firstConfirmedAt: acceptanceClaims.firstConfirmedAt,
      lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
      nextReviewAt: acceptanceClaims.nextReviewAt,
      endedAt: acceptanceClaims.endedAt,
      endedReason: acceptanceClaims.endedReason,
    })
    .from(sourceCandidates)
    .innerJoin(entities, eq(entities.id, sourceCandidates.canonicalEntityId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.entityId, entities.id))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'online_service'),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        eq(entities.visibility, 'public'),
        eq(acceptanceClaims.claimScope, 'online_service'),
        eq(acceptanceClaims.visibility, 'public'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
      ),
    )
    .orderBy(asc(entities.slug));

  const onlineClaimIds = onlineRows.map((row) => row.claimId);
  const paymentRows =
    onlineClaimIds.length === 0
      ? []
      : await db
          .select({
            claimId: claimAssets.claimId,
            assetSlug: assets.slug,
            assetSymbol: assets.symbol,
            assetName: assets.name,
            assetAliases: assets.aliases,
            assetType: assets.assetType,
            assetStablecoin: assets.isStablecoin,
            assetWrapped: assets.isWrapped,
            assetDecimals: assets.defaultDecimals,
            assetStatus: assets.status,
            networkSlug: networks.slug,
            networkName: networks.name,
            networkAliases: networks.aliases,
            networkStatus: networks.status,
            paymentMethod: paymentMethods.slug,
            paymentMethodStatus: paymentMethods.status,
            contractAddress: claimAssets.contractAddress,
            isPrimary: claimAssets.isPrimary,
            notes: claimAssets.notes,
          })
          .from(claimAssets)
          .innerJoin(assets, eq(assets.id, claimAssets.assetId))
          .innerJoin(networks, eq(networks.id, claimAssets.networkId))
          .innerJoin(paymentMethods, eq(paymentMethods.id, claimAssets.paymentMethodId))
          .where(inArray(claimAssets.claimId, onlineClaimIds))
          .orderBy(asc(claimAssets.claimId), asc(assets.slug), asc(networks.slug));

  const evidenceRows =
    onlineClaimIds.length === 0
      ? []
      : await db
          .select({
            claimId: evidence.claimId,
            kind: evidence.evidenceKind,
            evidenceClass: evidence.evidenceClass,
            sourceType: evidence.sourceType,
            polarity: evidence.polarity,
            sourceName: evidence.sourceName,
            sourceUrl: evidence.sourceUrl,
            archiveUrl: evidence.archiveUrl,
            observedAt: evidence.observedAt,
            publishedAt: evidence.publishedAt,
            summary: evidence.summary,
          })
          .from(evidence)
          .where(
            and(
              inArray(evidence.claimId, onlineClaimIds),
              eq(evidence.visibility, 'public'),
              eq(evidence.reviewStatus, 'accepted'),
            ),
          )
          .orderBy(asc(evidence.claimId), asc(evidence.id));

  const processorIds = [...new Set(onlineRows.map((row) => row.processorId).filter((id): id is string => Boolean(id)))];
  const processorRows =
    processorIds.length === 0
      ? []
      : await db
          .select({ id: entities.id, slug: entities.slug })
          .from(entities)
          .where(inArray(entities.id, processorIds));
  const processorSlugById = new Map(processorRows.map((row) => [row.id, row.slug]));

  const paymentsByClaim = new Map<string, typeof paymentRows>();
  for (const row of paymentRows) {
    const values = paymentsByClaim.get(row.claimId) ?? [];
    values.push(row);
    paymentsByClaim.set(row.claimId, values);
  }
  const evidenceByClaim = new Map<string, typeof evidenceRows>();
  for (const row of evidenceRows) {
    if (!row.claimId) continue;
    const values = evidenceByClaim.get(row.claimId) ?? [];
    values.push(row);
    evidenceByClaim.set(row.claimId, values);
  }

  const onlineServices = onlineRows.map((row) => {
    if (!row.entitySlug || !row.entityWebsiteUrl || !row.howToPay) {
      throw new Error('A public online service is missing slug, website, or How to pay.');
    }
    if (!row.entityWebsiteUrl.startsWith('https://')) {
      throw new Error('A public online service requires an HTTPS merchant website.');
    }
    const payments = paymentsByClaim.get(row.claimId) ?? [];
    const acceptedEvidence = evidenceByClaim.get(row.claimId) ?? [];
    if (payments.length < 1 || acceptedEvidence.length < 1) {
      throw new Error('A public online service is missing payment metadata or accepted Evidence.');
    }
    if (
      payments.some(
        (payment) =>
          payment.assetStatus !== 'active' ||
          payment.networkStatus !== 'active' ||
          payment.paymentMethodStatus !== 'active',
      )
    ) {
      throw new Error('A public online service references deprecated payment registry values.');
    }
    const processorSlug = row.processorId ? processorSlugById.get(row.processorId) ?? null : null;
    if (row.routeType === 'processor_checkout' && !processorSlug) {
      throw new Error('Processor-checkout online service is missing a canonical processor slug.');
    }
    const claim = {
      claimKey: `claim-${row.entitySlug}`,
      entitySlug: row.entitySlug,
      locationSlug: null,
      claimScope: row.claimScope,
      acceptanceScope: row.acceptanceScope,
      status: row.claimStatus,
      routeType: row.routeType,
      processorSlug,
      howToPay: row.howToPay,
      instructionsLanguage: row.instructionsLanguage,
      merchantReceives: row.merchantReceives,
      restrictions: row.restrictions,
      firstConfirmedAt: iso(row.firstConfirmedAt, 'firstConfirmedAt'),
      lastConfirmedAt: iso(row.lastConfirmedAt, 'lastConfirmedAt'),
      nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      endedReason: row.endedReason,
      paymentAssets: payments.map((payment) => ({
        assetSlug: payment.assetSlug,
        assetSymbol: payment.assetSymbol,
        networkSlug: payment.networkSlug,
        paymentMethod: payment.paymentMethod,
        contractAddress: payment.contractAddress,
        isPrimary: payment.isPrimary,
        notes: payment.notes,
      })),
      evidence: acceptedEvidence.map((item) => ({
        kind: item.kind,
        evidenceClass: item.evidenceClass,
        sourceType: item.sourceType,
        polarity: item.polarity,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        archiveUrl: item.archiveUrl,
        observedAt: item.observedAt?.toISOString() ?? null,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        summary: item.summary,
      })),
    };
    const source = acceptedEvidence[0];
    return {
      serviceSlug: row.entitySlug,
      name: row.entityName,
      categorySlug: 'online-store',
      entityStatus: row.entityStatus,
      countryCode: row.entityCountryCode,
      websiteUrl: row.entityWebsiteUrl,
      claims: [claim],
      media: [],
      provenance: [
        {
          sourceName: source?.sourceName ?? `${row.entityName} official site`,
          sourceUrl: source?.sourceUrl ?? row.entityWebsiteUrl,
          licenseSlug: null,
          attribution: null,
          fields: ['name', 'websiteUrl'],
        },
      ],
    };
  });

  const artifacts: Record<string, unknown> = {};
  for (const path of publicExportPaths) artifacts[path] = await readJson(path);

  const existingClaims = artifacts['/data/acceptance-claims.json'] as FileWithRecords;
  const existingServices = artifacts['/data/online-services.json'] as FileWithRecords;
  const existingAssets = artifacts['/data/assets.json'] as FileWithRecords;
  const existingNetworks = artifacts['/data/networks.json'] as FileWithRecords;
  const existingUpdates = artifacts['/data/updates.json'] as FileWithRecords;
  const statsFile = artifacts['/data/stats.json'] as StatsFile;
  const existingVersion = record(artifacts['/version.json']);

  const onlineClaims = onlineServices.flatMap((service) => service.claims);
  const onlineAssetRecords = [...new Map(paymentRows.map((row) => [row.assetSlug, {
    slug: row.assetSlug,
    symbol: row.assetSymbol,
    name: row.assetName,
    aliases: row.assetAliases ?? [],
    assetType: row.assetType,
    isStablecoin: row.assetStablecoin,
    isWrapped: row.assetWrapped,
    defaultDecimals: row.assetDecimals,
    status: row.assetStatus,
  }])).values()];
  const onlineNetworkRecords = [...new Map(paymentRows.map((row) => [row.networkSlug, {
    slug: row.networkSlug,
    name: row.networkName,
    aliases: row.networkAliases ?? [],
    status: row.networkStatus,
  }])).values()];

  const latestOnline = Math.max(0, ...onlineRows.map((row) => row.lastConfirmedAt?.getTime() ?? 0));
  const existingGeneratedAt = Date.parse(existingClaims.generatedAt);
  const generatedAt = new Date(Math.max(existingGeneratedAt, latestOnline)).toISOString();
  const datasetVersion = `staging-real-${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 12)}`;
  const header = { schemaVersion: SCHEMA_VERSION, generatedAt };

  existingClaims.schemaVersion = SCHEMA_VERSION;
  existingClaims.generatedAt = generatedAt;
  existingClaims.records = [
    ...existingClaims.records.filter((value) => !onlineClaims.some((claim) => record(value).claimKey === claim.claimKey)),
    ...onlineClaims,
  ];
  existingServices.schemaVersion = SCHEMA_VERSION;
  existingServices.generatedAt = generatedAt;
  existingServices.records = onlineServices;
  existingAssets.schemaVersion = SCHEMA_VERSION;
  existingAssets.generatedAt = generatedAt;
  existingAssets.records = [...new Map([...existingAssets.records, ...onlineAssetRecords].map((value) => [String(record(value).slug), value])).values()];
  existingNetworks.schemaVersion = SCHEMA_VERSION;
  existingNetworks.generatedAt = generatedAt;
  existingNetworks.records = [...new Map([...existingNetworks.records, ...onlineNetworkRecords].map((value) => [String(record(value).slug), value])).values()];

  const onlineUpdates = onlineServices.map((service) => ({
    updateKey: `confirmed-${service.serviceSlug}`,
    updateType: 'newly_confirmed' as const,
    subjectType: 'service' as const,
    subjectSlug: service.serviceSlug,
    title: `${service.name} confirmed`,
    summary: 'Reviewed merchant Evidence confirms cryptocurrency acceptance for this online service.',
    effectiveAt: service.claims[0]?.firstConfirmedAt,
  }));
  existingUpdates.schemaVersion = SCHEMA_VERSION;
  existingUpdates.generatedAt = generatedAt;
  existingUpdates.records = [
    ...existingUpdates.records.filter((value) => !onlineUpdates.some((update) => record(value).updateKey === update.updateKey)),
    ...onlineUpdates,
  ];

  for (const path of ['/data/locations-osm.json','/data/place-pins.json','/data/places.json','/data/places.geojson'] as const) {
    const value = record(artifacts[path]);
    value.schemaVersion = SCHEMA_VERSION;
    value.generatedAt = generatedAt;
  }

  const stats = statsFile.stats;
  statsFile.schemaVersion = SCHEMA_VERSION;
  statsFile.generatedAt = generatedAt;
  stats.confirmedOnlineServices = onlineServices.length;
  stats.processorCheckoutClaims = existingClaims.records.filter((value) => record(value).routeType === 'processor_checkout').length;
  stats.directWalletClaims = existingClaims.records.filter((value) => record(value).routeType === 'direct_wallet').length;
  const totalClaims = existingClaims.records.length;
  stats.howToPayCoverage = totalClaims === 0 ? 0 : 1;
  stats.networkSpecifiedRate = totalClaims === 0 ? 0 : 1;
  stats.evidenceBackedRate = totalClaims === 0 ? 0 : 1;
  const allPaymentAssets = existingClaims.records.flatMap((value) => {
    const payments = record(value).paymentAssets;
    return Array.isArray(payments) ? payments.map(record) : [];
  });
  stats.topAssets = [...new Set(allPaymentAssets.map((payment) => String(payment.assetSlug)))].sort().map((key) => ({
    key,
    count: allPaymentAssets.filter((payment) => payment.assetSlug === key).length,
  }));
  stats.topNetworks = [...new Set(allPaymentAssets.map((payment) => String(payment.networkSlug)))].sort().map((key) => ({
    key,
    count: allPaymentAssets.filter((payment) => payment.networkSlug === key).length,
  }));

  artifacts['/version.json'] = {
    ...existingVersion,
    datasetVersion,
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
  };

  const manifestFiles = [];
  for (const path of publicExportPaths.filter((path) => path !== '/data/manifest.json')) {
    const value = artifacts[path];
    if (value === undefined) throw new Error(`Missing generated public artifact: ${path}`);
    const objectValue = record(value);
    const count =
      path === '/version.json' || path === '/data/stats.json'
        ? 1
        : path === '/data/places.geojson'
          ? Array.isArray(objectValue.features) ? objectValue.features.length : 0
          : Array.isArray(objectValue.records) ? objectValue.records.length : 0;
    manifestFiles.push({
      path,
      mediaType: path === '/data/places.geojson' ? 'application/geo+json' : 'application/json',
      schemaVersion: SCHEMA_VERSION,
      recordCount: count,
      sha256: await hashPublicArtifact(value),
      licenses:
        path === '/data/locations-osm.json' ||
        path === '/data/places.json' ||
        path === '/data/place-pins.json' ||
        path === '/data/places.geojson'
          ? ['odbl-1-0', 'cpm-public-data']
          : ['cpm-public-data'],
    });
  }
  artifacts['/data/manifest.json'] = { ...header, datasetVersion, canonicalOnly: true, files: manifestFiles };

  await validatePublicArtifactSet(artifacts);
  for (const path of publicExportPaths) {
    const value = artifacts[path];
    const url = path === '/version.json' ? versionPath : new URL(path.replace('/data/', ''), dataDirectory);
    await writeFile(url, canonicalPublicJson(value), 'utf8');
  }

  console.log(JSON.stringify({
    target: TARGET,
    onlineServices: onlineServices.length,
    onlineAcceptanceClaims: onlineClaims.length,
    onlineAcceptedPublicEvidence: evidenceRows.length,
    totalAcceptanceClaims: existingClaims.records.length,
    datasetVersion,
    syntheticFixturesUsed: false,
    candidatePayloadExposed: false,
  }));
}

await main();
