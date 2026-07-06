import { mkdir, writeFile } from 'node:fs/promises';
import { buildStagingReviewData } from './staging-review-data.ts';
import { buildStagingReviewUpdates } from './staging-review-updates.ts';

const outputDirectory = new URL('../public/data/', import.meta.url);
const data = buildStagingReviewData();
const updates = buildStagingReviewUpdates();

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(new URL('places.json', outputDirectory), `${JSON.stringify(data.places, null, 2)}\n`),
  writeFile(
    new URL('place-pins.json', outputDirectory),
    `${JSON.stringify(data.placePins, null, 2)}\n`,
  ),
  writeFile(
    new URL('online-services.json', outputDirectory),
    `${JSON.stringify(data.onlineServices, null, 2)}\n`,
  ),
  writeFile(new URL('stats.json', outputDirectory), `${JSON.stringify(data.stats, null, 2)}\n`),
  writeFile(new URL('updates.json', outputDirectory), `${JSON.stringify(updates, null, 2)}\n`),
]);

console.log(
  `Materialized staging review data: ${data.places.records.length} places, ${data.placePins.records.length} map pins, ${data.onlineServices.records.length} online services, ${updates.records.length} updates.`,
);
