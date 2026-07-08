import { and, eq, isNull } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { entities, locations } from '../../db/schema';
import {
  locationCorrectionTargetSchema,
  type LocationCorrectionWorkspaceBackend,
} from './workspace';

export function createDrizzleLocationCorrectionWorkspaceBackend(
  database: CryptoPayMapDatabase,
): LocationCorrectionWorkspaceBackend {
  return {
    async loadLocation(locationId) {
      const rows = await database
        .select({
          id: locations.id,
          entityId: locations.entityId,
          entityName: entities.name,
          name: locations.name,
          slug: locations.slug,
          addressLine: locations.addressLine,
          locality: locations.locality,
          region: locations.region,
          postalCode: locations.postalCode,
          countryCode: locations.countryCode,
          websiteUrl: locations.websiteUrl,
          phone: locations.phone,
          description: locations.description,
          openingHours: locations.openingHours,
          amenities: locations.amenities,
          socialLinks: locations.socialLinks,
          visibility: locations.visibility,
          locationStatus: locations.locationStatus,
          updatedAt: locations.updatedAt,
        })
        .from(locations)
        .innerJoin(entities, eq(locations.entityId, entities.id))
        .where(and(eq(locations.id, locationId), isNull(locations.deletedAt)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return locationCorrectionTargetSchema.parse({
        id: row.id,
        entityId: row.entityId,
        canonicalPath: `/place/${row.slug}`,
        name: row.name ?? row.entityName,
        addressLine: row.addressLine,
        locality: row.locality,
        region: row.region,
        postalCode: row.postalCode,
        countryCode: row.countryCode,
        websiteUrl: row.websiteUrl,
        phone: row.phone,
        description: row.description,
        openingHours: row.openingHours,
        amenities: row.amenities ?? [],
        socialLinks: row.socialLinks ?? [],
        visibility: row.visibility,
        locationStatus: row.locationStatus,
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  };
}
