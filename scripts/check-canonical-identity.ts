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

void canonicalEntitySchema;
void canonicalLocationSchema;
void entityStatusSchema;
void entityTypeSchema;
void locationStatusSchema;
void osmElementTypeSchema;
void sampleEntity;
void sampleLocation;

console.log('Canonical identity checks loaded.');
