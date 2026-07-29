import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parsePublicExport } from '../src/schemas/public-exports.ts';
import { buildStagingReviewData } from './staging-review-data.ts';
import { buildStagingReviewUpdates } from './staging-review-updates.ts';

const outputDirectory = new URL('../public/data/', import.meta.url);
const versionPath = new URL('../public/version.json', import.meta.url);
const data = buildStagingReviewData();
const updates = buildStagingReviewUpdates();
const reviewOrigin = 'https://review.cryptopaymap-staging.pages.dev';
const schemaVersion = '1.0.0';
const datasetVersion = 'staging-review-2026-07-05';
const generatedAt = data.places.generatedAt;

function publicMedia(role, filename, altText) {
  return {
    role,
    url: `${reviewOrigin}/staging-review/media/${filename}`,
    mimeType: 'image/webp',
    width: 320,
    height: 180,
    altText,
    attribution: 'Synthetic staging review artwork by CryptoPayMap',
    licenseSlug: null,
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function countRecords(path, value) {
  if (path === '/data/stats.json') return value.stats ? 1 : 0;
  if (Array.isArray(value.records)) return value.records.length;
  throw new Error(`Unsupported staging public export record shape: ${path}`);
}

const mediaPlace = data.places.records.find(
  (record) => record.placeSlug === 'staging-coffee-tokyo',
);
const mediaPin = data.placePins.records.find(
  (record) => record.placeSlug === 'staging-coffee-tokyo',
);
const mediaService = data.onlineServices.records.find(
  (record) => record.serviceSlug === 'staging-vpn',
);

if (!mediaPlace || !mediaPin || !mediaService) {
  throw new Error('Expected staging Media review records are missing.');
}

const placeCover = publicMedia(
  'cover',
  'place-cover.webp',
  'Abstract synthetic cover artwork for the staging Place review record',
);
const placeGallery = publicMedia(
  'gallery',
  'place-gallery.webp',
  'Abstract synthetic gallery artwork for the staging Place review record',
);
const serviceCover = publicMedia(
  'cover',
  'service-cover.webp',
  'Abstract synthetic cover artwork for the staging Online Service review record',
);
const serviceGallery = publicMedia(
  'gallery',
  'service-gallery.webp',
  'Abstract synthetic gallery artwork for the staging Online Service review record',
);

mediaPlace.addressLine = '1-1 Marunouchi, Chiyoda City';
mediaPlace.postalCode = '100-0005';
mediaPlace.phone = '+81 3 0000 0000';
mediaPlace.description =
  'Synthetic staging café profile used to review practical Place information in selected surfaces.';
mediaPlace.openingHours = 'Mon–Fri 08:00–18:00\nSat–Sun 09:00–17:00';
mediaPlace.amenities = ['wifi', 'outdoor-seating'];
mediaPlace.socialLinks = [
  {
    platform: 'instagram',
    url: 'https://example.com/staging/social/staging-coffee-tokyo',
    handle: '@stagingcoffee',
  },
];
mediaPlace.provenance[0]?.fields.push(
  'addressLine',
  'postalCode',
  'phone',
  'description',
  'openingHours',
  'amenities',
  'socialLinks',
);
mediaPlace.media = [placeCover, placeGallery];
mediaPin.thumbnail = placeCover;
mediaService.media = [serviceCover, serviceGallery];

const publicFiles = [
  {
    path: '/data/places.json',
    fileUrl: new URL('places.json', outputDirectory),
    value: data.places,
    mediaType: 'application/json',
    licenses: ['cpm-public-data'],
  },
  {
    path: '/data/place-pins.json',
    fileUrl: new URL('place-pins.json', outputDirectory),
    value: data.placePins,
    mediaType: 'application/json',
    licenses: ['cpm-public-data'],
  },
  {
    path: '/data/online-services.json',
    fileUrl: new URL('online-services.json', outputDirectory),
    value: data.onlineServices,
    mediaType: 'application/json',
    licenses: ['cpm-public-data'],
  },
  {
    path: '/data/stats.json',
    fileUrl: new URL('stats.json', outputDirectory),
    value: { schemaVersion, generatedAt, stats: data.stats },
    mediaType: 'application/json',
    licenses: ['cpm-public-data'],
  },
  {
    path: '/data/updates.json',
    fileUrl: new URL('updates.json', outputDirectory),
    value: updates,
    mediaType: 'application/json',
    licenses: ['cpm-public-data'],
  },
];

for (const file of publicFiles) {
  if (file.value.generatedAt !== generatedAt || file.value.schemaVersion !== schemaVersion) {
    throw new Error(`Staging public export identity mismatch: ${file.path}`);
  }
  parsePublicExport(file.path, file.value);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  publicFiles.map((file) =>
    writeFile(file.fileUrl, `${JSON.stringify(file.value, null, 2)}\n`, 'utf8'),
  ),
);

const manifestEntries = [];
for (const file of publicFiles) {
  const bytes = await readFile(file.fileUrl);
  const parsed = JSON.parse(bytes.toString('utf8'));
  parsePublicExport(file.path, parsed);
  manifestEntries.push({
    path: file.path,
    mediaType: file.mediaType,
    schemaVersion,
    recordCount: countRecords(file.path, parsed),
    sha256: sha256(bytes),
    licenses: file.licenses,
  });
}

const manifest = {
  schemaVersion,
  generatedAt,
  datasetVersion,
  canonicalOnly: true,
  files: manifestEntries,
};
const version = {
  projectId: 'cryptopaymap',
  siteName: 'CryptoPayMap',
  registryType: 'crypto_payment_acceptance',
  datasetVersion,
  schemaVersion,
  generatedAt,
  canonicalOnly: true,
  verificationMarker: 'reviewed_public_records_only',
};

parsePublicExport('/data/manifest.json', manifest);
parsePublicExport('/version.json', version);
await Promise.all([
  writeFile(new URL('manifest.json', outputDirectory), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  writeFile(versionPath, `${JSON.stringify(version, null, 2)}\n`, 'utf8'),
]);

console.log(
  `Materialized staging review data: ${data.places.records.length} places, ${data.placePins.records.length} map pins, ${data.onlineServices.records.length} online services, ${updates.records.length} updates, ${manifest.files.length} manifest entries, with public Media and practical Place profile review fixtures.`,
);
