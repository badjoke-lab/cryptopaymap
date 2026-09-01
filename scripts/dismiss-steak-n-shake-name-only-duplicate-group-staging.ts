import { and, asc, eq, ilike } from 'drizzle-orm';
import { createDerivedStagingServiceIdentity } from '../src/admin/access/identity';
import {
  authorizeCandidateDuplicateResolve,
  readCandidateDuplicateAuthorizationPolicy,
} from '../src/admin/candidates/duplicate-authorization';
import { createCandidateDuplicateDecisionService } from '../src/admin/candidates/duplicate-decision';
import { createDrizzleDuplicateDecisionBackend } from '../src/admin/candidates/drizzle-duplicate-decision-backend';
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

async function deterministicUuid(label: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
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
  }).from(sourceCandidates)
    .where(and(eq(sourceCandidates.candidateType, 'physical_place'), ilike(sourceCandidates.normalizedName, '%steak%n%shake%')))
    .orderBy(asc(sourceCandidates.id));

  const grouped = rows.filter((row) => row.duplicateGroupId !== null);
  const groupIds = [...new Set(grouped.map((row) => row.duplicateGroupId as string))];
  if (groupIds.length === 0) {
    console.log(JSON.stringify({ target: TARGET, groupsDismissed: 0, candidatesReleased: 0, alreadyClear: true }));
    return;
  }
  if (groupIds.length !== 1 || grouped.length !== 43) {
    throw new Error(`Expected exactly one 43-member Steak n Shake duplicate group; found groups=${groupIds.length} members=${grouped.length}.`);
  }
  if (grouped.some((row) => !['new', 'triaged'].includes(row.candidateStatus))) {
    throw new Error('Duplicate group contains a non-reviewable Candidate status.');
  }

  const groupId = groupIds[0]!;
  const [group] = await db.select({ id: candidateDuplicateGroups.id, status: candidateDuplicateGroups.status, updatedAt: candidateDuplicateGroups.updatedAt })
    .from(candidateDuplicateGroups).where(eq(candidateDuplicateGroups.id, groupId)).limit(1);
  if (!group) throw new Error('Duplicate group missing.');

  const signals = await db.select({ reason: candidateDuplicateSignals.reason, strength: candidateDuplicateSignals.strength })
    .from(candidateDuplicateSignals).where(eq(candidateDuplicateSignals.duplicateGroupId, groupId));
  const reasons = [...new Set(signals.map((signal) => signal.reason))].sort();
  if (signals.length === 0 || reasons.some((reason) => reason !== 'same_normalized_name')) {
    throw new Error(`Refusing to dismiss group with non-name-only duplicate evidence: ${reasons.join(',')}`);
  }

  const origins = await db.select({ candidateId: candidateSourceRecords.candidateId, rawPayload: sourceRecords.rawPayload })
    .from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(eq(candidateSourceRecords.relationship, 'origin'));
  const memberIds = new Set(grouped.map((row) => row.id));
  const osmIdentities = new Set<string>();
  for (const origin of origins) {
    if (!memberIds.has(origin.candidateId)) continue;
    const element = rec(rec(origin.rawPayload).element);
    const type = typeof element.type === 'string' ? element.type : '';
    const id = typeof element.id === 'number' && Number.isSafeInteger(element.id) ? element.id : null;
    if (!type || id === null) throw new Error('A grouped Candidate is missing OSM identity.');
    const identity = `${type}:${id}`;
    if (osmIdentities.has(identity)) throw new Error(`True duplicate OSM identity found: ${identity}`);
    osmIdentities.add(identity);
  }
  if (osmIdentities.size !== grouped.length) throw new Error(`Expected ${grouped.length} distinct OSM identities; found ${osmIdentities.size}.`);

  if (group.status === 'open') {
    const policy = readCandidateDuplicateAuthorizationPolicy({
      CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS: process.env.CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS,
    });
    const reviewer = createDerivedStagingServiceIdentity('reviewer');
    const requestId = await deterministicUuid(`steaknshake:dismiss-name-only-duplicate-group:${groupId}`);
    const context = authorizeCandidateDuplicateResolve(reviewer, policy, requestId);
    const decidedAt = new Date(Math.max(Date.now(), group.updatedAt.getTime() + 1_000));
    const receipt = await createCandidateDuplicateDecisionService(createDrizzleDuplicateDecisionBackend(db)).decide(context, {
      duplicateGroupId: groupId,
      action: 'dismiss_signal',
      primaryCandidateId: null,
      memberCandidateIds: grouped.map((row) => row.id),
      reasonCode: 'different_location',
      note: 'Dismissed because the group is based only on identical normalized chain name; all 43 members have distinct OSM identities and represent separate physical locations.',
      expectedGroupUpdatedAt: group.updatedAt.toISOString(),
      decidedAt: decidedAt.toISOString(),
    });
    if (!['committed', 'replayed'].includes(receipt.state)) throw new Error('Duplicate dismissal did not commit.');
  } else if (group.status !== 'dismissed') {
    throw new Error(`Refusing to release group in status ${group.status}.`);
  }

  const releaseAt = new Date();
  const released = await db.update(sourceCandidates)
    .set({ duplicateGroupId: null, updatedAt: releaseAt })
    .where(eq(sourceCandidates.duplicateGroupId, groupId))
    .returning({ id: sourceCandidates.id });
  if (released.length !== 43) throw new Error(`Expected to release 43 Candidates; released ${released.length}.`);

  console.log(JSON.stringify({
    target: TARGET,
    duplicateGroupId: groupId,
    signalReasons: reasons,
    signalCount: signals.length,
    distinctOsmIdentities: osmIdentities.size,
    groupsDismissed: group.status === 'open' ? 1 : 0,
    candidatesReleased: released.length,
    candidatePayloadExposed: false,
  }));
}
await main();