import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('./materialize-public-data-from-staging-db.ts', import.meta.url);
let source = await readFile(path, 'utf8');

function replaceOnce(oldValue, newValue, label) {
  if (!source.includes(oldValue)) {
    throw new Error(`materializer patch target changed: ${label}`);
  }
  source = source.replace(oldValue, newValue);
}

replaceOnce(
  "if (!row.entitySlug || !row.howToPay || !row.osmType || row.osmId === null) {",
  "if (!row.entitySlug || !row.howToPay) {",
  'canonical required fields',
);
replaceOnce(
  "      routeType: acceptanceClaims.routeType,\n      howToPay: acceptanceClaims.howToPay,",
  "      routeType: acceptanceClaims.routeType,\n      processorId: acceptanceClaims.processorId,\n      howToPay: acceptanceClaims.howToPay,",
  'claim processor selection',
);
replaceOnce(
  "  const candidateIds = placeRows.map((row) => row.candidateId);\n\n  const paymentRows =",
  `  const candidateIds = placeRows.map((row) => row.candidateId);
+  const processorIds = [
+    ...new Set(placeRows.map((row) => row.processorId).filter((value): value is string => value !== null)),
+  ];
+  const processorRows =
+    processorIds.length > 0
+      ? await db
+          .select({ id: entities.id, slug: entities.slug })
+          .from(entities)
+          .where(inArray(entities.id, processorIds))
+      : [];
+  const processorSlugs = new Map(
+    processorRows.map((row) => [row.id, row.slug]).filter((entry): entry is [string, string] => entry[1] !== null),
+  );
+
+  const paymentRows =`.replace(/^\+/gm, ''),
  'processor registry lookup',
);
replaceOnce(
  "    const origin = origins.get(row.candidateId);\n    const element = object(origin?.element);",
  "    const origin = origins.get(row.candidateId);\n    const reviewSeed = object(origin?.reviewSeed);\n    const officialLocationUrl =\n      typeof reviewSeed?.websiteUrl === 'string' ? reviewSeed.websiteUrl : null;\n    const element = object(origin?.element);",
  'origin review seed',
);
replaceOnce(
  "    const categorySlug = categoryFromTags(tags);",
  `    const entityNameKey = row.entityName.toLowerCase();
    const sourceFirstCategorySlug =
      entityNameKey.includes('chipotle') ||
      entityNameKey.includes('steak n shake') ||
      entityNameKey.includes("steak 'n shake")
        ? 'restaurant'
        : null;
    const inferredOsmCategorySlug = categoryFromTags(tags);
    const broadOsmCategory = ['amenity', 'tourism', 'shop', 'office', 'craft', 'leisure', 'healthcare']
      .map((key) => tags[key]?.trim().toLowerCase())
      .find((value) => Boolean(value));
    const categorySlug =
      sourceFirstCategorySlug ??
      (inferredOsmCategorySlug !== 'merchant'
        ? inferredOsmCategorySlug
        : broadOsmCategory
          ? publicSlug(broadOsmCategory)
          : 'merchant');
    const publicDescription = row.description;`,
  'physical place category and description',
);
replaceOnce(
  "    const osmUrl = `https://www.openstreetmap.org/${row.osmType}/${row.osmId}`;",
  "    const osmUrl =\n      row.osmType && row.osmId !== null\n        ? `https://www.openstreetmap.org/${row.osmType}/${row.osmId}`\n        : null;",
  'optional OSM URL',
);
replaceOnce(
  "      processorSlug: null,",
  "      processorSlug: row.processorId ? processorSlugs.get(row.processorId) ?? null : null,",
  'public processor slug',
);

const provenancePattern = /    const provenance = \[[\s\S]*?\n    \];\n    return \{/;
if (!provenancePattern.test(source)) {
  throw new Error('materializer patch target changed: provenance');
}
source = source.replace(
  provenancePattern,
  `    const provenance = osmUrl
      ? [
          {
            sourceName: 'OpenStreetMap',
            sourceUrl: osmUrl,
            licenseSlug: 'odbl-1-0',
            attribution: '© OpenStreetMap contributors',
            fields: [
              'name',
              ...(sourceFirstCategorySlug ? [] : ['categorySlug']),
              'countryCode',
              'latitude',
              'longitude',
              ...(row.locationWebsiteUrl || row.entityWebsiteUrl ? ['websiteUrl'] : []),
              ...(row.phone ? ['phone'] : []),
              ...(row.openingHours ? ['openingHours'] : []),
              ...(row.description ? ['description'] : []),
            ],
          },
          ...(
            sourceFirstCategorySlug
              ? [
                  {
                    sourceName: 'CryptoPayMap normalized place profile',
                    sourceUrl: null,
                    licenseSlug: null,
                    attribution: null,
                    fields: ['categorySlug'],
                  },
                ]
              : []
          ),
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
              ...(row.phone ? ['phone'] : []),
              ...(row.openingHours ? ['openingHours'] : []),
              ...(row.amenities?.length ? ['amenities'] : []),
              ...(row.description ? ['description'] : []),
            ],
          },
          {
            sourceName: 'CryptoPayMap normalized place profile',
            sourceUrl: null,
            licenseSlug: null,
            attribution: null,
            fields: ['categorySlug'],
          },
        ];
    return {`,
);

replaceOnce(
  "      description: row.description,",
  "      description: publicDescription,",
  'public place description',
);
replaceOnce(
  "      osm: { osmUrl, osmType: row.osmType, osmId: String(row.osmId) },",
  "      osm:\n        osmUrl && row.osmType && row.osmId !== null\n          ? { osmUrl, osmType: row.osmType, osmId: String(row.osmId) }\n          : null,",
  'optional OSM metadata',
);

const locationsPattern = /  const locationsOsm = places\.map\(\(place\) => \(\{[\s\S]*?\n  \}\)\);\n  const publicPlaces/;
if (!locationsPattern.test(source)) {
  throw new Error('materializer patch target changed: OSM auxiliary export');
}
source = source.replace(
  locationsPattern,
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
);

await writeFile(path, source, 'utf8');
console.log('Prepared source-aware physical materializer with normalized category, canonical processor identity, and source-backed profile provenance for isolated staging review.');
