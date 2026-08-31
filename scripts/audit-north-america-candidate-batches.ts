import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';

type Region = 'north-america-east' | 'north-america-west';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function regionFor(latitude: unknown, longitude: unknown): Region | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (latitude < 15 || latitude > 72) return null;
  if (longitude >= -100 && longitude <= -50) return 'north-america-east';
  if (longitude >= -170 && longitude < -100) return 'north-america-west';
  return null;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing North America Candidate batch audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      importBatchId: sourceCandidates.importBatchId,
      rawPayload: sourceRecords.rawPayload,
      officialDomain: sourceRecords.officialDomain,
    })
    .from(sourceCandidates)
    .innerJoin(
      candidateSourceRecords,
      and(
        eq(candidateSourceRecords.candidateId, sourceCandidates.id),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    )
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
        isNull(sourceCandidates.duplicateGroupId),
      ),
    )
    .orderBy(asc(sourceCandidates.importBatchId), asc(sourceCandidates.id));

  const grouped = new Map<string, {
    region: Region;
    importBatchId: string;
    candidateCount: number;
    officialDomainCount: number;
    websiteCount: number;
  }>();

  for (const row of rows) {
    const payload = record(row.rawPayload);
    const seed = record(payload?.reviewSeed);
    const region = regionFor(seed?.latitude, seed?.longitude);
    if (!region) continue;

    const key = `${region}:${row.importBatchId}`;
    let group = grouped.get(key);
    if (!group) {
      group = {
        region,
        importBatchId: row.importBatchId,
        candidateCount: 0,
        officialDomainCount: 0,
        websiteCount: 0,
      };
      grouped.set(key, group);
    }
    group.candidateCount += 1;
    if (typeof row.officialDomain === 'string' && row.officialDomain.trim().length > 0) {
      group.officialDomainCount += 1;
    }
    if (typeof seed?.websiteUrl === 'string' && seed.websiteUrl.trim().length > 0) {
      group.websiteCount += 1;
    }
  }

  const groups = [...grouped.values()].sort((left, right) =>
    left.region.localeCompare(right.region) ||
    right.officialDomainCount - left.officialDomainCount ||
    right.candidateCount - left.candidateCount ||
    left.importBatchId.localeCompare(right.importBatchId),
  );

  const summarize = (region: Region) => {
    const selected = groups.filter((group) => group.region === region);
    return {
      region,
      batchCount: selected.length,
      candidateCount: selected.reduce((sum, group) => sum + group.candidateCount, 0),
      officialDomainCount: selected.reduce((sum, group) => sum + group.officialDomainCount, 0),
      websiteCount: selected.reduce((sum, group) => sum + group.websiteCount, 0),
      batches: selected,
    };
  };

  process.stdout.write(JSON.stringify({
    target: EXPECTED_TARGET,
    mutationPerformed: false,
    publicDataChanged: false,
    payloadExposedInLogs: false,
    regions: [summarize('north-america-east'), summarize('north-america-west')],
  }));
}

await main();
