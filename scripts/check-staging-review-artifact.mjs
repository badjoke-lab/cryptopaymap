import { readFile } from 'node:fs/promises';

async function readText(path) {
  return readFile(new URL(`../dist/${path}`, import.meta.url), 'utf8');
}

async function readBinary(path) {
  return readFile(new URL(`../dist/${path}`, import.meta.url));
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

const places = JSON.parse(await readText('data/places.json'));
const pins = JSON.parse(await readText('data/place-pins.json'));
const services = JSON.parse(await readText('data/online-services.json'));
const stats = JSON.parse(await readText('data/stats.json'));

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
  throw new Error('Staging review must exercise Place, Online Service, and pin Media presentation.');
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
  `Staging review artifact checks passed: ${places.records.length} places, ${pins.records.length} pins, ${services.records.length} services, ${representativeRoutes.length} representative routes, with public Media coverage.`,
);
