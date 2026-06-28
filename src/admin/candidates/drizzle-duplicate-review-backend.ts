import { asc, eq, inArray } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidateDuplicateGroups,
  candidateDuplicateSignals,
  candidateSourceRecords,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../../db/schema';
import {
  CandidateDuplicateReviewError,
  type CandidateDuplicateReviewBackend,
  type CandidateDuplicateReviewData,
  type CandidateDuplicateReviewMember,
} from './duplicate-review';

const maximumMembers = 50;
const maximumSignals = 100;

export function createDrizzleDuplicateReviewBackend(
  database: CryptoPayMapDatabase,
): CandidateDuplicateReviewBackend {
  return {
    async loadGroup(groupId: string): Promise<CandidateDuplicateReviewData | null> {
      const groupRows = await database
        .select({
          id: candidateDuplicateGroups.id,
          status: candidateDuplicateGroups.status,
          updatedAt: candidateDuplicateGroups.updatedAt,
          resolvedAt: candidateDuplicateGroups.resolvedAt,
        })
        .from(candidateDuplicateGroups)
        .where(eq(candidateDuplicateGroups.id, groupId))
        .limit(1);
      const group = groupRows[0];
      if (!group) return null;

      const memberRows = await database
        .select({
          id: sourceCandidates.id,
          name: sourceCandidates.normalizedName,
          candidateType: sourceCandidates.candidateType,
          status: sourceCandidates.candidateStatus,
          priority: sourceCandidates.priority,
          firstSeenAt: sourceCandidates.firstSeenAt,
          lastSeenAt: sourceCandidates.lastSeenAt,
          updatedAt: sourceCandidates.updatedAt,
          canonicalEntityId: sourceCandidates.canonicalEntityId,
          canonicalLocationId: sourceCandidates.canonicalLocationId,
        })
        .from(sourceCandidates)
        .where(eq(sourceCandidates.duplicateGroupId, groupId))
        .orderBy(asc(sourceCandidates.id))
        .limit(maximumMembers + 1);

      if (memberRows.length < 2) {
        throw new CandidateDuplicateReviewError(
          'invalid_group',
          'The Candidate duplicate group has fewer than two members.',
        );
      }
      if (memberRows.length > maximumMembers) {
        throw new CandidateDuplicateReviewError(
          'invalid_group',
          'The Candidate duplicate group exceeds the bounded member limit.',
        );
      }

      const memberIds = memberRows.map((member) => member.id);
      const [sourceRows, signalRows] = await Promise.all([
        database
          .select({
            candidateId: candidateSourceRecords.candidateId,
            sourceType: sources.sourceType,
          })
          .from(candidateSourceRecords)
          .innerJoin(sourceRecords, eq(candidateSourceRecords.sourceRecordId, sourceRecords.id))
          .innerJoin(sources, eq(sourceRecords.sourceId, sources.id))
          .where(inArray(candidateSourceRecords.candidateId, memberIds)),
        database
          .select({
            id: candidateDuplicateSignals.id,
            leftCandidateId: candidateDuplicateSignals.leftCandidateId,
            rightCandidateId: candidateDuplicateSignals.rightCandidateId,
            reason: candidateDuplicateSignals.reason,
            strength: candidateDuplicateSignals.strength,
            createdAt: candidateDuplicateSignals.createdAt,
          })
          .from(candidateDuplicateSignals)
          .where(eq(candidateDuplicateSignals.duplicateGroupId, groupId))
          .orderBy(
            asc(candidateDuplicateSignals.createdAt),
            asc(candidateDuplicateSignals.id),
          )
          .limit(maximumSignals + 1),
      ]);

      const summaries = new Map<string, { sourceTypes: Set<(typeof sourceRows)[number]['sourceType']>; sourceCount: number }>();
      for (const source of sourceRows) {
        const summary = summaries.get(source.candidateId) ?? {
          sourceTypes: new Set(),
          sourceCount: 0,
        };
        summary.sourceTypes.add(source.sourceType);
        summary.sourceCount += 1;
        summaries.set(source.candidateId, summary);
      }

      const members: CandidateDuplicateReviewMember[] = memberRows.map((member) => {
        const summary = summaries.get(member.id);
        return {
          id: member.id,
          name: member.name,
          candidateType: member.candidateType,
          status: member.status,
          priority: member.priority,
          firstSeenAt: member.firstSeenAt.toISOString(),
          lastSeenAt: member.lastSeenAt.toISOString(),
          updatedAt: member.updatedAt.toISOString(),
          sourceTypes: summary ? [...summary.sourceTypes].sort() : [],
          sourceCount: summary?.sourceCount ?? 0,
          linkedEntity: member.canonicalEntityId !== null,
          linkedLocation: member.canonicalLocationId !== null,
        };
      });

      const signalsTruncated = signalRows.length > maximumSignals;
      const boundedSignals = signalsTruncated ? signalRows.slice(0, maximumSignals) : signalRows;
      return {
        group: {
          id: group.id,
          status: group.status,
          updatedAt: group.updatedAt.toISOString(),
          resolvedAt: group.resolvedAt?.toISOString() ?? null,
        },
        members,
        signals: boundedSignals.map((signal) => ({
          id: signal.id,
          leftCandidateId: signal.leftCandidateId,
          rightCandidateId: signal.rightCandidateId,
          reason: signal.reason,
          strength: signal.strength,
          createdAt: signal.createdAt.toISOString(),
        })),
        signalsTruncated,
      };
    },
  };
}
