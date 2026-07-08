import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { locationProfileCorrectionDecisions, locations } from '../../db/schema';
import type { CanonicalLocationInput } from '../../schemas/canonical-identity';
import {
  applyLocationCorrectionChanges,
  changedLocationCorrectionFields,
  LocationCorrectionDecisionError,
  type LocationCorrectionDecisionCommand,
  type LocationCorrectionDecisionReceipt,
  type PracticalLocationCorrectionField,
} from './decision';

export async function readLocationCorrectionDecision(
  database: CryptoPayMapDatabase,
  requestId: string,
) {
  const rows = await database
    .select({
      requestId: locationProfileCorrectionDecisions.requestId,
      locationId: locationProfileCorrectionDecisions.locationId,
      changedFieldPaths: locationProfileCorrectionDecisions.changedFieldPaths,
      decidedAt: locationProfileCorrectionDecisions.decidedAt,
      requestFingerprint: locationProfileCorrectionDecisions.requestFingerprint,
    })
    .from(locationProfileCorrectionDecisions)
    .where(eq(locationProfileCorrectionDecisions.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

export function replayLocationCorrectionDecision(
  existing: NonNullable<Awaited<ReturnType<typeof readLocationCorrectionDecision>>>,
): LocationCorrectionDecisionReceipt {
  return {
    requestId: existing.requestId,
    locationId: existing.locationId,
    appliedFieldPaths: existing.changedFieldPaths as PracticalLocationCorrectionField[],
    decidedAt: existing.decidedAt.toISOString(),
    updatedAt: existing.decidedAt.toISOString(),
    state: 'replayed',
  };
}

export async function readLocationCorrectionTarget(
  database: CryptoPayMapDatabase,
  locationId: string,
) {
  const rows = await database
    .select({
      id: locations.id,
      name: locations.name,
      slug: locations.slug,
      addressLine: locations.addressLine,
      locality: locations.locality,
      region: locations.region,
      postalCode: locations.postalCode,
      countryCode: locations.countryCode,
      latitude: locations.latitude,
      longitude: locations.longitude,
      locationStatus: locations.locationStatus,
      visibility: locations.visibility,
      websiteUrl: locations.websiteUrl,
      phone: locations.phone,
      description: locations.description,
      openingHours: locations.openingHours,
      amenities: locations.amenities,
      socialLinks: locations.socialLinks,
      osmType: locations.osmType,
      osmId: locations.osmId,
      updatedAt: locations.updatedAt,
      deletedAt: locations.deletedAt,
    })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  return rows[0] ?? null;
}

function toCanonicalLocation(
  row: NonNullable<Awaited<ReturnType<typeof readLocationCorrectionTarget>>>,
): CanonicalLocationInput {
  return {
    name: row.name,
    slug: row.slug,
    addressLine: row.addressLine,
    locality: row.locality,
    region: row.region,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    locationStatus: row.locationStatus,
    visibility: row.visibility,
    websiteUrl: row.websiteUrl,
    phone: row.phone,
    description: row.description,
    openingHours: row.openingHours,
    ...(row.amenities === null ? {} : { amenities: [...row.amenities] }),
    ...(row.socialLinks === null
      ? {}
      : { socialLinks: row.socialLinks.map((link) => ({ ...link })) }),
    osmType: row.osmType,
    osmId: row.osmId,
  };
}

function valueAt(
  location: CanonicalLocationInput,
  field: PracticalLocationCorrectionField,
): unknown {
  return (location as unknown as Record<string, unknown>)[field];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export interface ProjectedLocationCorrection {
  before: CanonicalLocationInput;
  after: CanonicalLocationInput;
  beforeValues: Record<string, unknown>;
  afterValues: Record<string, unknown>;
  appliedFieldPaths: PracticalLocationCorrectionField[];
  receipt: LocationCorrectionDecisionReceipt;
}

export async function projectLocationCorrection(
  database: CryptoPayMapDatabase,
  command: LocationCorrectionDecisionCommand,
): Promise<ProjectedLocationCorrection> {
  const row = await readLocationCorrectionTarget(database, command.locationId);
  if (row === null || row.deletedAt !== null) {
    throw new LocationCorrectionDecisionError('not_found', 'The canonical Location was not found.');
  }
  if (row.updatedAt.getTime() !== command.expectedLocationUpdatedAt.getTime()) {
    throw new LocationCorrectionDecisionError(
      'conflict',
      'The canonical Location changed after the correction was reviewed.',
    );
  }

  const before = toCanonicalLocation(row);
  const after = applyLocationCorrectionChanges(before, command.changes);
  const appliedFieldPaths = changedLocationCorrectionFields(command.changes);
  const beforeValues = Object.fromEntries(
    appliedFieldPaths.map((field) => [field, clone(valueAt(before, field))]),
  );
  const afterValues = Object.fromEntries(
    appliedFieldPaths.map((field) => [field, clone(valueAt(after, field))]),
  );

  for (const field of appliedFieldPaths) {
    if (JSON.stringify(beforeValues[field]) === JSON.stringify(afterValues[field])) {
      throw new LocationCorrectionDecisionError(
        'invalid_decision',
        `The ${field} correction does not change the canonical value.`,
      );
    }
  }

  return {
    before,
    after,
    beforeValues,
    afterValues,
    appliedFieldPaths,
    receipt: {
      requestId: command.requestId,
      locationId: command.locationId,
      appliedFieldPaths,
      decidedAt: command.decidedAt.toISOString(),
      updatedAt: command.decidedAt.toISOString(),
      state: 'committed',
    },
  };
}
