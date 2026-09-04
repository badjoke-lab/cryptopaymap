import { readFile } from 'node:fs/promises';

const path = new URL('./materialize-public-data-from-staging-db.ts', import.meta.url);
const source = await readFile(path, 'utf8');

const requiredMarkers = [
  'processorId: acceptanceClaims.processorId',
  'if (!row.entitySlug || !row.howToPay) {',
  'const processorSlugs = new Map(',
  'const reviewSeed = object(origin?.reviewSeed);',
  'const sourceFirstCategorySlug =',
  'const publicDescription = row.description;',
  'processorSlug: row.processorId ? processorSlugs.get(row.processorId) ?? null : null,',
  'const provenance = osmUrl',
  'description: publicDescription,',
  'const locationsOsm = places.flatMap',
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    throw new Error(`canonical source-aware materializer marker missing: ${marker}`);
  }
}

const forbiddenLegacyMarkers = [
  'if (!row.entitySlug || !row.howToPay || !row.osmType || row.osmId === null) {',
  'processorSlug: null,',
  'const locationsOsm = places.map((place) => ({',
];

for (const marker of forbiddenLegacyMarkers) {
  if (source.includes(marker)) {
    throw new Error(`legacy materializer behavior returned: ${marker}`);
  }
}

console.log(
  'Source-aware physical materializer is canonical; compatibility assertion passed without modifying source files.',
);
