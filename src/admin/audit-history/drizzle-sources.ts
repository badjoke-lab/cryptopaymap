import { and, desc, eq, gte, lt, lte, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidateDuplicateDecisions,
  candidatePromotionDecisions,
  evidenceReviewDecisions,
  exportActivationRecords,
  exportReleaseDecisions,
  mediaReviewDecisions,
  reconfirmationExpirations,
} from '../../db/schema';
import type { AuditHistoryQuery } from './contract';
import type { AuditHistorySource } from './aggregation';
import {
  candidateDuplicateDecisionAuditItem,
  candidatePromotionAuditItem,
  evidenceReviewDecisionAuditItem,
  exportActivationAuditItem,
  exportReleaseDecisionAuditItem,
  mediaReviewDecisionAuditItem,
  reconfirmationExpirationAuditItem,
} from './normalizers';

function commonConditions(
  query: AuditHistoryQuery,
  occurredAt: AnyColumn,
  actorId: AnyColumn,
  sourceKind: string,
  sourceId: AnyColumn,
): SQL[] {
  const conditions: SQL[] = [];
  if (query.actorId !== undefined) conditions.push(eq(actorId, query.actorId));
  if (query.from !== undefined) conditions.push(gte(occurredAt, new Date(query.from)));
  if (query.to !== undefined) conditions.push(lte(occurredAt, new Date(query.to)));
  if (query.before !== undefined && query.beforeId !== undefined) {
    const before = new Date(query.before);
    conditions.push(
      or(
        lt(occurredAt, before),
        and(
          eq(occurredAt, before),
          sql`${sourceKind} || ':' || ${sourceId}::text < ${query.beforeId}`,
        ),
      ) as SQL,
    );
  }
  return conditions;
}

function whereOrUndefined(conditions: SQL[]): SQL | undefined {
  return conditions.length === 0 ? undefined : and(...conditions);
}

export function createDrizzleCandidateDuplicateAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'candidate',
    async loadAuditHistorySource(query, sourceLimit) {
      const conditions = commonConditions(
        query,
        candidateDuplicateDecisions.decidedAt,
        candidateDuplicateDecisions.actorId,
        'candidate_duplicate_decision',
        candidateDuplicateDecisions.id,
      );
      if (query.targetType === 'duplicate_group') {
        if (query.targetId !== undefined) {
          conditions.push(eq(candidateDuplicateDecisions.duplicateGroupId, query.targetId));
        }
      } else if (query.targetType === 'source_candidate') {
        if (query.targetId !== undefined) {
          conditions.push(
            sql`${candidateDuplicateDecisions.memberCandidateIds} @> ${JSON.stringify([query.targetId])}::jsonb`,
          );
        }
      } else if (query.targetType !== undefined) {
        return { items: [], hasMore: false };
      }

      const rows = await database
        .select()
        .from(candidateDuplicateDecisions)
        .where(whereOrUndefined(conditions))
        .orderBy(desc(candidateDuplicateDecisions.decidedAt), desc(candidateDuplicateDecisions.id))
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(candidateDuplicateDecisionAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleCandidatePromotionAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'candidate',
    async loadAuditHistorySource(query, sourceLimit) {
      const conditions = commonConditions(
        query,
        candidatePromotionDecisions.promotedAt,
        candidatePromotionDecisions.actorId,
        'candidate_promotion',
        candidatePromotionDecisions.id,
      );
      if (query.targetType === 'source_candidate' && query.targetId !== undefined) {
        conditions.push(eq(candidatePromotionDecisions.candidateId, query.targetId));
      } else if (query.targetType === 'acceptance_claim' && query.targetId !== undefined) {
        conditions.push(eq(candidatePromotionDecisions.claimId, query.targetId));
      } else if (query.targetType !== undefined && query.targetId !== undefined) {
        return { items: [], hasMore: false };
      }

      const rows = await database
        .select()
        .from(candidatePromotionDecisions)
        .where(whereOrUndefined(conditions))
        .orderBy(desc(candidatePromotionDecisions.promotedAt), desc(candidatePromotionDecisions.id))
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(candidatePromotionAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleEvidenceAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'evidence',
    async loadAuditHistorySource(query, sourceLimit) {
      const conditions = commonConditions(
        query,
        evidenceReviewDecisions.decidedAt,
        evidenceReviewDecisions.actorId,
        'evidence_review_decision',
        evidenceReviewDecisions.id,
      );
      if (query.targetType === 'evidence' && query.targetId !== undefined) {
        conditions.push(eq(evidenceReviewDecisions.evidenceId, query.targetId));
      } else if (query.targetType === 'acceptance_claim' && query.targetId !== undefined) {
        conditions.push(eq(evidenceReviewDecisions.claimId, query.targetId));
      } else if (query.targetType !== undefined && query.targetId !== undefined) {
        return { items: [], hasMore: false };
      }

      const rows = await database
        .select()
        .from(evidenceReviewDecisions)
        .where(whereOrUndefined(conditions))
        .orderBy(desc(evidenceReviewDecisions.decidedAt), desc(evidenceReviewDecisions.id))
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(evidenceReviewDecisionAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleReconfirmationAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'reconfirmation',
    async loadAuditHistorySource(query, sourceLimit) {
      const conditions = commonConditions(
        query,
        reconfirmationExpirations.effectiveAt,
        reconfirmationExpirations.actorId,
        'reconfirmation_expiration',
        reconfirmationExpirations.id,
      );
      if (query.targetType === 'acceptance_claim' && query.targetId !== undefined) {
        conditions.push(eq(reconfirmationExpirations.claimId, query.targetId));
      } else if (query.targetType !== undefined && query.targetId !== undefined) {
        return { items: [], hasMore: false };
      }

      const rows = await database
        .select()
        .from(reconfirmationExpirations)
        .where(whereOrUndefined(conditions))
        .orderBy(desc(reconfirmationExpirations.effectiveAt), desc(reconfirmationExpirations.id))
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(reconfirmationExpirationAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleMediaAuditSource(database: CryptoPayMapDatabase): AuditHistorySource {
  return {
    domain: 'media',
    async loadAuditHistorySource(query, sourceLimit) {
      const conditions = commonConditions(
        query,
        mediaReviewDecisions.decidedAt,
        mediaReviewDecisions.actorId,
        'media_review_decision',
        mediaReviewDecisions.id,
      );
      if (query.targetType === 'media_asset' && query.targetId !== undefined) {
        conditions.push(eq(mediaReviewDecisions.mediaAssetId, query.targetId));
      } else if (query.targetType === 'acceptance_claim' && query.targetId !== undefined) {
        conditions.push(
          and(
            eq(mediaReviewDecisions.expectedSubjectType, 'claim'),
            eq(mediaReviewDecisions.expectedSubjectId, query.targetId),
          ) as SQL,
        );
      } else if (query.targetType === 'evidence' && query.targetId !== undefined) {
        conditions.push(
          and(
            eq(mediaReviewDecisions.expectedSubjectType, 'evidence'),
            eq(mediaReviewDecisions.expectedSubjectId, query.targetId),
          ) as SQL,
        );
      } else if (query.targetType !== undefined && query.targetId !== undefined) {
        return { items: [], hasMore: false };
      }

      const rows = await database
        .select()
        .from(mediaReviewDecisions)
        .where(whereOrUndefined(conditions))
        .orderBy(desc(mediaReviewDecisions.decidedAt), desc(mediaReviewDecisions.id))
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(mediaReviewDecisionAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleExportReleaseAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'export',
    async loadAuditHistorySource(query, sourceLimit) {
      const conditions = commonConditions(
        query,
        exportReleaseDecisions.decidedAt,
        exportReleaseDecisions.actorId,
        'export_release_decision',
        exportReleaseDecisions.id,
      );
      if (query.targetType === 'export_snapshot' && query.targetId !== undefined) {
        conditions.push(eq(exportReleaseDecisions.snapshotDigest, query.targetId));
      } else if (query.targetType !== undefined && query.targetId !== undefined) {
        return { items: [], hasMore: false };
      }

      const rows = await database
        .select()
        .from(exportReleaseDecisions)
        .where(whereOrUndefined(conditions))
        .orderBy(desc(exportReleaseDecisions.decidedAt), desc(exportReleaseDecisions.id))
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(exportReleaseDecisionAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleExportActivationAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'export',
    async loadAuditHistorySource(query, sourceLimit) {
      const conditions = commonConditions(
        query,
        exportActivationRecords.publishedAt,
        exportActivationRecords.actorId,
        'export_activation',
        exportActivationRecords.id,
      );
      if (query.targetType === 'export_snapshot' && query.targetId !== undefined) {
        conditions.push(
          or(
            eq(exportActivationRecords.snapshotDigest, query.targetId),
            eq(exportActivationRecords.previousSnapshotDigest, query.targetId),
          ) as SQL,
        );
      } else if (query.targetType !== undefined && query.targetId !== undefined) {
        return { items: [], hasMore: false };
      }

      const rows = await database
        .select()
        .from(exportActivationRecords)
        .where(whereOrUndefined(conditions))
        .orderBy(desc(exportActivationRecords.publishedAt), desc(exportActivationRecords.id))
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(exportActivationAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleAuditHistorySources(
  database: CryptoPayMapDatabase,
): AuditHistorySource[] {
  return [
    createDrizzleCandidateDuplicateAuditSource(database),
    createDrizzleCandidatePromotionAuditSource(database),
    createDrizzleEvidenceAuditSource(database),
    createDrizzleReconfirmationAuditSource(database),
    createDrizzleMediaAuditSource(database),
    createDrizzleExportReleaseAuditSource(database),
    createDrizzleExportActivationAuditSource(database),
  ];
}
