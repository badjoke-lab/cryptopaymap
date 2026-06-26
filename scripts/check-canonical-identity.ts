import {
  canonicalEntitySchema,
  canonicalLocationSchema,
  entityStatusSchema,
  entityTypeSchema,
  locationStatusSchema,
  osmElementTypeSchema,
} from '../src/schemas/canonical-identity';

const sampleEntity = {
  entityType: 'merchant',
  name: 'Example Merchant',
  slug: 'example-merchant',
  legalName: null,
  websiteUrl: 'https://example.com/',
  countryCode: 'JP',
  entityStatus: 'active',
  visibility: 'hidden',
};

const sampleLocation = {
  name: null,
  slug: 'example-location',
  addressLine: null,
  locality: 'Tokyo',
  region: 'Tokyo',
  postalCode: null,
  countryCode: 'JP',
  latitude: 35,
  longitude: 139,
  locationStatus: 'active',
  visibility: 'hidden',
  websiteUrl: null,
  phone: null,
  osmType: null,
  osmId: null,
};

const checks = [
  entityTypeSchema.safeParse('merchant'),
  entityStatusSchema.safeParse('active'),
  locationStatusSchema.safeParse('temporarily_closed'),
  osmElementTypeSchema.safeParse('relation'),
  canonicalEntitySchema.safeParse(sampleEntity),
  canonicalLocationSchema.safeParse(sampleLocation),
];

const failures = checks.filter((result) => !result.success);
if (failures.length > 0) {
  const issues = failures.flatMap((failure) => (failure.success ? [] : failure.error.issues));
  throw new Error(`Canonical identity schema checks failed: ${JSON.stringify(issues)}`);
}

console.log('Canonical identity checks passed.');
