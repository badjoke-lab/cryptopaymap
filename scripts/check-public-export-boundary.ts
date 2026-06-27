import {
  findNonPublicContent,
  hashPublicArtifact,
  PublicExportBoundaryError,
  publicSnapshotDigest,
  validatePublicArtifactSet,
} from '../src/publication/export-boundary';
import { publicExportPaths, type PublicExportPath } from '../src/schemas/public-exports';

const generatedAt = '2026-06-27T00:00:00Z';
const schemaVersion = '1.0.0';
const datasetVersion = '2026.06.27.1';
const header = { schemaVersion, generatedAt };

const evidence = {
  kind: 'official_payment_page',
  evidenceClass: 'a',
  sourceType: 'official_page',
  polarity: 'supporting',
  sourceName: 'Example Coffee',
  sourceUrl: 'https://example.com/payments',
  archiveUrl: null,
  observedAt: generatedAt,
  publishedAt: null,
  summary: 'The official payment page documents Lightning checkout.',
};

const paymentAsset = {
  assetSlug: 'bitcoin',
  assetSymbol: 'BTC',
  networkSlug: 'lightning',
  paymentMethod: 'lightning_invoice',
  contractAddress: null,
  isPrimary: true,
  notes: null,
};

const placeClaim = {
  claimKey: 'example-coffee-lightning',
  entitySlug: 'example-coffee',
  locationSlug: 'example-coffee-tokyo',
  claimScope: 'location_specific',
  acceptanceScope: 'all_checkout',
  status: 'confirmed',
  routeType: 'direct_wallet',
  processorSlug: null,
  howToPay: 'Ask staff to display a Lightning invoice and scan the QR code.',
  instructionsLanguage: 'en',
  merchantReceives: 'crypto',
  restrictions: null,
  firstConfirmedAt: generatedAt,
  lastConfirmedAt: generatedAt,
  nextReviewAt: '2026-12-27T00:00:00Z',
  endedAt: null,
  endedReason: null,
  paymentAssets: [paymentAsset],
  evidence: [evidence],
};

const onlineClaim = {
  ...placeClaim,
  claimKey: 'example-vpn-checkout',
  entitySlug: 'example-vpn',
  locationSlug: null,
  claimScope: 'online_service',
  routeType: 'processor_checkout',
  processorSlug: 'example-processor',
  howToPay: 'Choose cryptocurrency at checkout and follow the processor instructions.',
};

const media = {
  role: 'cover',
  url: 'https://media.example.com/example.webp',
  mimeType: 'image/webp',
  width: 960,
  height: 540,
  altText: 'Exterior of Example Coffee.',
  attribution: 'Photo supplied by Example Coffee.',
  licenseSlug: 'merchant-permission',
};

const provenance = {
  sourceName: 'OpenStreetMap contributors',
  sourceUrl: 'https://www.openstreetmap.org/node/123',
  licenseSlug: 'odbl-1-0',
  attribution: '© OpenStreetMap contributors',
  fields: ['addressLine', 'latitude', 'longitude'],
};

const pin = {
  placeSlug: 'example-coffee-tokyo',
  name: 'Example Coffee',
  categorySlug: 'cafe',
  countryCode: 'JP',
  locality: 'Tokyo',
  latitude: 35.681236,
  longitude: 139.767125,
  status: 'confirmed',
  assetSlugs: ['bitcoin'],
  networkSlugs: ['lightning'],
  routeTypes: ['direct_wallet'],
  lastConfirmedAt: generatedAt,
  thumbnail: media,
};

const pinProperties = Object.fromEntries(
  Object.entries(pin).filter(([key]) => !['latitude', 'longitude'].includes(key)),
);

const artifacts: Record<string, unknown> = {
  '/data/locations-osm.json': {
    ...header,
    records: [
      {
        locationSlug: 'example-coffee-tokyo',
        name: 'Example Coffee',
        addressLine: '1 Example Street',
        locality: 'Tokyo',
        region: 'Tokyo',
        postalCode: '100-0001',
        countryCode: 'JP',
        latitude: 35.681236,
        longitude: 139.767125,
        osmType: 'node',
        osmId: '123',
        websiteUrl: 'https://example.com',
        sourceUrl: 'https://www.openstreetmap.org/node/123',
        attribution: '© OpenStreetMap contributors',
        licenseSlug: 'odbl-1-0',
      },
    ],
  },
  '/data/acceptance-claims.json': { ...header, records: [placeClaim, onlineClaim] },
  '/data/place-pins.json': { ...header, records: [pin] },
  '/data/places.json': {
    ...header,
    records: [
      {
        placeSlug: 'example-coffee-tokyo',
        entitySlug: 'example-coffee',
        name: 'Example Coffee',
        categorySlug: 'cafe',
        entityStatus: 'active',
        locationStatus: 'active',
        addressLine: '1 Example Street',
        locality: 'Tokyo',
        region: 'Tokyo',
        postalCode: '100-0001',
        countryCode: 'JP',
        latitude: 35.681236,
        longitude: 139.767125,
        websiteUrl: 'https://example.com',
        claims: [placeClaim],
        media: [media],
        provenance: [provenance],
      },
    ],
  },
  '/data/places.geojson': {
    ...header,
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [139.767125, 35.681236] },
        properties: pinProperties,
      },
    ],
  },
  '/data/online-services.json': {
    ...header,
    records: [
      {
        serviceSlug: 'example-vpn',
        name: 'Example VPN',
        categorySlug: 'vpn',
        entityStatus: 'active',
        countryCode: null,
        websiteUrl: 'https://vpn.example.com',
        claims: [onlineClaim],
        media: [],
        provenance: [
          {
            ...provenance,
            sourceName: 'Example VPN',
            sourceUrl: 'https://vpn.example.com/payments',
            licenseSlug: 'odc-by-1-0',
            attribution: null,
            fields: ['websiteUrl', 'claims'],
          },
        ],
      },
    ],
  },
  '/data/stats.json': {
    ...header,
    stats: {
      confirmedPhysicalPlaces: 1,
      confirmedOnlineServices: 1,
      countries: 1,
      cities: 1,
      staleRecords: 0,
      endedRecords: 0,
      directWalletClaims: 1,
      processorCheckoutClaims: 1,
      howToPayCoverage: 1,
      networkSpecifiedRate: 1,
      evidenceBackedRate: 1,
      reconfirmedWithin90Days: 1,
      reconfirmedWithin180Days: 1,
      staleRate: 0,
      topAssets: [{ key: 'bitcoin', count: 2 }],
      topNetworks: [{ key: 'lightning', count: 2 }],
    },
  },
  '/data/updates.json': {
    ...header,
    records: [
      {
        updateKey: 'example-coffee-confirmed',
        updateType: 'newly_confirmed',
        subjectType: 'place',
        subjectSlug: 'example-coffee-tokyo',
        title: 'Example Coffee confirmed',
        summary: 'Lightning checkout was confirmed from an official payment page.',
        effectiveAt: generatedAt,
      },
    ],
  },
  '/data/assets.json': {
    ...header,
    records: [
      {
        slug: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        aliases: ['XBT'],
        assetType: 'native',
        isStablecoin: false,
        isWrapped: false,
        defaultDecimals: 8,
        status: 'active',
      },
    ],
  },
  '/data/networks.json': {
    ...header,
    records: [
      {
        slug: 'lightning',
        name: 'Bitcoin Lightning',
        aliases: ['LN'],
        status: 'active',
      },
    ],
  },
  '/version.json': {
    projectId: 'cryptopaymap',
    siteName: 'CryptoPayMap',
    registryType: 'crypto_payment_acceptance',
    datasetVersion,
    schemaVersion,
    generatedAt,
    canonicalOnly: true,
    verificationMarker: 'reviewed_public_records_only',
  },
};

function recordCount(path: PublicExportPath, value: unknown): number {
  if (path === '/version.json' || path === '/data/stats.json') {
    return 1;
  }
  if (path === '/data/places.geojson') {
    return (value as { features: unknown[] }).features.length;
  }
  return (value as { records: unknown[] }).records.length;
}

const inventoryPaths = publicExportPaths.filter((path) => path !== '/data/manifest.json');
artifacts['/data/manifest.json'] = {
  ...header,
  datasetVersion,
  canonicalOnly: true,
  files: inventoryPaths.map((path) => ({
    path,
    mediaType: path === '/data/places.geojson' ? 'application/geo+json' : 'application/json',
    schemaVersion,
    recordCount: recordCount(path, artifacts[path]),
    sha256: hashPublicArtifact(artifacts[path]),
    licenses: ['odc-by-1-0'],
  })),
};

const validated = validatePublicArtifactSet(artifacts);
const digest = publicSnapshotDigest(validated);
if (!/^[a-f0-9]{64}$/.test(digest) || !Object.isFrozen(validated)) {
  throw new Error('Validated release sets must be immutable and have a stable SHA-256 digest.');
}

const detected = findNonPublicContent({ internalMetadata: 'not publishable' });
if (detected.length !== 1) {
  throw new Error('Recursive non-public field detection failed.');
}

const invalidSets: Record<string, unknown>[] = [];

const withExtraFile = structuredClone(artifacts);
withExtraFile['/data/unreviewed.json'] = { records: [] };
invalidSets.push(withExtraFile);

const withMissingFile = structuredClone(artifacts);
delete withMissingFile['/data/networks.json'];
invalidSets.push(withMissingFile);

const withCandidateState = structuredClone(artifacts);
(
  withCandidateState['/data/acceptance-claims.json'] as {
    records: Array<{ status: string }>;
  }
).records[0].status = 'candidate';
invalidSets.push(withCandidateState);

const withUnexpectedField = structuredClone(artifacts);
(
  withUnexpectedField['/data/places.json'] as {
    records: Array<Record<string, unknown>>;
  }
).records[0].internalMetadata = 'not publishable';
invalidSets.push(withUnexpectedField);

const withWrongHash = structuredClone(artifacts);
(
  withWrongHash['/data/manifest.json'] as {
    files: Array<{ path: string; sha256: string }>;
  }
).files.find((entry) => entry.path === '/data/places.json')!.sha256 = '0'.repeat(64);
invalidSets.push(withWrongHash);

const withWrongCount = structuredClone(artifacts);
(
  withWrongCount['/data/manifest.json'] as {
    files: Array<{ path: string; recordCount: number }>;
  }
).files.find((entry) => entry.path === '/data/place-pins.json')!.recordCount = 99;
invalidSets.push(withWrongCount);

const withMismatchedTime = structuredClone(artifacts);
(withMismatchedTime['/data/assets.json'] as { generatedAt: string }).generatedAt =
  '2026-06-28T00:00:00Z';
invalidSets.push(withMismatchedTime);

for (const invalid of invalidSets) {
  try {
    validatePublicArtifactSet(invalid);
    throw new Error('An invalid release set passed validation.');
  } catch (error) {
    if (!(error instanceof PublicExportBoundaryError)) {
      throw error;
    }
  }
}

console.log(`Public export boundary checks passed for ${publicExportPaths.length} artifacts.`);
