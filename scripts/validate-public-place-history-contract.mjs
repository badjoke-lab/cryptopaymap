import { readFile } from 'node:fs/promises';

const placesPath = process.argv[2] ?? 'public/data/places.json';
const historyPath = process.argv[3] ?? 'public/data/place-history.json';
const places = JSON.parse(await readFile(placesPath, 'utf8'));
const history = JSON.parse(await readFile(historyPath, 'utf8'));

if (!Array.isArray(places.records) || !Array.isArray(history.records)) {
  throw new Error('Place and history artifacts must contain records arrays.');
}

const forbiddenKeys = new Set(['id', 'claimId', 'actorId', 'internalNote', 'reasonCode']);
const historyBySlug = new Map();
for (const record of history.records) {
  if (!record || typeof record !== 'object' || typeof record.placeSlug !== 'string') {
    throw new Error('Invalid Place history record.');
  }
  if (historyBySlug.has(record.placeSlug)) {
    throw new Error(`Duplicate Place history record: ${record.placeSlug}`);
  }
  if (!Array.isArray(record.verificationHistory) || record.verificationHistory.length < 1) {
    throw new Error(`Missing verification history: ${record.placeSlug}`);
  }
  if (!Array.isArray(record.changeHistory)) {
    throw new Error(`Missing change history array: ${record.placeSlug}`);
  }
  for (const event of [...record.verificationHistory, ...record.changeHistory]) {
    if (!event || typeof event !== 'object') throw new Error(`Invalid history event: ${record.placeSlug}`);
    for (const key of forbiddenKeys) {
      if (key in event) throw new Error(`Internal field leaked in ${record.placeSlug}: ${key}`);
    }
    if (typeof event.eventType !== 'string' || typeof event.summary !== 'string' || !event.summary.trim()) {
      throw new Error(`Incomplete public history event: ${record.placeSlug}`);
    }
    if (typeof event.effectiveAt !== 'string' || !Number.isFinite(Date.parse(event.effectiveAt))) {
      throw new Error(`Invalid history event time: ${record.placeSlug}`);
    }
  }
  historyBySlug.set(record.placeSlug, record);
}

const publicSlugs = places.records.map((place) => place.placeSlug);
const missing = publicSlugs.filter((slug) => !historyBySlug.has(slug));
const extras = [...historyBySlug.keys()].filter((slug) => !publicSlugs.includes(slug));
if (missing.length || extras.length) {
  throw new Error(
    `Place history coverage mismatch: places=${publicSlugs.length} history=${history.records.length} missing=${missing.length} extras=${extras.length} missingSample=${missing.slice(0, 20).join(',')}`,
  );
}

console.log(
  JSON.stringify({
    publicPlaces: publicSlugs.length,
    historyRecords: history.records.length,
    verificationEvents: history.records.reduce((sum, record) => sum + record.verificationHistory.length, 0),
    changeEvents: history.records.reduce((sum, record) => sum + record.changeHistory.length, 0),
    internalFieldsLeaked: 0,
  }),
);
