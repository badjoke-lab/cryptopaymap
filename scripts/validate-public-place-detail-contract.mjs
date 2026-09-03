import { readFile } from 'node:fs/promises';

const filePath = process.argv[2] ?? 'public/data/places.json';
const payload = JSON.parse(await readFile(filePath, 'utf8'));
const records = Array.isArray(payload.records) ? payload.records : null;

if (!records) {
  throw new Error(`Place detail contract validation expected records[] in ${filePath}.`);
}
if (records.length < 1) {
  throw new Error(`Place detail contract validation expected at least one published Place in ${filePath}.`);
}

const failures = [];
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const generatedDescriptionMarker =
  'This record tracks verified in-person cryptocurrency payment acceptance.';
const add = (place, field, reason) => {
  failures.push(`${place.placeSlug ?? place.name ?? '<unknown>'}: ${field} ${reason}`);
};
const provenanceCovers = (place, field) =>
  Array.isArray(place.provenance) &&
  place.provenance.some(
    (entry) => Array.isArray(entry?.fields) && entry.fields.includes(field),
  );

for (const place of records) {
  if (!nonEmpty(place.name)) add(place, 'name', 'must be non-empty');
  if (!nonEmpty(place.categorySlug)) {
    add(place, 'categorySlug', 'must be non-empty');
  } else if (place.categorySlug === 'merchant') {
    add(place, 'categorySlug', 'must not use the generic merchant fallback');
  }
  if (!nonEmpty(place.description)) {
    add(place, 'description', 'must be non-empty');
  } else if (place.description.includes(generatedDescriptionMarker)) {
    add(place, 'description', 'must not use the generated thin-profile fallback');
  }
  if (!provenanceCovers(place, 'categorySlug')) {
    add(place, 'provenance', 'must identify the source of categorySlug');
  }
  if (!provenanceCovers(place, 'description')) {
    add(place, 'provenance', 'must identify the source of description');
  }
  if (!finiteNumber(place.latitude) || !finiteNumber(place.longitude)) {
    add(place, 'coordinates', 'must contain finite latitude and longitude');
  }

  if (!Array.isArray(place.claims) || place.claims.length < 1) {
    add(place, 'claims', 'must contain at least one published acceptance claim');
    continue;
  }

  for (const [claimIndex, claim] of place.claims.entries()) {
    const prefix = `claims[${claimIndex}]`;
    if (!nonEmpty(claim.routeType)) add(place, `${prefix}.routeType`, 'must be non-empty');
    if (!nonEmpty(claim.howToPay)) add(place, `${prefix}.howToPay`, 'must be non-empty');
    if (!nonEmpty(claim.merchantReceives)) {
      add(place, `${prefix}.merchantReceives`, 'must be non-empty');
    }
    if (!nonEmpty(claim.lastConfirmedAt)) {
      add(place, `${prefix}.lastConfirmedAt`, 'must be present');
    }
    if (claim.status !== 'ended' && !nonEmpty(claim.nextReviewAt)) {
      add(place, `${prefix}.nextReviewAt`, 'must be scheduled for active/stale records');
    }
    if (claim.routeType === 'processor_checkout' && !nonEmpty(claim.processorSlug)) {
      add(place, `${prefix}.processorSlug`, 'is required for processor checkout');
    }

    if (!Array.isArray(claim.paymentAssets) || claim.paymentAssets.length < 1) {
      add(place, `${prefix}.paymentAssets`, 'must contain at least one payment combination');
    } else {
      for (const [paymentIndex, payment] of claim.paymentAssets.entries()) {
        const paymentPrefix = `${prefix}.paymentAssets[${paymentIndex}]`;
        if (!nonEmpty(payment.assetSlug)) add(place, `${paymentPrefix}.assetSlug`, 'must be non-empty');
        if (!nonEmpty(payment.networkSlug)) {
          add(place, `${paymentPrefix}.networkSlug`, 'must be non-empty');
        }
        if (!nonEmpty(payment.paymentMethod)) {
          add(place, `${paymentPrefix}.paymentMethod`, 'must be non-empty');
        }
      }
    }

    if (!Array.isArray(claim.evidence) || claim.evidence.length < 1) {
      add(place, `${prefix}.evidence`, 'must contain at least one public evidence record');
    }
  }
}

if (failures.length > 0) {
  const shown = failures.slice(0, 100);
  const remainder = failures.length - shown.length;
  throw new Error(
    [
      `Public Place detail contract failed with ${failures.length} violation(s) across ${records.length} record(s).`,
      ...shown.map((failure) => `- ${failure}`),
      ...(remainder > 0 ? [`- ...and ${remainder} more violation(s)`] : []),
    ].join('\n'),
  );
}

console.log(
  JSON.stringify({
    placeDetailContract: 'pass',
    publishedPlaces: records.length,
    requiredProfileFields: ['categorySlug', 'description', 'coordinates'],
    forbiddenProfileFallbacks: [generatedDescriptionMarker],
    requiredProfileProvenance: ['categorySlug', 'description'],
    requiredPaymentFields: [
      'routeType',
      'howToPay',
      'merchantReceives',
      'lastConfirmedAt',
      'nextReviewAt',
      'paymentAssets.assetSlug',
      'paymentAssets.networkSlug',
      'paymentAssets.paymentMethod',
      'evidence',
    ],
  }),
);
