import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parsePublicExport } from '../src/schemas/public-exports.ts';
import { buildStagingReviewData } from './staging-review-data.ts';
import { buildStagingReviewUpdates } from './staging-review-updates.ts';

const outputDirectory = new URL('../public/data/', import.meta.url);
const versionPath = new URL('../public/version.json', import.meta.url);
const data = buildStagingReviewData();
const updates = buildStagingReviewUpdates();
const schemaVersion = '1.0.0';
const datasetVersion = 'staging-review-no-fixtures-2026-08-31';
const generatedAt = data.places.generatedAt;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function countRecords(path, value) {
  if (path === '/data/stats.json') return value.stats ? 1 : 0;
  if (Array.isArray(value.records)) return value.records.length;
  throw new Error(`Unsupported staging public export record shape: ${path}`);
}

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
  writeFile(
    new URL('manifest.json', outputDirectory),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  ),
  writeFile(versionPath, `${JSON.stringify(version, null, 2)}\n`, 'utf8'),
]);

console.log(
  `Materialized fixture-free staging review data: ${data.places.records.length} places, ${data.placePins.records.length} map pins, ${data.onlineServices.records.length} online services, ${updates.records.length} updates, ${manifest.files.length} manifest entries.`,
);
