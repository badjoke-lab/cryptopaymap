import {
  parsePublicExport,
  publicAcceptanceClaimSchema,
  publicExportPaths,
  publicGeoJsonFeatureSchema,
  publicManifestFileSchema,
  publicMediaSchema,
  publicPlacePinSchema,
  publicVersionSchema,
} from '../src/schemas/public-exports';

const generatedAt = '2026-06-27T00:00:00Z';
const schemaVersion = '1.0.0';

const publicEvidence = {
  kind: 'official_payment_page',
  evidenceClass: 'a',
  sourceType: 'official_page',
  polarity: 'supporting',
  sourceName: 'Example Coffee',
  sourceUrl: 'https://example.com/payments',
  archiveUrl: null,
  observedAt: '2026-06-20T00:00:00Z',
  publishedAt: null,
  summary: 'The official payment page documents Lightning checkout.',
};

const publicPaymentAsset = {
  assetSlug: 'bitcoin',
  assetSymbol: 'BTC',
  networkSlug: 'lightning',
  paymentMethod: 'lightning_invoice',
  contractAddress: null,
  isPrimary: true,
  notes: null,
};

const publicClaim = {
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
  firstConfirmedAt: '2026-06-01T00:00:00Z',
  lastConfirmedAt: '2026-06-20T00:00:00Z',
  nextReviewAt: '2026-12-17T00:00:00Z',
  endedAt: null,
  endedReason: null,
  paymentAssets: [publicPaymentAsset],
  evidence: [publicEvidence],
};

const publicMedia = {
  role: 'cover',
  url: 'https://media.example.com/example-coffee.webp',
  mimeType: 'image/webp',
  width: 960,
  height: 540,
  altText: 'Exterior of Example Coffee.',
  attribution: 'Photo supplied by Example Coffee.',
  licenseSlug: 'merchant-permission',
};

const publicProvenance = {
  sourceName: 'OpenStreetMap contributors',
  sourceUrl: 'https://www.openstreetmap.org/node/123',
  licenseSlug: 'odbl-1-0',
  attribution: '© OpenStreetMap contributors',
  fields: ['addressLine', 'latitude', 'longitude'],
};

const publicPin = {
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
  lastConfirmedAt: '2026-06-20T00:00:00Z',
  thumbnail: publicMedia,
};

const publicPlace = {
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
  claims: [publicClaim],
  media: [publicMedia],
  provenance: [publicProvenance],
};

const onlineClaim = {
  ...publicClaim,
  claimKey: 'example-vpn-checkout',
  entitySlug: 'example-vpn',
  locationSlug: null,
  claimScope: 'online_service',
  routeType: 'processor_checkout',
  processorSlug: 'example-processor',
  howToPay: 'Choose cryptocurrency at checkout and follow the processor instructions.',
};

const publicOnlineService = {
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
      ...publicProvenance,
      sourceName: 'Example VPN',
      sourceUrl: 'https://vpn.example.com/payments',
      licenseSlug: 'odc-by-1-0',
      attribution: null,
      fields: ['websiteUrl', 'claims'],
    },
  ],
};

const publicOsmLocation = {
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
};

const publicAsset = {
  slug: 'bitcoin',
  symbol: 'BTC',
  name: 'Bitcoin',
  aliases: ['XBT'],
  assetType: 'native',
  isStablecoin: false,
  isWrapped: false,
  defaultDecimals: 8,
  status: 'active',
};

const publicNetwork = {
  slug: 'lightning',
  name: 'Bitcoin Lightning',
  aliases: ['LN'],
  status: 'active',
};

const publicStats = {
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
};

const publicUpdate = {
  updateKey: 'example-coffee-confirmed',
  updateType: 'newly_confirmed',
  subjectType: 'place',
  subjectSlug: 'example-coffee-tokyo',
  title: 'Example Coffee confirmed',
  summary: 'Lightning checkout was confirmed from an official payment page.',
  effectiveAt: '2026-06-20T00:00:00Z',
};

const publicGeoJsonFeature = {
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [publicPin.longitude, publicPin.latitude],
  },
  properties: Object.fromEntries(
    Object.entries(publicPin).filter(([key]) => !['latitude', 'longitude'].includes(key)),
  ),
};

const fileHeader = { schemaVersion, generatedAt };
const validExports = {
  '/data/locations-osm.json': { ...fileHeader, records: [publicOsmLocation] },
  '/data/acceptance-claims.json': { ...fileHeader, records: [publicClaim, onlineClaim] },
  '/data/place-pins.json': { ...fileHeader, records: [publicPin] },
  '/data/places.json': { ...fileHeader, records: [publicPlace] },
  '/data/places.geojson': {
    ...fileHeader,
    type: 'FeatureCollection',
    features: [publicGeoJsonFeature],
  },
  '/data/online-services.json': { ...fileHeader, records: [publicOnlineService] },
  '/data/stats.json': { ...fileHeader, stats: publicStats },
  '/data/updates.json': { ...fileHeader, records: [publicUpdate] },
  '/data/assets.json': { ...fileHeader, records: [publicAsset] },
  '/data/networks.json': { ...fileHeader, records: [publicNetwork] },
  '/data/manifest.json': {
    ...fileHeader,
    datasetVersion: '2026.06.27.1',
    canonicalOnly: true,
    files: [
      {
        path: '/data/places.json',
        mediaType: 'application/json',
        schemaVersion,
        recordCount: 1,
        sha256: 'a'.repeat(64),
        licenses: ['odbl-1-0', 'odc-by-1-0'],
      },
    ],
  },
  '/version.json': {
    projectId: 'cryptopaymap',
    siteName: 'CryptoPayMap',
    registryType: 'crypto_payment_acceptance',
    datasetVersion: '2026.06.27.1',
    schemaVersion,
    generatedAt,
    canonicalOnly: true,
    verificationMarker: 'reviewed_public_records_only',
  },
} as const;

for (const path of publicExportPaths) {
  parsePublicExport(path, validExports[path]);
}

const invalidClaims = [
  { ...publicClaim, status: 'candidate' },
  { ...publicClaim, claimKey: '11111111-1111-4111-8111-111111111111' },
  { ...publicClaim, processorSlug: 'unexpected-processor' },
  { ...publicClaim, status: 'ended', endedAt: null, endedReason: null },
  { ...publicClaim, internalNote: 'private review material' },
  { ...publicClaim, paymentAssets: [publicPaymentAsset, publicPaymentAsset] },
];

if (invalidClaims.some((value) => publicAcceptanceClaimSchema.safeParse(value).success)) {
  throw new Error('An invalid or private acceptance-claim projection was accepted.');
}

const invalidMedia = [
  { ...publicMedia, role: 'evidence_image' },
  { ...publicMedia, url: 'http://media.example.com/example.webp' },
  { ...publicMedia, mimeType: 'image/heic' },
  { ...publicMedia, storageKey: 'media/private/original.heic' },
];

if (invalidMedia.some((value) => publicMediaSchema.safeParse(value).success)) {
  throw new Error('An invalid or private media projection was accepted.');
}

const invalidPins = [
  { ...publicPin, status: 'ended' },
  { ...publicPin, assetSlugs: ['bitcoin', 'bitcoin'] },
  { ...publicPin, latitude: 91 },
  { ...publicPin, internalId: '11111111-1111-4111-8111-111111111111' },
];

if (invalidPins.some((value) => publicPlacePinSchema.safeParse(value).success)) {
  throw new Error('An invalid map-pin projection was accepted.');
}

if (
  publicGeoJsonFeatureSchema.safeParse({
    ...publicGeoJsonFeature,
    geometry: { type: 'Point', coordinates: [181, 91] },
  }).success
) {
  throw new Error('Invalid GeoJSON coordinates were accepted.');
}

if (
  publicManifestFileSchema.safeParse({
    ...validExports['/data/manifest.json'],
    files: [
      {
        ...validExports['/data/manifest.json'].files[0],
        path: '/data/private-candidates.json',
      },
    ],
  }).success
) {
  throw new Error('An unrecognized public file was accepted by the manifest.');
}

if (
  publicVersionSchema.safeParse({
    ...validExports['/version.json'],
    canonicalOnly: false,
  }).success
) {
  throw new Error('A non-canonical public dataset marker was accepted.');
}

console.log(`Public export schema checks passed for ${publicExportPaths.length} files.`);
