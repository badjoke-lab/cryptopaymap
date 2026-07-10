import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import {
  candidateSourceRecords,
  sourceCandidates,
  sourceRecords,
} from '../db/schema';
import { projectCandidateSourceSnapshot } from '../admin/candidates/source-snapshot';
import type {
  SuggestCandidateSignalMaterial,
  SuggestCandidateSignalSearchBackend,
} from './suggest-review-signals';

const activeSignalStatuses = ['new', 'triaged', 'linked', 'duplicate'] as const;
const maximumSourceRows = 250;

export function createDrizzleSuggestCandidateSignalSearchBackend(
  database: CryptoPayMapDatabase,
): SuggestCandidateSignalSearchBackend {
  return {
    async searchCandidateSignalMaterial(input) {
      const nameRows = await database
        .select({
          candidateId: sourceCandidates.id,
          candidateType: sourceCandidates.candidateType,
          candidateStatus: sourceCandidates.candidateStatus,
          normalizedName: sourceCandidates.normalizedName,
          duplicateGroupId: sourceCandidates.duplicateGroupId,
        })
        .from(sourceCandidates)
        .where(
          and(
            eq(sourceCandidates.candidateType, input.candidateType),
            inArray(sourceCandidates.candidateStatus, [...activeSignalStatuses]),
            eq(sourceCandidates.normalizedName, input.normalizedName),
          ),
        )
        .limit(input.limit);

      const domainRows =
        input.candidateType !== 'online_service' || input.officialDomain === null
          ? []
          : await database
              .select({
                candidateId: sourceCandidates.id,
                candidateType: sourceCandidates.candidateType,
                candidateStatus: sourceCandidates.candidateStatus,
                normalizedName: sourceCandidates.normalizedName,
                duplicateGroupId: sourceCandidates.duplicateGroupId,
              })
              .from(sourceCandidates)
              .innerJoin(
                candidateSourceRecords,
                eq(candidateSourceRecords.candidateId, sourceCandidates.id),
              )
              .innerJoin(
                sourceRecords,
                eq(candidateSourceRecords.sourceRecordId, sourceRecords.id),
              )
              .where(
                and(
                  eq(sourceCandidates.candidateType, 'online_service'),
                  inArray(sourceCandidates.candidateStatus, [...activeSignalStatuses]),
                  or(
                    ilike(
                      sql<string>`${sourceRecords.rawPayload} #>> '{normalizedRecord,websiteUrl}'`,
                      `%://${input.officialDomain}/%`,
                    ),
                    ilike(
                      sql<string>`${sourceRecords.rawPayload} #>> '{normalizedRecord,websiteUrl}'`,
                      `%://${input.officialDomain}`,
                    ),
                    ilike(
                      sql<string>`${sourceRecords.rawPayload} #>> '{normalizedRecord,websiteUrl}'`,
                      `%://www.${input.officialDomain}/%`,
                    ),
                    ilike(
                      sql<string>`${sourceRecords.rawPayload} #>> '{normalizedRecord,websiteUrl}'`,
                      `%://www.${input.officialDomain}`,
                    ),
                  ),
                ),
              )
              .limit(input.limit);

      const candidates = new Map<string, (typeof nameRows)[number]>();
      for (const row of [...nameRows, ...domainRows]) candidates.set(row.candidateId, row);
      const boundedCandidates = [...candidates.values()]
        .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
        .slice(0, input.limit);
      if (boundedCandidates.length === 0) return [];

      const candidateIds = boundedCandidates.map((candidate) => candidate.candidateId);
      const sourceRows = await database
        .select({
          candidateId: candidateSourceRecords.candidateId,
          rawPayload: sourceRecords.rawPayload,
        })
        .from(candidateSourceRecords)
        .innerJoin(sourceRecords, eq(candidateSourceRecords.sourceRecordId, sourceRecords.id))
        .where(
          and(
            inArray(candidateSourceRecords.candidateId, candidateIds),
            inArray(candidateSourceRecords.relationship, ['origin', 'supporting', 'update']),
          ),
        )
        .limit(maximumSourceRows);

      const snapshotsByCandidate = new Map<
        string,
        SuggestCandidateSignalMaterial['snapshots']
      >();
      const candidateTypes = new Map(
        boundedCandidates.map((candidate) => [candidate.candidateId, candidate.candidateType]),
      );
      for (const row of sourceRows) {
        const candidateType = candidateTypes.get(row.candidateId);
        if (candidateType === undefined) continue;
        const snapshot = projectCandidateSourceSnapshot(candidateType, row.rawPayload);
        if (snapshot === null) continue;
        const snapshots = snapshotsByCandidate.get(row.candidateId) ?? [];
        snapshots.push(snapshot);
        snapshotsByCandidate.set(row.candidateId, snapshots);
      }

      return boundedCandidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        candidateType: candidate.candidateType as 'physical_place' | 'online_service',
        candidateStatus: candidate.candidateStatus,
        normalizedName: candidate.normalizedName,
        duplicateGroupId: candidate.duplicateGroupId,
        snapshots: snapshotsByCandidate.get(candidate.candidateId) ?? [],
      }));
    },
  };
}
