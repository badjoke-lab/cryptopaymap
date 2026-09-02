import { readFile, unlink, writeFile } from 'node:fs/promises';

const sourceUrl = new URL('./materialize-public-data-from-staging-db.ts', import.meta.url);
const temporaryUrl = new URL('./.materialize-public-data-from-staging-db.source-first.tmp.ts', import.meta.url);

let source = await readFile(sourceUrl, 'utf8');

function replaceOnce(pattern: string | RegExp, replacement: string, label: string) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`Source-first materializer patch target changed: ${label}`);
  }
  source = next;
}

replaceOnce(
  "if (!row.entitySlug || !row.howToPay || !row.osmType || row.osmId === null) {",
  "if (!row.entitySlug || !row.howToPay) {",
  'canonical required fields',
);

replaceOnce(
  "    const origin = origins.get(row.candidateId);\n    const element = object(origin?.element);",
  "    const origin = origins.get(row.candidateId);\n    const reviewSeed = object(origin?.reviewSeed);\n    const officialLocationUrl =\n      typeof reviewSeed?.websiteUrl === 'string' ? reviewSeed.websiteUrl : null;\n    const element = object(origin?.element);",
  'origin review seed',
);

replaceOnce(
  "    const osmUrl = `https://www.openstreetmap.org/${row.osmType}/${row.osmId}`;",
  "    const osmUrl =\n      row.osmType && row.osmId !== null\n        ? `https://www.openstreetmap.org/${row.osmType}/${row.osmId}`\n        : null;",
  'optional OSM URL',
);

replaceOnce(
  /    const provenance = \[[\s\S]*?\n    \];\n    return \{/,
  `    const provenance = osmUrl
      ? [
          {
            sourceName: 'OpenStreetMap',
            sourceUrl: osmUrl,
            licenseSlug: 'odbl-1-0',
            attribution: '© OpenStreetMap contributors',
            fields: [
              'name',
              'categorySlug',
              'countryCode',
              'latitude',
              'longitude',
              ...(row.locationWebsiteUrl || row.entityWebsiteUrl ? ['websiteUrl'] : []),
              ...(row.phone ? ['phone'] : []),
              ...(row.openingHours ? ['openingHours'] : []),
            ],
          },
        ]
      : [
          {
            sourceName: 'Official merchant location directory',
            sourceUrl: officialLocationUrl ?? row.locationWebsiteUrl ?? row.entityWebsiteUrl,
            licenseSlug: null,
            attribution: null,
            fields: [
              'name',
              'addressLine',
              'locality',
              'region',
              'postalCode',
              'countryCode',
              'latitude',
              'longitude',
              ...(row.locationWebsiteUrl || row.entityWebsiteUrl || officialLocationUrl
                ? ['websiteUrl']
                : []),
            ],
          },
        ];
    return {`,
  'source-aware provenance',
);

replaceOnce(
  "      osm: { osmUrl, osmType: row.osmType, osmId: String(row.osmId) },",
  "      osm:\n        osmUrl && row.osmType && row.osmId !== null\n          ? { osmUrl, osmType: row.osmType, osmId: String(row.osmId) }\n          : null,",
  'optional OSM metadata',
);

replaceOnce(
  /  const locationsOsm = places\.map\(\(place\) => \(\{[\s\S]*?\n  \}\)\);\n  const publicPlaces/,
  `  const locationsOsm = places.flatMap((place) =>
    place.osm
      ? [
          {
            locationSlug: place.placeSlug,
            name: place.name,
            addressLine: place.addressLine,
            locality: place.locality,
            region: place.region,
            postalCode: place.postalCode,
            countryCode: place.countryCode,
            latitude: place.latitude,
            longitude: place.longitude,
            osmType: place.osm.osmType,
            osmId: place.osm.osmId,
            websiteUrl: place.websiteUrl,
            sourceUrl: place.osm.osmUrl,
            attribution: '© OpenStreetMap contributors',
            licenseSlug: 'odbl-1-0' as const,
          },
        ]
      : [],
  );
  const publicPlaces`,
  'OSM-only auxiliary export',
);

await writeFile(temporaryUrl, source, 'utf8');
try {
  await import(temporaryUrl.href);
} finally {
  await unlink(temporaryUrl).catch(() => undefined);
}
