import { mkdir, writeFile } from 'node:fs/promises';
import { buildStagingReviewData } from './staging-review-data.ts';
import { buildStagingReviewUpdates } from './staging-review-updates.ts';

const outputDirectory = new URL('../public/data/', import.meta.url);
const data = buildStagingReviewData();
const updates = buildStagingReviewUpdates();
const reviewOrigin = 'https://review.cryptopaymap-staging.pages.dev';

function publicMedia(role, filename, altText) {
  return {
    role,
    url: `${reviewOrigin}/staging-review/media/${filename}`,
    mimeType: 'image/webp',
    width: 320,
    height: 180,
    altText,
    attribution: 'Synthetic staging review artwork by CryptoPayMap',
    licenseSlug: null,
  };
}

const mediaPlace = data.places.records.find(
  (record) => record.placeSlug === 'staging-coffee-tokyo',
);
const mediaPin = data.placePins.records.find(
  (record) => record.placeSlug === 'staging-coffee-tokyo',
);
const mediaService = data.onlineServices.records.find(
  (record) => record.serviceSlug === 'staging-vpn',
);

if (!mediaPlace || !mediaPin || !mediaService) {
  throw new Error('Expected staging Media review records are missing.');
}

const placeCover = publicMedia(
  'cover',
  'place-cover.webp',
  'Abstract synthetic cover artwork for the staging Place review record',
);
const placeGallery = publicMedia(
  'gallery',
  'place-gallery.webp',
  'Abstract synthetic gallery artwork for the staging Place review record',
);
const serviceCover = publicMedia(
  'cover',
  'service-cover.webp',
  'Abstract synthetic cover artwork for the staging Online Service review record',
);
const serviceGallery = publicMedia(
  'gallery',
  'service-gallery.webp',
  'Abstract synthetic gallery artwork for the staging Online Service review record',
);

mediaPlace.addressLine = '1-1 Marunouchi, Chiyoda City';
mediaPlace.postalCode = '100-0005';
mediaPlace.phone = '+81 3 0000 0000';
mediaPlace.description =
  'Synthetic staging café profile used to review practical Place information in selected surfaces.';
mediaPlace.openingHours = 'Mon–Fri 08:00–18:00\nSat–Sun 09:00–17:00';
mediaPlace.amenities = ['wifi', 'outdoor-seating'];
mediaPlace.socialLinks = [
  {
    platform: 'instagram',
    url: 'https://example.com/staging/social/staging-coffee-tokyo',
    handle: '@stagingcoffee',
  },
];
mediaPlace.provenance[0]?.fields.push(
  'addressLine',
  'postalCode',
  'phone',
  'description',
  'openingHours',
  'amenities',
  'socialLinks',
);
mediaPlace.media = [placeCover, placeGallery];
mediaPin.thumbnail = placeCover;
mediaService.media = [serviceCover, serviceGallery];

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
  `Materialized staging review data: ${data.places.records.length} places, ${data.placePins.records.length} map pins, ${data.onlineServices.records.length} online services, ${updates.records.length} updates, with public Media and practical Place profile review fixtures.`,
);
