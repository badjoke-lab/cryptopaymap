import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
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
  if (rows.length !== 44) throw new Error(`Expected 44 Steak n Shake Candidates; found ${rows.length}.`);
  const candidateIds = rows.map((row) => row.id);

  const relatedSignals = await db.select({
    duplicateGroupId: candidateDuplicateSignals.duplicateGroupId,
    left: candidateDuplicateSignals.leftCandidateId,
    right: candidateDuplicateSignals.rightCandidateId,
    reason: candidateDuplicateSignals.reason,
  }).from(candidateDuplicateSignals)
    .where(or(inArray(candidateDuplicateSignals.leftCandidateId, candidateIds), inArray(candidateDuplicateSignals.rightCandidateId, candidateIds)));
  const signalsByGroup = new Map<string, typeof relatedSignals>();
  for (const signal of relatedSignals) {
    const current = signalsByGroup.get(signal.duplicateGroupId) ?? [];
    current.push(signal);
    signalsByGroup.set(signal.duplicateGroupId, current);
  }
  const matchingGroups = [...signalsByGroup.entries()].filter(([, signals]) => signals.length === 903);
  if (matchingGroups.length !== 1) throw new Error(`Expected one 903-signal Steak n Shake group; found ${matchingGroups.length}.`);
  const [groupId, signals] = matchingGroups[0]!;

  const memberIds = new Set(signals.flatMap((signal) => [signal.left, signal.right]).filter((id) => candidateIds.includes(id)));
  if (memberIds.size !== 43) throw new Error(`Expected 43 signal-linked Steak n Shake members; found ${memberIds.size}.`);
  const members = rows.filter((row) => memberIds.has(row.id));
  if (members.some((row) => !['new', 'triaged'].includes(row.candidateStatus))) throw new Error('Duplicate group contains a non-reviewable Candidate status.');
  if (members.some((row) => row.canonicalEntityId !== null || row.canonicalLocationId !== null)) throw new Error('Duplicate group unexpectedly contains canonical links.');

  const reasonCounts = new Map<string, number>();
  for (const signal of signals) reasonCounts.set(signal.reason, (reasonCounts.get(signal.reason) ?? 0) + 1);
  if (reasonCounts.get('same_name_and_coordinates') !== 1 || reasonCounts.get('shared_official_domain') !== 379 || reasonCounts.get('same_normalized_name') !== 523 || reasonCounts.size !== 3) {
    throw new Error(`Duplicate signal fingerprint changed: ${JSON.stringify(Object.fromEntries(reasonCounts))}`);
  }

  const origins = await db.select({ candidateId: candidateSourceRecords.candidateId, rawPayload: sourceRecords.rawPayload })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(eq(candidateSourceRecords.relationship, 'origin'));
  const geometryById = new Map<string, { osm: string; coordinate: string }>();
  for (const origin of origins) if (memberIds.has(origin.candidateId)) geometryById.set(origin.candidateId, geometry(origin.rawPayload));
  if (geometryById.size !== 43) throw new Error(`Expected geometry for all 43 members; found ${geometryById.size}.`);
  const osmIdentities = new Set([...geometryById.values()].map((value) => value.osm));
  const coordinates = new Set([...geometryById.values()].map((value) => value.coordinate));
  if (osmIdentities.size !== 43 || coordinates.size !== 43) throw new Error(`Actual duplicate detected: osm=${osmIdentities.size} coords=${coordinates.size}.`);

  const coordinateSignal = signals.find((signal) => signal.reason === 'same_name_and_coordinates');
  if (!coordinateSignal) throw new Error('Expected coordinate signal missing.');
  const left = geometryById.get(coordinateSignal.left);
  const right = geometryById.get(coordinateSignal.right);
  if (!left || !right || left.coordinate === right.coordinate || left.osm === right.osm) throw new Error('Coordinate signal now represents an actual duplicate; refusing repair.');

  const [group] = await db.select({ status: candidateDuplicateGroups.status, updatedAt: candidateDuplicateGroups.updatedAt })
    .from(candidateDuplicateGroups).where(eq(candidateDuplicateGroups.id, groupId)).limit(1);
  if (!group) throw new Error('Duplicate group missing.');
  const repairedAt = new Date(Math.max(Date.now(), group.updatedAt.getTime() + 1_000));
  let groupsDismissed = 0;
  if (group.status === 'open') {
    const dismissed = await db.update(candidateDuplicateGroups).set({
      status: 'dismissed',
      resolutionNote: 'Bounded staging repair: 43 same-chain physical Candidates have 43 distinct OSM identities and 43 distinct exact coordinates. The 903-signal cluster was dominated by shared domain/name signals; its sole same_name_and_coordinates signal did not have equal coordinates.',
      resolvedAt: repairedAt,
      updatedAt: repairedAt,
    }).where(and(eq(candidateDuplicateGroups.id, groupId), eq(candidateDuplicateGroups.status, 'open'))).returning({ id: candidateDuplicateGroups.id });
    if (dismissed.length !== 1) throw new Error(`Expected to dismiss one group; dismissed ${dismissed.length}.`);
    groupsDismissed = 1;
  } else if (group.status !== 'dismissed') {
    throw new Error(`Expected open or dismissed group; found ${group.status}.`);
  }

  const released = await db.update(sourceCandidates).set({ duplicateGroupId: null, updatedAt: repairedAt })
    .where(and(eq(sourceCandidates.duplicateGroupId, groupId), inArray(sourceCandidates.id, [...memberIds])))
    .returning({ id: sourceCandidates.id });
  const after = await db.select({ id: sourceCandidates.id, duplicateGroupId: sourceCandidates.duplicateGroupId })
    .from(sourceCandidates).where(inArray(sourceCandidates.id, [...memberIds]));
  if (after.length !== 43 || after.some((row) => row.duplicateGroupId !== null)) throw new Error('Candidate release verification failed.');

  console.log(JSON.stringify({
    target: TARGET,
    signalCount: signals.length,
    signalReasonCounts: Object.fromEntries(reasonCounts),
    distinctOsmIdentities: osmIdentities.size,
    distinctCoordinates: coordinates.size,
    falseCoordinateSignalVerified: true,
    groupsDismissed,
    candidatesReleasedThisRun: released.length,
    candidatesReleasedTotal: 43,
    recoveredPartialPriorRun: released.length === 0,
    repairScope: 'fixed-review-staging-only',
    automaticPublicVisibility: false,
    candidatePayloadExposed: false,
  }));
}
await main();