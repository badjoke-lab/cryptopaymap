import { and, asc, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateDuplicateGroups,
  candidateDuplicateSignals,
  candidateSourceRecords,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };
const TARGET = 'fixed-review-staging';
type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec => value && typeof value === 'object' && !Array.isArray(value) ? value as Rec : {};
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

function geometry(rawPayload: unknown): { osm: string | null; coordinate: string | null } {
  const payload = rec(rawPayload);
  const element = rec(payload.element);
  const center = rec(element.center);
  const type = typeof element.type === 'string' ? element.type : '';
  const id = typeof element.id === 'number' && Number.isSafeInteger(element.id) ? element.id : null;
  const lat = num(element.lat) ?? num(center.lat);
  const lon = num(element.lon) ?? num(center.lon);
  return {
    osm: type && id !== null ? `${type}:${id}` : null,
    coordinate: lat !== null && lon !== null ? `${lat.toFixed(7)},${lon.toFixed(7)}` : null,
  };
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) throw new Error(`Refusing outside ${TARGET}`);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const candidates = await db.select({ id: sourceCandidates.id, duplicateGroupId: sourceCandidates.duplicateGroupId })
    .from(sourceCandidates)
    .where(and(eq(sourceCandidates.candidateType, 'physical_place'), ilike(sourceCandidates.normalizedName, '%steak%n%shake%')))
    .orderBy(asc(sourceCandidates.id));
  const grouped = candidates.filter((row) => row.duplicateGroupId !== null);
  const groupIds = [...new Set(grouped.map((row) => row.duplicateGroupId as string))];
  if (groupIds.length !== 1) throw new Error(`Expected one grouped Steak n Shake cluster; found ${groupIds.length}.`);
  const groupId = groupIds[0]!;
  const [group] = await db.select({ status: candidateDuplicateGroups.status }).from(candidateDuplicateGroups)
    .where(eq(candidateDuplicateGroups.id, groupId)).limit(1);
  if (!group) throw new Error('Duplicate group missing.');

  const memberIds = new Set(grouped.map((row) => row.id));
  const originRows = await db.select({ candidateId: candidateSourceRecords.candidateId, rawPayload: sourceRecords.rawPayload })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(eq(candidateSourceRecords.relationship, 'origin'));
  const geomById = new Map<string, { osm: string | null; coordinate: string | null }>();
  for (const row of originRows) if (memberIds.has(row.candidateId)) geomById.set(row.candidateId, geometry(row.rawPayload));

  const signals = await db.select({
    left: candidateDuplicateSignals.leftCandidateId,
    right: candidateDuplicateSignals.rightCandidateId,
    reason: candidateDuplicateSignals.reason,
    strength: candidateDuplicateSignals.strength,
  }).from(candidateDuplicateSignals)
    .where(eq(candidateDuplicateSignals.duplicateGroupId, groupId))
    .orderBy(asc(candidateDuplicateSignals.reason), asc(candidateDuplicateSignals.leftCandidateId), asc(candidateDuplicateSignals.rightCandidateId));

  const reasonCounts: Record<string, number> = {};
  const strengthCounts: Record<string, number> = {};
  let sameCoordinatesSignals = 0;
  let differentCoordinatesSignals = 0;
  let missingGeometrySignals = 0;
  let sameOsmIdentitySignals = 0;
  const coordinatePairKeys = new Set<string>();
  const candidatesInCoordinateSignals = new Set<string>();
  for (const signal of signals) {
    reasonCounts[signal.reason] = (reasonCounts[signal.reason] ?? 0) + 1;
    strengthCounts[signal.strength] = (strengthCounts[signal.strength] ?? 0) + 1;
    if (signal.reason !== 'same_name_and_coordinates') continue;
    const left = geomById.get(signal.left);
    const right = geomById.get(signal.right);
    if (!left?.coordinate || !right?.coordinate) {
      missingGeometrySignals += 1;
      continue;
    }
    if (left.osm !== null && left.osm === right.osm) sameOsmIdentitySignals += 1;
    if (left.coordinate === right.coordinate) {
      sameCoordinatesSignals += 1;
      candidatesInCoordinateSignals.add(signal.left);
      candidatesInCoordinateSignals.add(signal.right);
      coordinatePairKeys.add([left.coordinate, right.coordinate].sort().join('|'));
    } else {
      differentCoordinatesSignals += 1;
    }
  }

  const coordinateBuckets = new Map<string, number>();
  for (const candidateId of memberIds) {
    const coordinate = geomById.get(candidateId)?.coordinate;
    if (!coordinate) continue;
    coordinateBuckets.set(coordinate, (coordinateBuckets.get(coordinate) ?? 0) + 1);
  }
  const duplicateCoordinateBuckets = [...coordinateBuckets.values()].filter((count) => count > 1).sort((a,b) => b-a);
  const distinctOsm = new Set([...memberIds].map((id) => geomById.get(id)?.osm).filter((value): value is string => Boolean(value)));

  console.log(JSON.stringify({
    target: TARGET,
    groupStatus: group.status,
    members: memberIds.size,
    signals: signals.length,
    reasonCounts,
    strengthCounts,
    distinctOsmIdentities: distinctOsm.size,
    coordinateKnownMembers: coordinateBuckets.size === 0 ? 0 : [...memberIds].filter((id) => Boolean(geomById.get(id)?.coordinate)).length,
    distinctCoordinateCount: coordinateBuckets.size,
    duplicateCoordinateBucketCount: duplicateCoordinateBuckets.length,
    duplicateCoordinateBucketSizes: duplicateCoordinateBuckets,
    sameNameAndCoordinates: {
      sameCoordinatesSignals,
      differentCoordinatesSignals,
      missingGeometrySignals,
      sameOsmIdentitySignals,
      candidatesTouched: candidatesInCoordinateSignals.size,
      distinctExactCoordinatePairs: coordinatePairKeys.size,
    },
    readOnly: true,
    candidatePayloadExposed: false,
  }));
}
await main();