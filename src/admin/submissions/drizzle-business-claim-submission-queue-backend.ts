import { and, asc, desc, eq, gt, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionPayloads, submissions } from '../../db/schema';
import {
  BusinessClaimSubmissionQueueError,
  encodeBusinessClaimSubmissionQueueCursor,
  type BusinessClaimSubmissionQueueBackend,
  type BusinessClaimSubmissionQueueItem,
  type BusinessClaimSubmissionQueuePageData,
  type BusinessClaimSubmissionQueueQuery,
} from './business-claim-queue';

function cursorFilter(query: BusinessClaimSubmissionQueueQuery): SQL | undefined {
  if (query.cursor === null) return undefined;
  const submittedAt = new Date(query.cursor.submittedAt);
  return or(
    sql`${submissions.priority} < ${query.cursor.priority}`,
    and(eq(submissions.priority, query.cursor.priority), gt(submissions.submittedAt, submittedAt)),
    and(
      eq(submissions.priority, query.cursor.priority),
      eq(submissions.submittedAt, submittedAt),
      gt(submissions.id, query.cursor.id),
    ),
  );
}

export interface BusinessClaimSubmissionQueueIdentityRow {
  submissionType: string;
  storedTargetType: string | null;
  storedTargetId: string | null;
  normalizedTargetType: string;
  normalizedTargetId: string;
}

export function assertBusinessClaimSubmissionQueueIdentity(
  row: BusinessClaimSubmissionQueueIdentityRow,
): void {
  if (
    row.submissionType !== 'claim' ||
    row.storedTargetType !== row.normalizedTargetType ||
    row.storedTargetId !== row.normalizedTargetId
  ) {
    throw new BusinessClaimSubmissionQueueError(
      'invalid_page',
      'Stored Business Claim metadata does not match the normalized review projection.',
    );
  }
}

export function createDrizzleBusinessClaimSubmissionQueueBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimSubmissionQueueBackend {
  return {
    async loadPage(query): Promise<BusinessClaimSubmissionQueuePageData> {
      const targetType = sql<string>`${submissionPayloads.normalizedPayload} #>> '{targetType}'`;
      const targetId = sql<string>`${submissionPayloads.normalizedPayload} #>> '{targetId}'`;
      const claimantRole = sql<string>`${submissionPayloads.normalizedPayload} #>> '{claimantRole}'`;
      const requestedScopes = sql<unknown>`${submissionPayloads.normalizedPayload} -> 'requestedScopes'`;
      const verificationMethod = sql<string>`${submissionPayloads.normalizedPayload} #>> '{verification,method}'`;
      const protectedContactPresent = sql<boolean>`coalesce((${submissionPayloads.normalizedPayload} #>> '{verification,protectedContactPresent}')::boolean, false)`;
      const privateProofPresent = sql<boolean>`coalesce((${submissionPayloads.normalizedPayload} #>> '{verification,privateProofPresent}')::boolean, false)`;
      const assistedVerifierReferencePresent = sql<boolean>`coalesce((${submissionPayloads.normalizedPayload} #>> '{verification,assistedVerifierReferencePresent}')::boolean, false)`;
      const evidenceCount = sql<number>`coalesce(jsonb_array_length(${submissionPayloads.normalizedPayload} -> 'evidenceLinks'), 0)`;

      const rows = await database
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          storedTargetType: submissions.targetType,
          storedTargetId: submissions.targetId,
          normalizedTargetType: targetType,
          normalizedTargetId: targetId,
          claimantRole,
          requestedScopes,
          verificationMethod,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          priority: submissions.priority,
          evidenceCount,
          protectedContactPresent,
          privateProofPresent,
          assistedVerifierReferencePresent,
          submittedAt: submissions.submittedAt,
          updatedAt: submissions.updatedAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(
          and(
            eq(submissions.submissionType, 'claim'),
            isNotNull(submissionPayloads.normalizedPayload),
            inArray(submissions.workflowStatus, query.statuses),
            cursorFilter(query),
          ),
        )
        .orderBy(desc(submissions.priority), asc(submissions.submittedAt), asc(submissions.id))
        .limit(query.limit + 1);

      const hasNextPage = rows.length > query.limit;
      const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
      const items: BusinessClaimSubmissionQueueItem[] = pageRows.map((row) => {
        assertBusinessClaimSubmissionQueueIdentity(row);
        return {
          id: row.id,
          publicId: row.publicId,
          targetType: row.storedTargetType as BusinessClaimSubmissionQueueItem['targetType'],
          targetId: row.storedTargetId as string,
          claimantRole: row.claimantRole as BusinessClaimSubmissionQueueItem['claimantRole'],
          requestedScopes:
            row.requestedScopes as BusinessClaimSubmissionQueueItem['requestedScopes'],
          verificationMethod:
            row.verificationMethod as BusinessClaimSubmissionQueueItem['verificationMethod'],
          workflowStatus: row.workflowStatus,
          resolution: row.resolution,
          priority: row.priority,
          evidenceCount: row.evidenceCount,
          protectedContactPresent: row.protectedContactPresent,
          privateProofPresent: row.privateProofPresent,
          assistedVerifierReferencePresent: row.assistedVerifierReferencePresent,
          submittedAt: row.submittedAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });

      const lastRow = pageRows.at(-1);
      return {
        items,
        hasNextPage,
        nextCursor:
          hasNextPage && lastRow
            ? encodeBusinessClaimSubmissionQueueCursor({
                priority: lastRow.priority,
                submittedAt: lastRow.submittedAt.toISOString(),
                id: lastRow.id,
              })
            : null,
      };
    },
  };
}
