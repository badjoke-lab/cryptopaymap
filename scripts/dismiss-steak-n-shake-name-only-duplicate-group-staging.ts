import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
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

function geometry(rawPayload: unknown): { osm: string; coordinate: string } {
  const element = rec(rec(rawPayload).element);
  const center = rec(element.center);
  const type = typeof element.type === 'string' ? element.type : '';
  const id = typeof element.id === 'number' && Number.isSafeInteger(element.id) ? element.id : null;
  const lat = num(element.lat) ?? num(center.lat);
  const lon = num(element.lon) ?? num(center.lon);
  if (!type || id === null || lat === null || lon === null) throw new Error('Grouped Candidate is missing OSM identity or geometry.');
  return { osm: `${type}:${id}`, coordinate: `${lat.toFixed(7)},${lon.toFixed(7)}` };
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) throw new Error(`Refusing outside ${TARGET}`);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db.select({
    id: sourceCandidates.id,
    duplicateGroupId: sourceCandidates.duplicateGroupId,
    candidateStatus: sourceCandidates.candidateStatus,
    canonicalEntityId: sourceCandidates.canonicalEntityId,
    canonicalLocationId: sourceCandidates.canonicalLocationId,
  }).from(sourceCandidates)
    .where(and(eq(sourceCandidates.candidateType, 'physical_place'), ilike(sourceCandidates.normalizedName, '%steak%n%shake%')))
    .orderBy(asc(sourceCandidates.id));

  const grouped = rows.filter((row) => row.duplicateGroupId !== null);
  const groupIds = [...new Set(grouped.map((row) => row.duplicateGroupId as string))];
  if (groupIds.length === 0) {
    console.log(JSON.stringify({ target: TARGET, groupsDismissed: 0, candidatesReleased: 0, alreadyClear: true }));
    return;
  }
  if (groupIds.length !== 1 || grouped.length !== 43) throw new Error(`Expected exactly one 43-member Steak n Shake duplicate group; found groups=${groupIds.length} members=${grouped.length}.`);
  if (grouped.some((row) => !['new', 'triaged'].includes(row.candidateStatus))) throw new Error('Duplicate group contains a non-reviewable Candidate status.');
  if (grouped.some((row) => row.canonicalEntityId !== null || row.canonicalLocationId !== null)) throw new Error('Duplicate group unexpectedly contains canonical links.');

  const groupId = groupIds[0]!;
  const [group] = await db.select({ id: candidateDuplicateGroups.id, status: candidateDuplicateGroups.status, updatedAt: candidateDuplicateGroups.updatedAt })
    .from(candidateDuplicateGroups).where(eq(candidateDuplicateGroups.id, groupId)).limit(1);
  if (!group) throw new Error('Duplicate group missing.');
  if (group.status !== 'open') throw new Error(`Expected open duplicate group; found ${group.status}.`);

  const signals = await db.select({
    left: candidateDuplicateSignals.leftCandidateId,
    right: candidateDuplicateSignals.rightCandidateId,
    reason: candidateDuplicateSignals.reason,
  }).from(candidateDuplicateSignals).where(eq(candidateDuplicateSignals.duplicateGroupId, groupId));
  const reasonCounts = new Map<string, number>();
  for (const signal of signals) reasonCounts.set(signal.reason, (reasonCounts.get(signal.reason) ?? 0) + 1);
  if (signals.length !== 903 || reasonCounts.get('same_name_and_coordinates') !== 1 || reasonCounts.get('shared_official_domain') !== 379 || reasonCounts.get('same_normalized_name') !== 523 || reasonCounts.size !== 3) {
    throw new Error(`Duplicate signal fingerprint changed: total=${signals.length} reasons=${JSON.stringify(Object.fromEntries(reasonCounts))}`);
  }

  const origins = await db.select({ candidateId: candidateSourceRecords.candidateId, rawPayload: sourceRecords.rawPayload })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(eq(candidateSourceRecords.relationship, 'origin'));
  const memberIds = new Set(grouped.map((row) => row.id));
  const geometryById = new Map<string, { osm: string; coordinate: string }>();
  for (const origin of origins) if (memberIds.has(origin.candidateId)) geometryById.set(origin.candidateId, geometry(origin.rawPayload));
  if (geometryById.size !== 43) throw new Error(`Expected geometry for all 43 members; found ${geometryById.size}.`);
  const osmIdentities = new Set([...geometryById.values()].map((value) => value.osm));
  const coordinates = new Set([...geometryById.values()].map((value) => value.coordinate));
  if (osmIdentities.size !== 43) throw new Error(`True duplicate OSM identity remains: distinct=${osmIdentities.size}.`);
  if (coordinates.size !== 43) throw new Error(`True exact-coordinate duplicate remains: distinct=${coordinates.size}.`);

  const coordinateSignal = signals.find((signal) => signal.reason === 'same_name_and_coordinates');
  if (!coordinateSignal) throw new Error('Expected same_name_and_coordinates signal missing.');
  const left = geometryById.get(coordinateSignal.left);
  const right = geometryById.get(coordinateSignal.right);
  if (!left || !right || left.coordinate === right.coordinate || left.osm === right.osm) {
    throw new Error('The coordinate signal now represents an actual duplicate; refusing repair.');
  }

  const repairedAt = new Date(Math.max(Date.now(), group.updatedAt.getTime() + 1_000));
  const groupUpdate = db.update(candidateDuplicateGroups)
    .set({
      status: 'dismissed',
      resolutionNote: 'Bounded staging repair: 43 same-chain physical Candidates have 43 distinct OSM identities and 43 distinct exact coordinates. The 903-signal cluster was dominated by shared domain/name signals; its sole same_name_and_coordinates signal did not have equal coordinates.',
      resolvedAt: repairedAt,
      updatedAt: repairedAt,
    })
    .where(and(eq(candidateDuplicateGroups.id, groupId), eq(candidateDuplicateGroups.status, 'open'), eq(candidateDuplicateGroups.updatedAt, group.updatedAt)))
    .returning({ id: candidateDuplicateGroups.id });
  const candidateUpdate = db.update(sourceCandidates)
    .set({ duplicateGroupId: null, updatedAt: repairedAt })
    .where(and(eq(sourceCandidates.duplicateGroupId, groupId), inArray(sourceCandidates.candidateStatus, ['new', 'triaged'])))
    .returning({ id: sourceCandidates.id });
  const [dismissed, released] = await db.batch([groupUpdate, candidateUpdate]);
  if (dismissed.length !== 1 || released.length !== 43) throw new Error(`Atomic repair count mismatch: groups=${dismissed.length} candidates=${released.length}.`);

  console.log(JSON.stringify({
    target: TARGET,
    signalCount: signals.length,
    signalReasonCounts: Object.fromEntries(reasonCounts),
    distinctOsmIdentities: osmIdentities.size,
    distinctCoordinates: coordinates.size,
    falseCoordinateSignalVerified: true,
    groupsDismissed: dismissed.length,
    candidatesReleased: released.length,
    repairScope: 'fixed-review-staging-only',
    automaticPublicVisibility: false,
    candidatePayloadExposed: false,
  }));
}
await main();