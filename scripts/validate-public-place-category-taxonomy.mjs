import { readFile } from 'node:fs/promises';

const filePath = process.argv[2] ?? 'public/data/places.json';
const allowed = new Set([
  'restaurant',
  'cafe',
  'bar',
  'retail',
  'lodging',
  'automotive',
  'health',
  'personal-services',
  'professional-services',
  'education',
  'arts-culture',
  'logistics',
]);

const payload = JSON.parse(await readFile(filePath, 'utf8'));
const records = Array.isArray(payload.records) ? payload.records : null;
if (!records) throw new Error(`Expected records[] in ${filePath}.`);

const invalid = [];
const counts = new Map();
for (const place of records) {
  const category = typeof place.categorySlug === 'string' ? place.categorySlug : '';
  if (!allowed.has(category)) {
    invalid.push({ placeSlug: place.placeSlug ?? null, name: place.name ?? null, categorySlug: category || null });
    continue;
  }
  counts.set(category, (counts.get(category) ?? 0) + 1);
}

if (invalid.length > 0) {
  throw new Error(
    `Public Place taxonomy rejected ${invalid.length} record(s): ${JSON.stringify(invalid.slice(0, 50))}`,
  );
}

console.log(
  JSON.stringify({
    taxonomy: 'pass',
    publishedPlaces: records.length,
    allowedCategories: [...allowed],
    categoryCounts: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  }),
);
