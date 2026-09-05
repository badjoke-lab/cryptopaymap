import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  assets,
  candidateSourceRecords,
  claimAssets,
  entities,
  evidence,
  locations,
  networks,
  paymentMethods,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';
import {
  canonicalPublicJson,
  hashPublicArtifact,
  validatePublicArtifactSet,
} from '../src/publication/export-boundary';
import { publicExportPaths } from '../src/schemas/public-exports';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const SCHEMA_VERSION = '1.0.0';
const outputDirectory = new URL('../public/data/', import.meta.url);
const versionPath = new URL('../public/version.json', import.meta.url);

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const record = object(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function publicSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return normalized.length > 0 ? normalized : 'merchant';
}

function boundedPublicIdentifier(prefix: string, value: string): string {
  const candidate = `${prefix}-${value}`;
  if (candidate.length <= 64) return candidate;
  const head = candidate.slice(0, 51).replace(/-+$/g, '');
  return `${head}-${sha256(candidate).slice(0, 12)}`;
}

function publishableSocialLinks(
  links: Array<{ platform: string; url: string; handle: string | null }> | null,
) {
  return (links ?? []).filter((link) => {
    const platform = link.platform.trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(platform) || platform.length > 40) return false;
    if (link.handle !== null) {
      const handle = link.handle.trim();
      if (handle.length < 1 || handle.length > 120) return false;
    }
    try {
      return new URL(link.url).protocol === 'https:';
    } catch {
      return false;
    }
  });
}

function categoryFromTags(tags: Record<string, string>): string {
  const amenity = tags.amenity?.toLowerCase();
  if (amenity === 'cafe') return 'cafe';
  if (['restaurant', 'fast_food', 'food_court'].includes(amenity ?? '')) return 'restaurant';
  if (['bar', 'pub', 'biergarten'].includes(amenity ?? '')) return 'bar';
  if (amenity === 'marketplace') return 'market';
  const tourism = tags.tourism?.toLowerCase();
  if (['hotel', 'hostel', 'guest_house', 'motel'].includes(tourism ?? '')) return 'hotel';
  const shop = tags.shop?.toLowerCase();
  if (shop) return publicSlug(shop);
  const office = tags.office?.toLowerCase();
  if (office === 'coworking') return 'coworking';
  return 'merchant';
}

function iso(value: Date | null, field: string): string {
  if (!value) throw new Error(`Missing required public timestamp: ${field}`);
  return value.toISOString();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing DB-backed public materialization outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const placeRows = await db
    .select({
      candidateId: sourceCandidates.id,
      entityId: entities.id,
      entitySlug: entities.slug,
      entityName: entities.name,
      entityStatus: entities.entityStatus,
      entityWebsiteUrl: entities.websiteUrl,
      entityVisibility: entities.visibility,
      locationId: locations.id,
      locationSlug: locations.slug,
      locationName: locations.name,
      addressLine: locations.addressLine,
      locality: locations.locality,
      region: locations.region,
      postalCode: locations.postalCode,
      countryCode: locations.countryCode,
      latitude: locations.latitude,
      longitude: locations.longitude,
      locationStatus: locations.locationStatus,
      locationVisibility: locations.visibility,
      locationWebsiteUrl: locations.websiteUrl,
      phone: locations.phone,
      description: locations.description,
      openingHours: locations.openingHours,
      amenities: locations.amenities,
      socialLinks: locations.socialLinks,
      osmType: locations.osmType,
      osmId: locations.osmId,
      claimId: acceptanceClaims.id,
      claimScope: acceptanceClaims.claimScope,
      acceptanceScope: acceptanceClaims.acceptanceScope,
      claimStatus: acceptanceClaims.claimStatus,
      claimVisibility: acceptanceClaims.visibility,
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
    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))
    .innerJoin(entities, eq(entities.id, locations.entityId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.locationId, locations.id))
    .where(
      and(
        eq(sourceCandidates.candidateStatus, 'promoted'),
        eq(entities.visibility, 'public'),
        eq(locations.visibility, 'public'),
        eq(acceptanceClaims.visibility, 'public'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
      ),
    )
    .orderBy(asc(locations.slug));

  if (placeRows.length < 1) {
    throw new Error('Expected at least one public confirmed physical place.');
  }

  const claimIds = placeRows.map((row) => row.claimId);
  const candidateIds = placeRows.map((row) => row.candidateId);
  const processorIds = [
    ...new Set(placeRows.map((row) => row.processorId).filter((value): value is string => value !== null)),
  ];
  const processorRows =
    processorIds.length > 0
      ? await db
          .select({ id: entities.id, slug: entities.slug })
          .from(entities)
          .where(inArray(entities.id, processorIds))
      : [];
  const processorSlugs = new Map(
    processorRows.map((row) => [row.id, row.slug]).filter((entry): entry is [string, string] => entry[1] !== null),
  );

  const paymentRows = await db
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
    .where(inArray(claimAssets.claimId, claimIds))
    .orderBy(asc(claimAssets.claimId), asc(assets.slug), asc(networks.slug));

  const evidenceRows = await db
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
        inArray(evidence.claimId, claimIds),
        eq(evidence.visibility, 'public'),
        eq(evidence.reviewStatus, 'accepted'),
      ),
    )
    .orderBy(asc(evidence.claimId), asc(evidence.id));

  const originRows = await db
    .select({
      candidateId: candidateSourceRecords.candidateId,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        inArray(candidateSourceRecords.candidateId, candidateIds),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    );
  const origins = new Map(originRows.map((row) => [row.candidateId, object(row.rawPayload)]));

  const paymentsByClaim = new Map<string, typeof paymentRows>();
  for (const row of paymentRows) {
    const current = paymentsByClaim.get(row.claimId) ?? [];
    current.push(row);
    paymentsByClaim.set(row.claimId, current);
  }
  const evidenceByClaim = new Map<string, typeof evidenceRows>();
  for (const row of evidenceRows) {
    if (!row.claimId) continue;
    const current = evidenceByClaim.get(row.claimId) ?? [];
    current.push(row);
    evidenceByClaim.set(row.claimId, current);
  }

  const places = placeRows.map((row) => {
    if (!row.entitySlug || !row.howToPay) {
      throw new Error('A public physical place is missing a required canonical publication field.');
    }
    const payments = paymentsByClaim.get(row.claimId) ?? [];
    const acceptedEvidence = evidenceByClaim.get(row.claimId) ?? [];
    if (payments.length < 1 || acceptedEvidence.length < 1) {
      throw new Error('A public physical claim is missing payment or accepted public Evidence.');
    }
    if (
      payments.some(
        (payment) =>
          payment.assetStatus !== 'active' ||
          payment.networkStatus !== 'active' ||
          payment.paymentMethodStatus !== 'active',
      )
    ) {
      throw new Error('A public physical claim references a deprecated payment registry value.');
    }
    const origin = origins.get(row.candidateId);
    const reviewSeed = object(origin?.reviewSeed);
    const officialLocationUrl =
      typeof reviewSeed?.websiteUrl === 'string' ? reviewSeed.websiteUrl : null;
    const element = object(origin?.element);
    const tags = stringMap(element?.tags);
    const entityNameKey = row.entityName.toLowerCase();
    const sourceFirstCategorySlug =
      entityNameKey.includes('chipotle') ||
      entityNameKey.includes('steak n shake') ||
      entityNameKey.includes("steak 'n shake")
        ? 'restaurant'
        : null;
    const inferredOsmCategorySlug = categoryFromTags(tags);
    const broadOsmCategory = ['amenity', 'tourism', 'shop', 'office', 'craft', 'leisure', 'healthcare']
      .map((key) => tags[key]?.trim().toLowerCase())
      .find((value) => Boolean(value));
    const categorySlug =
      sourceFirstCategorySlug ??
      (inferredOsmCategorySlug !== 'merchant'
        ? inferredOsmCategorySlug
        : broadOsmCategory
          ? publicSlug(broadOsmCategory)
          : 'merchant');
    const publicDescription = row.description;
    const osmUrl =
      row.osmType && row.osmId !== null
        ? `https://www.openstreetmap.org/${row.osmType}/${row.osmId}`
        : null;
    const firstConfirmedAt = iso(row.firstConfirmedAt, 'firstConfirmedAt');
    const lastConfirmedAt = iso(row.lastConfirmedAt, 'lastConfirmedAt');
    const claim = {
      claimKey: `claim-${row.locationSlug}`,
      entitySlug: row.entitySlug,
      locationSlug: row.locationSlug,
      claimScope: row.claimScope,
      acceptanceScope: row.acceptanceScope,
      status: row.claimStatus,
      routeType: row.routeType,
      processorSlug: row.processorId ? processorSlugs.get(row.processorId) ?? null : null,
      howToPay: row.howToPay,
      instructionsLanguage: row.instructionsLanguage,
      merchantReceives: row.merchantReceives,
      restrictions: row.restrictions,
      firstConfirmedAt,
      lastConfirmedAt,
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
    const provenance = osmUrl
      ? [
          {
            sourceName: 'OpenStreetMap',
            sourceUrl: osmUrl,
            licenseSlug: 'odbl-1-0',
            attribution: '© OpenStreetMap contributors',
            fields: [
              'name',
              ...(sourceFirstCategorySlug ? [] : ['categorySlug']),
              'countryCode',
              'latitude',
              'longitude',
              ...(row.locationWebsiteUrl || row.entityWebsiteUrl ? ['websiteUrl'] : []),
              ...(row.phone ? ['phone'] : []),
              ...(row.openingHours ? ['openingHours'] : []),
              ...(row.description ? ['description'] : []),
            ],
          },
          ...(
            sourceFirstCategorySlug
              ? [
                  {
                    sourceName: 'CryptoPayMap normalized place profile',
                    sourceUrl: null,
                    licenseSlug: null,
                    attribution: null,
                    fields: ['categorySlug'],
                  },
                ]
              : []
          ),
        ]
      : [
          {
            sourceName: 'Official merchant location directory',
            sourceUrl: officialLocationUrl ?? row.locationWebsiteUrl ?? row.entityWebsiteUrl,
            licenseSlug: null,
            attribution: null,
            fields: [
              'name',
              'addressLine',
              'locality',
              'region',
              'postalCode',
              'countryCode',
              'latitude',
              'longitude',
              ...(row.locationWebsiteUrl || row.entityWebsiteUrl || officialLocationUrl
                ? ['websiteUrl']
                : []),
              ...(row.phone ? ['phone'] : []),
              ...(row.openingHours ? ['openingHours'] : []),
              ...(row.amenities?.length ? ['amenities'] : []),
              ...(row.description ? ['description'] : []),
            ],
          },
          {
            sourceName: 'CryptoPayMap normalized place profile',
            sourceUrl: null,
            licenseSlug: null,
            attribution: null,
            fields: ['categorySlug'],
          },
        ];
    return {
      placeSlug: row.locationSlug,
      entitySlug: row.entitySlug,
      name: row.locationName ?? row.entityName,
      categorySlug,
      entityStatus: row.entityStatus,
      locationStatus: row.locationStatus,
      addressLine: row.addressLine,
      locality: row.locality,
      region: row.region,
      postalCode: row.postalCode,
      countryCode: row.countryCode,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      websiteUrl: row.locationWebsiteUrl ?? row.entityWebsiteUrl,
      phone: row.phone,
      description: publicDescription,
      openingHours: row.openingHours,
      amenities: row.amenities ?? [],
      socialLinks: publishableSocialLinks(row.socialLinks),
      claims: [claim],
      media: [],
      provenance,
      osm:
        osmUrl && row.osmType && row.osmId !== null
          ? { osmUrl, osmType: row.osmType, osmId: String(row.osmId) }
          : null,
    };
  });

  const generatedAt = new Date(
    Math.max(...placeRows.map((row) => row.lastConfirmedAt?.getTime() ?? 0)),
  ).toISOString();
  const datasetVersion = `staging-real-${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 12)}`;
  const header = { schemaVersion: SCHEMA_VERSION, generatedAt };

  const acceptanceClaimsRecords = places.flatMap((place) => place.claims);
  const pins = places.map((place) => ({
    placeSlug: place.placeSlug,
    name: place.name,
    categorySlug: place.categorySlug,
    countryCode: place.countryCode,
    locality: place.locality,
    latitude: place.latitude,
    longitude: place.longitude,
    status: 'confirmed' as const,
    assetSlugs: [
      ...new Set(
        place.claims.flatMap((claim) => claim.paymentAssets.map((payment) => payment.assetSlug)),
      ),
    ],
    networkSlugs: [
      ...new Set(
        place.claims.flatMap((claim) => claim.paymentAssets.map((payment) => payment.networkSlug)),
      ),
    ],
    routeTypes: [...new Set(place.claims.map((claim) => claim.routeType))],
    lastConfirmedAt: place.claims[0]?.lastConfirmedAt,
    thumbnail: null,
  }));
  const locationsOsm = places.flatMap((place) =>
    place.osm
      ? [
          {
            locationSlug: place.placeSlug,
            name: place.name,
            addressLine: place.addressLine,
            locality: place.locality,
            region: place.region,
            postalCode: place.postalCode,
            countryCode: place.countryCode,
            latitude: place.latitude,
            longitude: place.longitude,
            osmType: place.osm.osmType,
            osmId: place.osm.osmId,
            websiteUrl: place.websiteUrl,
            sourceUrl: place.osm.osmUrl,
            attribution: '© OpenStreetMap contributors',
            licenseSlug: 'odbl-1-0' as const,
          },
        ]
      : [],
  );
  const publicPlaces = places.map(({ osm: _osm, ...place }) => place);
  const geojson = places.map((place) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [place.longitude, place.latitude] as [number, number],
    },
    properties: {
      placeSlug: place.placeSlug,
      name: place.name,
      categorySlug: place.categorySlug,
      countryCode: place.countryCode,
      locality: place.locality,
      status: 'confirmed' as const,
      assetSlugs: pins.find((pin) => pin.placeSlug === place.placeSlug)?.assetSlugs ?? [],
      networkSlugs: pins.find((pin) => pin.placeSlug === place.placeSlug)?.networkSlugs ?? [],
      routeTypes: pins.find((pin) => pin.placeSlug === place.placeSlug)?.routeTypes ?? [],
      lastConfirmedAt: place.claims[0]?.lastConfirmedAt,
      thumbnail: null,
    },
  }));

  const uniqueAssets = new Map(paymentRows.map((row) => [row.assetSlug, row]));
  const uniqueNetworks = new Map(paymentRows.map((row) => [row.networkSlug, row]));
  const assetRecords = [...uniqueAssets.values()]
    .sort((left, right) => left.assetSlug.localeCompare(right.assetSlug))
    .map((row) => ({
      slug: row.assetSlug,
      symbol: row.assetSymbol,
      name: row.assetName,
      aliases: row.assetAliases ?? [],
      assetType: row.assetType,
      isStablecoin: row.assetStablecoin,
      isWrapped: row.assetWrapped,
      defaultDecimals: row.assetDecimals,
      status: row.assetStatus,
    }));
  const networkRecords = [...uniqueNetworks.values()]
    .sort((left, right) => left.networkSlug.localeCompare(right.networkSlug))
    .map((row) => ({
      slug: row.networkSlug,
      name: row.networkName,
      aliases: row.networkAliases ?? [],
      status: row.networkStatus,
    }));

  const countryCount = new Set(places.map((place) => place.countryCode)).size;
  const cityCount = new Set(places.map((place) => place.locality).filter(Boolean)).size;
  const totalClaims = acceptanceClaimsRecords.length;
  const topAssets = [...new Set(paymentRows.map((row) => row.assetSlug))]
    .sort()
    .map((key) => ({ key, count: paymentRows.filter((row) => row.assetSlug === key).length }));
  const topNetworks = [...new Set(paymentRows.map((row) => row.networkSlug))]
    .sort()
    .map((key) => ({ key, count: paymentRows.filter((row) => row.networkSlug === key).length }));
  const stats = {
    confirmedPhysicalPlaces: places.length,
    confirmedOnlineServices: 0,
    countries: countryCount,
    cities: cityCount,
    staleRecords: 0,
    endedRecords: 0,
    directWalletClaims: acceptanceClaimsRecords.filter(
      (claim) => claim.routeType === 'direct_wallet',
    ).length,
    processorCheckoutClaims: acceptanceClaimsRecords.filter(
      (claim) => claim.routeType === 'processor_checkout',
    ).length,
    howToPayCoverage: totalClaims === 0 ? 0 : 1,
    networkSpecifiedRate: totalClaims === 0 ? 0 : 1,
    evidenceBackedRate: totalClaims === 0 ? 0 : 1,
    reconfirmedWithin90Days: totalClaims === 0 ? 0 : 1,
    reconfirmedWithin180Days: totalClaims === 0 ? 0 : 1,
    staleRate: 0,
    topAssets,
    topNetworks,
  };
  const updates = places.map((place) => ({
    updateKey: boundedPublicIdentifier('confirmed', place.placeSlug),
    updateType: 'newly_confirmed' as const,
    subjectType: 'place' as const,
    subjectSlug: place.placeSlug,
    title: `${place.name} confirmed`,
    summary:
      'Reviewed merchant evidence confirms cryptocurrency acceptance at this physical place.',
    effectiveAt: place.claims[0]?.firstConfirmedAt,
  }));

  const artifacts: Record<string, unknown> = {
    '/data/locations-osm.json': { ...header, records: locationsOsm },
    '/data/acceptance-claims.json': { ...header, records: acceptanceClaimsRecords },
    '/data/place-pins.json': { ...header, records: pins },
    '/data/places.json': { ...header, records: publicPlaces },
    '/data/places.geojson': { ...header, type: 'FeatureCollection', features: geojson },
    '/data/online-services.json': { ...header, records: [] },
    '/data/stats.json': { ...header, stats },
    '/data/updates.json': { ...header, records: updates },
    '/data/assets.json': { ...header, records: assetRecords },
    '/data/networks.json': { ...header, records: networkRecords },
    '/version.json': {
      projectId: 'cryptopaymap',
      siteName: 'CryptoPayMap',
      registryType: 'crypto_payment_acceptance',
      datasetVersion,
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      canonicalOnly: true,
      verificationMarker: 'reviewed_public_records_only',
    },
  };

  const manifestFiles = [];
  for (const path of publicExportPaths.filter((path) => path !== '/data/manifest.json')) {
    const value = artifacts[path];
    if (value === undefined) throw new Error(`Missing generated public artifact: ${path}`);
    const count =
      path === '/version.json' || path === '/data/stats.json'
        ? 1
        : path === '/data/places.geojson'
          ? (value as { features: unknown[] }).features.length
          : (value as { records: unknown[] }).records.length;
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
  artifacts['/data/manifest.json'] = {
    ...header,
    datasetVersion,
    canonicalOnly: true,
    files: manifestFiles,
  };

  await validatePublicArtifactSet(artifacts);
  await mkdir(outputDirectory, { recursive: true });
  for (const path of publicExportPaths) {
    const value = artifacts[path];
    const url =
      path === '/version.json' ? versionPath : new URL(path.replace('/data/', ''), outputDirectory);
    await writeFile(url, canonicalPublicJson(value), 'utf8');
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      source: 'staging_database',
      physicalPlaces: places.length,
      mapPins: pins.length,
      acceptanceClaims: acceptanceClaimsRecords.length,
      acceptedPublicEvidence: evidenceRows.length,
      onlineServices: 0,
      assetRecords: assetRecords.length,
      networkRecords: networkRecords.length,
      datasetVersion,
      artifactCount: Object.keys(artifacts).length,
      snapshotInputDigest: sha256(
        `${datasetVersion}:${places.length}:${acceptanceClaimsRecords.length}`,
      ),
      syntheticFixturesUsed: false,
      candidatePayloadExposed: false,
    }),
  );
}

await main();