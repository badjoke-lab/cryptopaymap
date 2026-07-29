import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

async function readText(path) {
  return readFile(new URL(`../dist/${path}`, import.meta.url), 'utf8');
}

async function readBinary(path) {
  return readFile(new URL(`../dist/${path}`, import.meta.url));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJsonArtifact(path, text) {
  if (text.trimStart().startsWith('<')) {
    throw new Error(`Staging public JSON path resolved to HTML: ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Staging public JSON path is not valid JSON: ${path}`);
  }
}

function countRecords(path, value) {
  if (path === '/data/stats.json') return value.stats ? 1 : 0;
  if (Array.isArray(value.records)) return value.records.length;
  throw new Error(`Unsupported staging public export record shape: ${path}`);
}

const marker = JSON.parse(await readText('staging-review.json'));
if (marker.environment !== 'staging-review' || marker.syntheticData !== true) {
  throw new Error('Staging review marker is missing or invalid.');
}
if (marker.indexingAllowed !== false) {
  throw new Error('Staging review artifact must explicitly disable indexing.');
}

const headers = await readText('_headers');
if (!headers.includes('X-Robots-Tag: noindex, nofollow, noarchive')) {
  throw new Error('Staging review artifact is missing the global noindex header.');
}

const robots = await readText('robots.txt');
if (!robots.includes('Disallow: /')) {
  throw new Error('Staging review robots policy must exclude crawling.');
}

const versionText = await readText('version.json');
const manifestText = await readText('data/manifest.json');
const version = parseJsonArtifact('/version.json', versionText);
const manifest = parseJsonArtifact('/data/manifest.json', manifestText);
const expectedPublicPaths = new Set([
  '/data/places.json',
  '/data/place-pins.json',
  '/data/online-services.json',
  '/data/stats.json',
  '/data/updates.json',
]);

if (
  version.projectId !== 'cryptopaymap' ||
  version.siteName !== 'CryptoPayMap' ||
  version.registryType !== 'crypto_payment_acceptance' ||
  version.canonicalOnly !== true ||
  version.verificationMarker !== 'reviewed_public_records_only'
) {
  throw new Error('Staging public version metadata is invalid.');
}
if (
  manifest.canonicalOnly !== true ||
  manifest.datasetVersion !== version.datasetVersion ||
  manifest.schemaVersion !== version.schemaVersion ||
  manifest.generatedAt !== version.generatedAt ||
  !Array.isArray(manifest.files)
) {
  throw new Error('Staging public manifest identity does not match version metadata.');
}

const manifestPaths = new Set();
for (const entry of manifest.files) {
  if (!expectedPublicPaths.has(entry.path)) {
    throw new Error(`Unexpected staging public manifest path: ${entry.path}`);
  }
  if (manifestPaths.has(entry.path)) {
    throw new Error(`Duplicate staging public manifest path: ${entry.path}`);
  }
  manifestPaths.add(entry.path);
  if (
    entry.mediaType !== 'application/json' ||
    entry.schemaVersion !== version.schemaVersion ||
    !Array.isArray(entry.licenses) ||
    entry.licenses.length === 0
  ) {
    throw new Error(`Invalid staging public manifest entry: ${entry.path}`);
  }
  const artifactPath = entry.path.replace(/^\//, '');
  const bytes = await readBinary(artifactPath);
  const text = bytes.toString('utf8');
  const value = parseJsonArtifact(entry.path, text);
  if (sha256(bytes) !== entry.sha256) {
    throw new Error(`Staging public manifest digest mismatch: ${entry.path}`);
  }
  if (countRecords(entry.path, value) !== entry.recordCount) {
    throw new Error(`Staging public manifest record-count mismatch: ${entry.path}`);
  }
  if (value.schemaVersion !== version.schemaVersion || value.generatedAt !== version.generatedAt) {
    throw new Error(`Staging public file identity mismatch: ${entry.path}`);
  }
}
if (
  manifestPaths.size !== expectedPublicPaths.size ||
  [...expectedPublicPaths].some((path) => !manifestPaths.has(path))
) {
  throw new Error('Staging public manifest does not enumerate the complete generated file set.');
}

const places = parseJsonArtifact('/data/places.json', await readText('data/places.json'));
const pins = parseJsonArtifact('/data/place-pins.json', await readText('data/place-pins.json'));
const services = parseJsonArtifact(
  '/data/online-services.json',
  await readText('data/online-services.json'),
);
const statsFile = parseJsonArtifact('/data/stats.json', await readText('data/stats.json'));
const stats = statsFile.stats;

if (places.records.length < 15) throw new Error('Staging review needs at least 15 Place records.');
if (pins.records.length < 12) throw new Error('Staging review needs at least 12 visible map pins.');
if (services.records.length < 8) {
  throw new Error('Staging review needs at least 8 Online Service records.');
}
if (stats.confirmedPhysicalPlaces < 10 || stats.confirmedOnlineServices < 5) {
  throw new Error('Staging Stats do not contain enough synthetic review coverage.');
}

for (const record of [...places.records, ...services.records]) {
  if (!record.name.startsWith('Staging ')) {
    throw new Error(`Unexpected staging record name: ${record.name}`);
  }
}

const placeWithMedia = places.records.find((record) => record.media.length >= 2);
const serviceWithMedia = services.records.find((record) => record.media.length >= 2);
const pinWithThumbnail = pins.records.find((record) => record.thumbnail !== null);

if (!placeWithMedia || !serviceWithMedia || !pinWithThumbnail) {
  throw new Error(
    'Staging review must exercise Place, Online Service, and pin Media presentation.',
  );
}

for (const path of [
  'staging-review/media/place-cover.webp',
  'staging-review/media/place-gallery.webp',
  'staging-review/media/service-cover.webp',
  'staging-review/media/service-gallery.webp',
]) {
  const file = await readBinary(path);
  if (file.length < 100 || file.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw new Error(`Invalid staging Media fixture: ${path}`);
  }
}

const representativeRoutes = [
  'index.html',
  'places/index.html',
  'place/staging-coffee-tokyo/index.html',
  'online/index.html',
  'service/staging-vpn/index.html',
  'stats/index.html',
  'updates/index.html',
  'roadmap/index.html',
  'changelog/index.html',
  'about/index.html',
  'methodology/index.html',
  'data/index.html',
  'privacy/index.html',
  'terms/index.html',
  'disclaimer/index.html',
  'contact/index.html',
  'support/index.html',
  'partners/index.html',
];

for (const route of representativeRoutes) {
  const html = await readText(route);
  if (!html.includes('<!DOCTYPE html>') && !html.includes('<!doctype html>')) {
    throw new Error(`Staging route did not produce an HTML document: ${route}`);
  }
}

const placeDetailHtml = await readText('place/staging-coffee-tokyo/index.html');
if (
  !placeDetailHtml.includes('/staging-review/media/place-cover.webp') ||
  !placeDetailHtml.includes('/staging-review/media/place-gallery.webp')
) {
  throw new Error('Staging Place detail does not expose both cover and gallery Media fixtures.');
}
if (
  !placeDetailHtml.includes('Before you visit') ||
  !placeDetailHtml.includes(
    'Synthetic staging café profile used to review practical Place information',
  ) ||
  !placeDetailHtml.includes('Mon–Fri 08:00–18:00') ||
  !placeDetailHtml.includes('Outdoor Seating') ||
  !placeDetailHtml.includes('@stagingcoffee') ||
  !placeDetailHtml.includes('+81 3 0000 0000')
) {
  throw new Error('Staging Place detail does not expose the complete practical profile fixture.');
}

const onlineIndexHtml = await readText('online/index.html');
if (
  !onlineIndexHtml.includes('/staging-review/media/service-cover.webp') ||
  !onlineIndexHtml.includes('No approved public image')
) {
  throw new Error('Staging Online index must exercise Media and no-Media card states.');
}

const serviceDetailHtml = await readText('service/staging-vpn/index.html');
if (
  !serviceDetailHtml.includes('/staging-review/media/service-cover.webp') ||
  !serviceDetailHtml.includes('/staging-review/media/service-gallery.webp')
) {
  throw new Error('Staging Online detail does not expose both cover and gallery Media fixtures.');
}

console.log(
  `Staging review artifact checks passed: ${places.records.length} places, ${pins.records.length} pins, ${services.records.length} services, ${manifest.files.length} machine-readable files, ${representativeRoutes.length} representative routes, with public Media and practical Place profile coverage.`,
);
