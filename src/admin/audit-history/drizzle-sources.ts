import { desc } from 'drizzle-orm';
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

export function createDrizzleCandidateDuplicateAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'candidate',
    async loadAuditHistorySource(_query, sourceLimit) {
      const rows = await database
        .select()
        .from(candidateDuplicateDecisions)
        .orderBy(
          desc(candidateDuplicateDecisions.decidedAt),
          desc(candidateDuplicateDecisions.createdAt),
          desc(candidateDuplicateDecisions.id),
        )
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
    async loadAuditHistorySource(_query, sourceLimit) {
      const rows = await database
        .select()
        .from(candidatePromotionDecisions)
        .orderBy(
          desc(candidatePromotionDecisions.promotedAt),
          desc(candidatePromotionDecisions.createdAt),
          desc(candidatePromotionDecisions.id),
        )
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(candidatePromotionAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleEvidenceReviewAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'evidence',
    async loadAuditHistorySource(_query, sourceLimit) {
      const rows = await database
        .select()
        .from(evidenceReviewDecisions)
        .orderBy(
          desc(evidenceReviewDecisions.decidedAt),
          desc(evidenceReviewDecisions.createdAt),
          desc(evidenceReviewDecisions.id),
        )
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
    async loadAuditHistorySource(_query, sourceLimit) {
      const rows = await database
        .select()
        .from(reconfirmationExpirations)
        .orderBy(
          desc(reconfirmationExpirations.effectiveAt),
          desc(reconfirmationExpirations.createdAt),
          desc(reconfirmationExpirations.id),
        )
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(reconfirmationExpirationAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleMediaReviewAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'media',
    async loadAuditHistorySource(_query, sourceLimit) {
      const rows = await database
        .select()
        .from(mediaReviewDecisions)
        .orderBy(
          desc(mediaReviewDecisions.decidedAt),
          desc(mediaReviewDecisions.createdAt),
          desc(mediaReviewDecisions.id),
        )
        .limit(sourceLimit + 1);
      return {
        items: rows.slice(0, sourceLimit).map(mediaReviewDecisionAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}

export function createDrizzleExportReleaseDecisionAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'export',
    async loadAuditHistorySource(_query, sourceLimit) {
      const rows = await database
        .select()
        .from(exportReleaseDecisions)
        .orderBy(
          desc(exportReleaseDecisions.decidedAt),
          desc(exportReleaseDecisions.createdAt),
          desc(exportReleaseDecisions.id),
        )
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
    async loadAuditHistorySource(_query, sourceLimit) {
      const rows = await database
        .select()
        .from(exportActivationRecords)
        .orderBy(
          desc(exportActivationRecords.publishedAt),
          desc(exportActivationRecords.createdAt),
          desc(exportActivationRecords.id),
        )
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
): readonly AuditHistorySource[] {
  return [
    createDrizzleCandidateDuplicateAuditSource(database),
    createDrizzleCandidatePromotionAuditSource(database),
    createDrizzleEvidenceReviewAuditSource(database),
    createDrizzleReconfirmationAuditSource(database),
    createDrizzleMediaReviewAuditSource(database),
    createDrizzleExportReleaseDecisionAuditSource(database),
    createDrizzleExportActivationAuditSource(database),
  ];
}
