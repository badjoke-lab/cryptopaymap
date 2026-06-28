import { and, count, desc, eq, gt, gte, inArray, isNull, lte } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  candidateDuplicateGroups,
  evidence,
  importBatches,
  mediaAssets,
  sourceCandidates,
  verificationEvents,
} from '../../db/schema';
import type { AdminDashboardSummaryBackend, AdminDashboardSummaryData } from './summary';

const highPriorityThreshold = 800;
const dueSoonWindowMilliseconds = 30 * 24 * 60 * 60 * 1_000;

function countForStatus(
  rows: readonly { status: string; value: number }[],
  status: string,
): number {
  return rows.find((row) => row.status === status)?.value ?? 0;
}

export function createDrizzleAdminDashboardBackend(
  database: CryptoPayMapDatabase,
): AdminDashboardSummaryBackend {
  return {
    async loadSummary(asOf: Date): Promise<AdminDashboardSummaryData> {
      const dueSoonAt = new Date(asOf.getTime() + dueSoonWindowMilliseconds);

      const [
        candidateRows,
        highPriorityRows,
        openDuplicateRows,
        pendingEvidenceRows,
        overdueRows,
        dueSoonRows,
        staleRows,
        pendingMediaRows,
        latestImportRows,
        recentActivityRows,
      ] = await Promise.all([
        database
          .select({ status: sourceCandidates.candidateStatus, value: count() })
          .from(sourceCandidates)
          .where(inArray(sourceCandidates.candidateStatus, ['new', 'triaged', 'linked']))
          .groupBy(sourceCandidates.candidateStatus),
        database
          .select({ value: count() })
          .from(sourceCandidates)
          .where(
            and(
              inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
              gte(sourceCandidates.priority, highPriorityThreshold),
            ),
          ),
        database
          .select({ value: count() })
          .from(candidateDuplicateGroups)
          .where(eq(candidateDuplicateGroups.status, 'open')),
        database
          .select({ value: count() })
          .from(evidence)
          .where(and(eq(evidence.reviewStatus, 'pending'), isNull(evidence.deletedAt))),
        database
          .select({ value: count() })
          .from(acceptanceClaims)
          .where(
            and(
              eq(acceptanceClaims.claimStatus, 'confirmed'),
              isNull(acceptanceClaims.deletedAt),
              lte(acceptanceClaims.nextReviewAt, asOf),
            ),
          ),
        database
          .select({ value: count() })
          .from(acceptanceClaims)
          .where(
            and(
              eq(acceptanceClaims.claimStatus, 'confirmed'),
              isNull(acceptanceClaims.deletedAt),
              gt(acceptanceClaims.nextReviewAt, asOf),
              lte(acceptanceClaims.nextReviewAt, dueSoonAt),
            ),
          ),
        database
          .select({ value: count() })
          .from(acceptanceClaims)
          .where(
            and(eq(acceptanceClaims.claimStatus, 'stale'), isNull(acceptanceClaims.deletedAt)),
          ),
        database
          .select({ value: count() })
          .from(mediaAssets)
          .where(and(eq(mediaAssets.reviewStatus, 'pending'), isNull(mediaAssets.deletedAt))),
        database
          .select({
            completedAt: importBatches.completedAt,
            acceptedCount: importBatches.acceptedCount,
            rejectedCount: importBatches.rejectedCount,
            duplicateSignalCount: importBatches.duplicateSignalCount,
          })
          .from(importBatches)
          .orderBy(desc(importBatches.completedAt), desc(importBatches.createdAt))
          .limit(1),
        database
          .select({
            eventType: verificationEvents.eventType,
            effectiveAt: verificationEvents.effectiveAt,
          })
          .from(verificationEvents)
          .orderBy(desc(verificationEvents.effectiveAt), desc(verificationEvents.createdAt))
          .limit(10),
      ]);

      const newCandidates = countForStatus(candidateRows, 'new');
      const triagedCandidates = countForStatus(candidateRows, 'triaged');
      const latestImport = latestImportRows[0];

      return {
        candidateQueue: {
          totalActionable: newCandidates + triagedCandidates,
          new: newCandidates,
          triaged: triagedCandidates,
          linked: countForStatus(candidateRows, 'linked'),
          highPriority: highPriorityRows[0]?.value ?? 0,
          openDuplicateGroups: openDuplicateRows[0]?.value ?? 0,
        },
        evidenceReview: {
          pending: pendingEvidenceRows[0]?.value ?? 0,
        },
        rechecks: {
          overdue: overdueRows[0]?.value ?? 0,
          dueSoon: dueSoonRows[0]?.value ?? 0,
          stale: staleRows[0]?.value ?? 0,
        },
        mediaReview: {
          pending: pendingMediaRows[0]?.value ?? 0,
        },
        imports: {
          lastCompletedAt: latestImport?.completedAt.toISOString() ?? null,
          latestAcceptedCount: latestImport?.acceptedCount ?? 0,
          latestRejectedCount: latestImport?.rejectedCount ?? 0,
          latestDuplicateSignalCount: latestImport?.duplicateSignalCount ?? 0,
        },
        publication: {
          state: 'not_available',
          reason: 'release_control_not_implemented',
        },
        recentActivity: recentActivityRows.map((event) => ({
          eventType: event.eventType,
          effectiveAt: event.effectiveAt.toISOString(),
        })),
      };
    },
  };
}
