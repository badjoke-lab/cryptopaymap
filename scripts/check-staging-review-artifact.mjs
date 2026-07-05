import { readFile } from 'node:fs/promises';

async function readText(path) {
  return readFile(new URL(`../dist/${path}`, import.meta.url), 'utf8');
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

console.log(
  `Staging review artifact checks passed: ${places.records.length} places, ${pins.records.length} pins, ${services.records.length} services.`,
);
