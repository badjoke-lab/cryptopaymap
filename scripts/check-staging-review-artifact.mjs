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
if (marker.environment !== 'staging-review' || marker.syntheticData !== false) {
  throw new Error('Staging review marker must declare a fixture-free data surface.');
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

const placesText = await readText('data/places.json');
const pinsText = await readText('data/place-pins.json');
const servicesText = await readText('data/online-services.json');
const updatesText = await readText('data/updates.json');
const places = parseJsonArtifact('/data/places.json', placesText);
const pins = parseJsonArtifact('/data/place-pins.json', pinsText);
const services = parseJsonArtifact('/data/online-services.json', servicesText);
const updates = parseJsonArtifact('/data/updates.json', updatesText);
const statsFile = parseJsonArtifact('/data/stats.json', await readText('data/stats.json'));
const stats = statsFile.stats;

const publicPayload = [placesText, pinsText, servicesText, updatesText].join('\n');
for (const forbiddenFixtureMarker of [
  'example.com/staging/',
  'staging-coffee-tokyo',
  'staging-vpn',
  'Synthetic staging',
  'Staging Coffee Tokyo',
]) {
  if (publicPayload.includes(forbiddenFixtureMarker)) {
    throw new Error(`Dummy staging fixture leaked into public review data: ${forbiddenFixtureMarker}`);
  }
}

if (stats.confirmedPhysicalPlaces > places.records.length) {
  throw new Error('Staging physical-place stats exceed exported Place records.');
}
if (stats.confirmedOnlineServices > services.records.length) {
  throw new Error('Staging online-service stats exceed exported Online Service records.');
}
if (pins.records.length > places.records.length) {
  throw new Error('Staging map-pin export exceeds exported Place records.');
}

const representativeRoutes = [
  'index.html',
  'places/index.html',
  'online/index.html',
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

console.log(
  `Fixture-free staging review artifact checks passed: ${places.records.length} places, ${pins.records.length} pins, ${services.records.length} services, ${updates.records.length} updates, ${manifest.files.length} machine-readable files, ${representativeRoutes.length} representative routes.`,
);
