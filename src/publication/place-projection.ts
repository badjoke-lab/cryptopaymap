import { z } from 'zod';
import {
  canonicalEntitySchema,
  canonicalLocationSchema,
  type CanonicalEntityInput,
  type CanonicalLocationInput,
} from '../schemas/canonical-identity';
import { publicPlaceSchema } from '../schemas/public-exports';

export type PublicPlaceProjection = z.infer<typeof publicPlaceSchema>;

export interface CanonicalPlaceProjectionInput {
  entitySlug: string;
  categorySlug: string;
  entity: CanonicalEntityInput;
  location: CanonicalLocationInput;
  claims: PublicPlaceProjection['claims'];
  media: PublicPlaceProjection['media'];
  provenance: PublicPlaceProjection['provenance'];
}

export class CanonicalPlaceProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalPlaceProjectionError';
  }
}

export function projectCanonicalPlace(input: CanonicalPlaceProjectionInput): PublicPlaceProjection {
  const entity = canonicalEntitySchema.parse(input.entity);
  const location = canonicalLocationSchema.parse(input.location);

  if (entity.visibility !== 'public' || location.visibility !== 'public') {
    throw new CanonicalPlaceProjectionError(
      'Only canonical Entity and Location records explicitly marked public can be projected.',
    );
  }
  if (entity.slug !== null && entity.slug !== input.entitySlug) {
    throw new CanonicalPlaceProjectionError(
      'The requested public Entity slug does not match the canonical Entity slug.',
    );
  }

  const optionalProfile = {
    ...(location.description === undefined ? {} : { description: location.description }),
    ...(location.openingHours === undefined ? {} : { openingHours: location.openingHours }),
    ...(location.amenities === undefined ? {} : { amenities: location.amenities }),
    ...(location.socialLinks === undefined ? {} : { socialLinks: location.socialLinks }),
  };

  return publicPlaceSchema.parse({
    placeSlug: location.slug,
    entitySlug: input.entitySlug,
    name: location.name ?? entity.name,
    categorySlug: input.categorySlug,
    entityStatus: entity.entityStatus,
    locationStatus: location.locationStatus,
    addressLine: location.addressLine,
    locality: location.locality,
    region: location.region,
    postalCode: location.postalCode,
    countryCode: location.countryCode,
    latitude: location.latitude,
    longitude: location.longitude,
    websiteUrl: location.websiteUrl ?? entity.websiteUrl,
    phone: location.phone,
    ...optionalProfile,
    claims: input.claims,
    media: input.media,
    provenance: input.provenance,
  });
}
