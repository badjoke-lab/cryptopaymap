import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  evidence,
  networks,
  paymentMethods,
} from '../../db/schema';
import { evaluateEvidenceThreshold } from '../../schemas/evidence';
import {
  evaluateEvidenceReviewPaymentPrerequisites,
  evidenceReviewPaymentCombinationSchema,
} from './payment-prerequisites';
import {
  thresholdWithEvidenceIds,
  type EvidenceReviewDetailResponse,
  type EvidenceReviewQueueItem,
  type EvidenceReviewQueueQuery,
  type EvidenceReviewWorkspaceBackend,
} from './workspace';

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function createDrizzleEvidenceReviewWorkspaceBackend(
  database: CryptoPayMapDatabase,
): EvidenceReviewWorkspaceBackend {
  return {
    async loadQueue(query: EvidenceReviewQueueQuery) {
      const conditions = [
        isNull(evidence.deletedAt),
        isNotNull(evidence.claimId),
        isNull(acceptanceClaims.deletedAt),
        eq(evidence.reviewStatus, query.reviewStatus),
      ];
      if (query.evidenceClass !== undefined) {
        conditions.push(eq(evidence.evidenceClass, query.evidenceClass));
      }
      if (query.polarity !== undefined) {
        conditions.push(eq(evidence.polarity, query.polarity));
      }

      const rows = await database
        .select({
          id: evidence.id,
          claimId: evidence.claimId,
          claimStatus: acceptanceClaims.claimStatus,
          claimVisibility: acceptanceClaims.visibility,
          evidenceKind: evidence.evidenceKind,
          evidenceClass: evidence.evidenceClass,
          sourceType: evidence.sourceType,
          originRole: evidence.originRole,
          polarity: evidence.polarity,
          reviewStatus: evidence.reviewStatus,
          visibility: evidence.visibility,
          sourceName: evidence.sourceName,
          sourceUrl: evidence.sourceUrl,
          observedAt: evidence.observedAt,
          publishedAt: evidence.publishedAt,
          summary: evidence.summary,
          updatedAt: evidence.updatedAt,
        })
        .from(evidence)
        .innerJoin(acceptanceClaims, eq(evidence.claimId, acceptanceClaims.id))
        .where(and(...conditions))
        .orderBy(desc(evidence.updatedAt), desc(evidence.createdAt), asc(evidence.id))
        .limit(query.limit + 1);

      const items: EvidenceReviewQueueItem[] = rows.slice(0, query.limit).map((row) => ({
        id: row.id,
        claimId: row.claimId as string,
        claimStatus: row.claimStatus,
        claimVisibility: row.claimVisibility,
        evidenceKind: row.evidenceKind,
        evidenceClass: row.evidenceClass,
        sourceType: row.sourceType,
        originRole: row.originRole,
        polarity: row.polarity,
        reviewStatus: row.reviewStatus,
        visibility: row.visibility,
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl,
        observedAt: iso(row.observedAt),
        publishedAt: iso(row.publishedAt),
        summary: row.summary,
        updatedAt: row.updatedAt.toISOString(),
      }));
      return { items, hasMore: rows.length > query.limit };
    },

    async loadDetail(evidenceId: string, asOf: Date) {
      const rows = await database
        .select({
          id: evidence.id,
          claimId: evidence.claimId,
          claimStatus: acceptanceClaims.claimStatus,
          claimVisibility: acceptanceClaims.visibility,
          evidenceKind: evidence.evidenceKind,
          evidenceClass: evidence.evidenceClass,
          sourceType: evidence.sourceType,
          originRole: evidence.originRole,
          polarity: evidence.polarity,
          reviewStatus: evidence.reviewStatus,
          visibility: evidence.visibility,
          sourceName: evidence.sourceName,
          sourceUrl: evidence.sourceUrl,
          sourceNativeId: evidence.sourceNativeId,
          observedAt: evidence.observedAt,
          publishedAt: evidence.publishedAt,
          fetchedAt: evidence.fetchedAt,
          summary: evidence.summary,
          archiveUrl: evidence.archiveUrl,
          attribution: evidence.attribution,
          independenceKey: evidence.independenceKey,
          evidenceUpdatedAt: evidence.updatedAt,
          routeType: acceptanceClaims.routeType,
          acceptanceScope: acceptanceClaims.acceptanceScope,
          customerPaysCrypto: acceptanceClaims.customerPaysCrypto,
          merchantExplicitlyAcceptsCrypto: acceptanceClaims.merchantExplicitlyAcceptsCrypto,
          howToPay: acceptanceClaims.howToPay,
          merchantReceives: acceptanceClaims.merchantReceives,
          restrictions: acceptanceClaims.restrictions,
          firstConfirmedAt: acceptanceClaims.firstConfirmedAt,
          lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
          nextReviewAt: acceptanceClaims.nextReviewAt,
          endedAt: acceptanceClaims.endedAt,
          endedReason: acceptanceClaims.endedReason,
          claimUpdatedAt: acceptanceClaims.updatedAt,
        })
        .from(evidence)
        .innerJoin(acceptanceClaims, eq(evidence.claimId, acceptanceClaims.id))
        .where(
          and(
            eq(evidence.id, evidenceId),
            isNull(evidence.deletedAt),
            isNull(acceptanceClaims.deletedAt),
            isNotNull(evidence.claimId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined || row.claimId === null) return null;

      const acceptedRows = await database
        .select({
          id: evidence.id,
          evidenceClass: evidence.evidenceClass,
          originRole: evidence.originRole,
          polarity: evidence.polarity,
          sourceName: evidence.sourceName,
          sourceUrl: evidence.sourceUrl,
          observedAt: evidence.observedAt,
          summary: evidence.summary,
          independenceKey: evidence.independenceKey,
          reviewStatus: evidence.reviewStatus,
          updatedAt: evidence.updatedAt,
        })
        .from(evidence)
        .where(
          and(
            eq(evidence.claimId, row.claimId),
            eq(evidence.reviewStatus, 'accepted'),
            isNull(evidence.deletedAt),
          ),
        )
        .orderBy(asc(evidence.id));

      const paymentRows = await database
        .select({
          id: claimAssets.id,
          assetSymbol: assets.symbol,
          assetStatus: assets.status,
          networkSlug: networks.slug,
          networkStatus: networks.status,
          paymentMethodSlug: paymentMethods.slug,
          paymentMethodStatus: paymentMethods.status,
          isPrimary: claimAssets.isPrimary,
        })
        .from(claimAssets)
        .innerJoin(assets, eq(claimAssets.assetId, assets.id))
        .innerJoin(networks, eq(claimAssets.networkId, networks.id))
        .innerJoin(paymentMethods, eq(claimAssets.paymentMethodId, paymentMethods.id))
        .where(eq(claimAssets.claimId, row.claimId))
        .orderBy(asc(claimAssets.id));
      const paymentCombinations = evidenceReviewPaymentCombinationSchema.array().max(100).parse(paymentRows);

      const threshold = evaluateEvidenceThreshold(
        acceptedRows.map((item) => ({
          evidenceClass: item.evidenceClass,
          originRole: item.originRole,
          polarity: item.polarity,
          reviewStatus: item.reviewStatus,
          independenceKey: item.independenceKey,
          observedAt: iso(item.observedAt),
        })),
      );
      const paymentPrerequisites = evaluateEvidenceReviewPaymentPrerequisites(
        row.routeType,
        paymentCombinations,
      );

      const detail: EvidenceReviewDetailResponse = {
        generatedAt: asOf.toISOString(),
        evidence: {
          id: row.id,
          claimId: row.claimId,
          claimStatus: row.claimStatus,
          claimVisibility: row.claimVisibility,
          evidenceKind: row.evidenceKind,
          evidenceClass: row.evidenceClass,
          sourceType: row.sourceType,
          originRole: row.originRole,
          polarity: row.polarity,
          reviewStatus: row.reviewStatus,
          visibility: row.visibility,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          sourceNativeId: row.sourceNativeId,
          observedAt: iso(row.observedAt),
          publishedAt: iso(row.publishedAt),
          fetchedAt: iso(row.fetchedAt),
          summary: row.summary,
          archiveUrl: row.archiveUrl,
          attribution: row.attribution,
          independenceKey: row.independenceKey,
          updatedAt: row.evidenceUpdatedAt.toISOString(),
        },
        claim: {
          id: row.claimId,
          claimStatus: row.claimStatus,
          visibility: row.claimVisibility,
          routeType: row.routeType,
          acceptanceScope: row.acceptanceScope,
          customerPaysCrypto: row.customerPaysCrypto,
          merchantExplicitlyAcceptsCrypto: row.merchantExplicitlyAcceptsCrypto,
          howToPay: row.howToPay,
          merchantReceives: row.merchantReceives,
          restrictions: row.restrictions,
          firstConfirmedAt: iso(row.firstConfirmedAt),
          lastConfirmedAt: iso(row.lastConfirmedAt),
          nextReviewAt: iso(row.nextReviewAt),
          endedAt: iso(row.endedAt),
          endedReason: row.endedReason,
          updatedAt: row.claimUpdatedAt.toISOString(),
        },
        paymentCombinations,
        paymentPrerequisites,
        acceptedEvidence: acceptedRows.map((item) => ({
          id: item.id,
          evidenceClass: item.evidenceClass,
          originRole: item.originRole,
          polarity: item.polarity,
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          observedAt: iso(item.observedAt),
          summary: item.summary,
          updatedAt: item.updatedAt.toISOString(),
        })),
        threshold: thresholdWithEvidenceIds(
          threshold,
          acceptedRows.map((item) => item.id),
        ),
      };
      return detail;
    },
  };
}