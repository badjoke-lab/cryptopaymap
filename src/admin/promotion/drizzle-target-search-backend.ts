import { and, asc, eq, ilike, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { acceptanceClaims, entities, locations } from '../../db/schema';
import type {
  CandidateCanonicalTargetOption,
  CandidateCanonicalTargetSearchBackend,
} from './target-selection';

interface PhysicalTargetRow {
  entityId: string;
  entityName: string;
  entitySlug: string | null;
  entityWebsiteUrl: string | null;
  entityCountryCode: string | null;
  entityStatus: 'active' | 'unknown';
  entityVisibility: 'public' | 'hidden' | 'temporarily_hidden';
  entityUpdatedAt: Date;
  locationId: string;
  locationName: string | null;
  locationSlug: string;
  addressLine: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  latitude: string;
  longitude: string;
  locationStatus: 'active' | 'temporarily_closed' | 'unknown';
  locationVisibility: 'public' | 'hidden' | 'temporarily_hidden';
  locationWebsiteUrl: string | null;
  locationUpdatedAt: Date;
}

interface OnlineTargetRow {
  entityId: string;
  entityName: string;
  entitySlug: string;
  entityWebsiteUrl: string | null;
  entityCountryCode: string | null;
  entityStatus: 'active' | 'unknown';
  entityVisibility: 'public' | 'hidden' | 'temporarily_hidden';
  entityUpdatedAt: Date;
}

async function loadClaimsByLocation(database: CryptoPayMapDatabase, locationIds: string[]) {
  if (locationIds.length === 0)
    return new Map<string, CandidateCanonicalTargetOption['existingClaims']>();
  const rows = await database
    .select({
      id: acceptanceClaims.id,
      locationId: acceptanceClaims.locationId,
      claimScope: acceptanceClaims.claimScope,
      routeType: acceptanceClaims.routeType,
      claimStatus: acceptanceClaims.claimStatus,
      visibility: acceptanceClaims.visibility,
      howToPay: acceptanceClaims.howToPay,
      updatedAt: acceptanceClaims.updatedAt,
    })
    .from(acceptanceClaims)
    .where(
      and(inArray(acceptanceClaims.locationId, locationIds), isNull(acceptanceClaims.deletedAt)),
    )
    .orderBy(acceptanceClaims.id);
  const result = new Map<string, CandidateCanonicalTargetOption['existingClaims']>();
  for (const row of rows) {
    if (row.locationId === null) continue;
    const claims = result.get(row.locationId) ?? [];
    claims.push({
      id: row.id,
      claimScope: row.claimScope,
      routeType: row.routeType,
      claimStatus: row.claimStatus,
      visibility: row.visibility,
      howToPay: row.howToPay,
      updatedAt: row.updatedAt.toISOString(),
    });
    result.set(row.locationId, claims);
  }
  return result;
}

async function loadClaimsByEntity(database: CryptoPayMapDatabase, entityIds: string[]) {
  if (entityIds.length === 0)
    return new Map<string, CandidateCanonicalTargetOption['existingClaims']>();
  const rows = await database
    .select({
      id: acceptanceClaims.id,
      entityId: acceptanceClaims.entityId,
      claimScope: acceptanceClaims.claimScope,
      routeType: acceptanceClaims.routeType,
      claimStatus: acceptanceClaims.claimStatus,
      visibility: acceptanceClaims.visibility,
      howToPay: acceptanceClaims.howToPay,
      updatedAt: acceptanceClaims.updatedAt,
    })
    .from(acceptanceClaims)
    .where(
      and(
        inArray(acceptanceClaims.entityId, entityIds),
        isNull(acceptanceClaims.locationId),
        isNull(acceptanceClaims.deletedAt),
      ),
    )
    .orderBy(acceptanceClaims.id);
  const result = new Map<string, CandidateCanonicalTargetOption['existingClaims']>();
  for (const row of rows) {
    const claims = result.get(row.entityId) ?? [];
    claims.push({
      id: row.id,
      claimScope: row.claimScope,
      routeType: row.routeType,
      claimStatus: row.claimStatus,
      visibility: row.visibility,
      howToPay: row.howToPay,
      updatedAt: row.updatedAt.toISOString(),
    });
    result.set(row.entityId, claims);
  }
  return result;
}

async function searchPhysicalTargets(
  database: CryptoPayMapDatabase,
  query: string,
  limit: number,
): Promise<CandidateCanonicalTargetOption[]> {
  const pattern = `%${query}%`;
  const rows = (await database
    .select({
      entityId: entities.id,
      entityName: entities.name,
      entitySlug: entities.slug,
      entityWebsiteUrl: entities.websiteUrl,
      entityCountryCode: entities.countryCode,
      entityStatus: entities.entityStatus,
      entityVisibility: entities.visibility,
      entityUpdatedAt: entities.updatedAt,
      locationId: locations.id,
      locationName: locations.name,
      locationSlug: locations.slug,
      addressLine: locations.addressLine,
      locality: locations.locality,
      region: locations.region,
      postalCode: locations.postalCode,
      countryCode: locations.countryCode,
      latitude: locations.latitude,
      longitude: locations.longitude,
      locationStatus: locations.locationStatus,
      locationVisibility: locations.visibility,
      locationWebsiteUrl: locations.websiteUrl,
      locationUpdatedAt: locations.updatedAt,
    })
    .from(locations)
    .innerJoin(entities, eq(locations.entityId, entities.id))
    .where(
      and(
        eq(entities.entityType, 'merchant'),
        inArray(entities.entityStatus, ['active', 'unknown']),
        isNull(entities.deletedAt),
        inArray(locations.locationStatus, ['active', 'temporarily_closed', 'unknown']),
        isNull(locations.deletedAt),
        or(
          ilike(entities.name, pattern),
          ilike(locations.name, pattern),
          ilike(locations.slug, pattern),
          ilike(locations.addressLine, pattern),
          ilike(locations.locality, pattern),
        ),
      ),
    )
    .orderBy(asc(entities.name), asc(locations.slug))
    .limit(limit)) as PhysicalTargetRow[];
  const claimsByLocation = await loadClaimsByLocation(
    database,
    rows.map((row) => row.locationId),
  );
  return rows.map((row) => {
    const existingClaims = claimsByLocation.get(row.locationId) ?? [];
    return {
      canonicalPath: `/place/${row.locationSlug}`,
      entity: {
        id: row.entityId,
        entityType: 'merchant',
        name: row.entityName,
        slug: row.entitySlug,
        websiteUrl: row.entityWebsiteUrl,
        countryCode: row.entityCountryCode,
        entityStatus: row.entityStatus,
        visibility: row.entityVisibility,
        updatedAt: row.entityUpdatedAt.toISOString(),
      },
      location: {
        id: row.locationId,
        entityId: row.entityId,
        name: row.locationName,
        slug: row.locationSlug,
        addressLine: row.addressLine,
        locality: row.locality,
        region: row.region,
        postalCode: row.postalCode,
        countryCode: row.countryCode,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        locationStatus: row.locationStatus,
        visibility: row.locationVisibility,
        websiteUrl: row.locationWebsiteUrl,
        updatedAt: row.locationUpdatedAt.toISOString(),
      },
      existingClaims,
      expectedClaimIds: existingClaims.map((claim) => claim.id),
    };
  });
}

async function searchOnlineTargets(
  database: CryptoPayMapDatabase,
  query: string,
  limit: number,
): Promise<CandidateCanonicalTargetOption[]> {
  const pattern = `%${query}%`;
  const rows = (await database
    .select({
      entityId: entities.id,
      entityName: entities.name,
      entitySlug: entities.slug,
      entityWebsiteUrl: entities.websiteUrl,
      entityCountryCode: entities.countryCode,
      entityStatus: entities.entityStatus,
      entityVisibility: entities.visibility,
      entityUpdatedAt: entities.updatedAt,
    })
    .from(entities)
    .where(
      and(
        eq(entities.entityType, 'online_service'),
        isNotNull(entities.slug),
        inArray(entities.entityStatus, ['active', 'unknown']),
        isNull(entities.deletedAt),
        or(
          ilike(entities.name, pattern),
          ilike(entities.slug, pattern),
          ilike(entities.websiteUrl, pattern),
        ),
      ),
    )
    .orderBy(asc(entities.name))
    .limit(limit)) as OnlineTargetRow[];
  const claimsByEntity = await loadClaimsByEntity(
    database,
    rows.map((row) => row.entityId),
  );
  return rows.map((row) => {
    const existingClaims = claimsByEntity.get(row.entityId) ?? [];
    return {
      canonicalPath: `/service/${row.entitySlug}`,
      entity: {
        id: row.entityId,
        entityType: 'online_service',
        name: row.entityName,
        slug: row.entitySlug,
        websiteUrl: row.entityWebsiteUrl,
        countryCode: row.entityCountryCode,
        entityStatus: row.entityStatus,
        visibility: row.entityVisibility,
        updatedAt: row.entityUpdatedAt.toISOString(),
      },
      location: null,
      existingClaims,
      expectedClaimIds: existingClaims.map((claim) => claim.id),
    };
  });
}

export function createDrizzleCanonicalTargetSearchBackend(
  database: CryptoPayMapDatabase,
): CandidateCanonicalTargetSearchBackend {
  return {
    async searchTargets(candidateType, query, limit) {
      return candidateType === 'physical_place'
        ? searchPhysicalTargets(database, query, limit)
        : searchOnlineTargets(database, query, limit);
    },
  };
}
