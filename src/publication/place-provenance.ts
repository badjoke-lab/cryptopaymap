import { publicProvenanceSchema } from '../schemas/public-exports';

const publicEntityFieldPaths = new Set(['name', 'websiteUrl', 'countryCode']);
const publicLocationFieldPaths = new Set([
  'name',
  'addressLine',
  'locality',
  'region',
  'postalCode',
  'countryCode',
  'latitude',
  'longitude',
  'websiteUrl',
  'phone',
  'description',
  'openingHours',
  'amenities',
  'socialLinks',
]);

export interface PublicPlaceProvenanceSourceRecord {
  sourceRecordId: string;
  sourceName: string;
  sourceUrl: string | null;
  licenseSlug: string | null;
  attribution: string | null;
}

export interface PublicPlaceFieldProvenanceRow {
  subjectType:
    | 'entity'
    | 'location'
    | 'acceptance_claim'
    | 'claim_asset'
    | 'evidence'
    | 'verification_event'
    | 'media';
  subjectId: string;
  fieldPath: string | null;
  sourceRecordId: string;
  provenanceRole: 'origin' | 'verification' | 'correction' | 'attribution';
}

export interface PublicPlaceProvenanceInput {
  entityId: string;
  locationId: string;
  sourceRecords: readonly PublicPlaceProvenanceSourceRecord[];
  rows: readonly PublicPlaceFieldProvenanceRow[];
}

export class PublicPlaceProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicPlaceProvenanceError';
  }
}

function isPublicPlaceField(row: PublicPlaceFieldProvenanceRow, input: PublicPlaceProvenanceInput) {
  if (row.fieldPath === null) return false;
  if (row.subjectType === 'entity' && row.subjectId === input.entityId) {
    return publicEntityFieldPaths.has(row.fieldPath);
  }
  if (row.subjectType === 'location' && row.subjectId === input.locationId) {
    return publicLocationFieldPaths.has(row.fieldPath);
  }
  return false;
}

export function buildPublicPlaceProvenance(input: PublicPlaceProvenanceInput) {
  const sources = new Map(input.sourceRecords.map((source) => [source.sourceRecordId, source]));
  const fieldsBySource = new Map<string, Set<string>>();

  for (const row of input.rows) {
    if (!isPublicPlaceField(row, input)) continue;
    const source = sources.get(row.sourceRecordId);
    if (!source) {
      throw new PublicPlaceProvenanceError(
        `Public Place provenance is missing source metadata for ${row.sourceRecordId}.`,
      );
    }
    const fields = fieldsBySource.get(row.sourceRecordId) ?? new Set<string>();
    fields.add(row.fieldPath as string);
    fieldsBySource.set(row.sourceRecordId, fields);
  }

  return [...fieldsBySource.entries()]
    .map(([sourceRecordId, fields]) => {
      const source = sources.get(sourceRecordId);
      if (!source) {
        throw new PublicPlaceProvenanceError(
          `Public Place provenance is missing source metadata for ${sourceRecordId}.`,
        );
      }
      return publicProvenanceSchema.parse({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        licenseSlug: source.licenseSlug,
        attribution: source.attribution,
        fields: [...fields].sort((left, right) => left.localeCompare(right)),
      });
    })
    .sort((left, right) => {
      const name = left.sourceName.localeCompare(right.sourceName);
      if (name !== 0) return name;
      return (left.sourceUrl ?? '').localeCompare(right.sourceUrl ?? '');
    });
}
