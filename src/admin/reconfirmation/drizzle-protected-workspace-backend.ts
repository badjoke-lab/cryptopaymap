import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  entities,
  evidence,
  locations,
  submissionEvents,
  verificationEvents,
} from '../../db/schema';
import {
  evaluateReconfirmationClaim,
  type ReconfirmationClaimSnapshot,
  type ReconfirmationQueueItem,
} from './queue';
import type {
  ProtectedReconfirmationQueueItem,
  ProtectedReconfirmationWorkspaceBackend,
} from './protected-contract';

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

interface QueueIdentity {
  entityName: string;
  entityType: 'merchant' | 'online_service' | 'payment_processor' | 'payment_program' | 'platform';
  locationName: string | null;
  locationLocality: string | null;
  locationCountryCode: string | null;
}

function decorate(
  item: ReconfirmationQueueItem,
  identity: QueueIdentity,
): ProtectedReconfirmationQueueItem {
  return {
    ...item,
    entityName: identity.entityName,
    entityType: identity.entityType,
    locationName: identity.locationName,
    locationLocality: identity.locationLocality,
    locationCountryCode: identity.locationCountryCode,
  };
}

function negativeEvidenceSignalAt() {
  return sql<Date | null>`(
    select max(${evidence.createdAt})
    from ${evidence}
    inner join ${submissionEvents}
      on ${submissionEvents.submissionId} = ${evidence.submissionId}
    where ${evidence.claimId} = ${acceptanceClaims.id}
      and ${evidence.reviewStatus} = 'accepted'
      and ${evidence.polarity} = 'contradicting'
      and ${evidence.deletedAt} is null
      and ${submissionEvents.action} = 'negative_report_evidence_decided'
      and ${submissionEvents.reasonCode} = 'negative_evidence_recheck_priority'
      and not exists (
        select 1
        from ${verificationEvents}
        where ${verificationEvents.claimId} = ${acceptanceClaims.id}
          and ${verificationEvents.eventType} in ('reconfirmed', 'restored', 'marked_stale', 'ended', 'corrected')
          and ${verificationEvents.effectiveAt} >= ${evidence.createdAt}
      )
  )`;
}

function hasNegativeEvidenceSignal() {
  return sql<boolean>`exists (
    select 1
    from ${evidence}
    inner join ${submissionEvents}
      on ${submissionEvents.submissionId} = ${evidence.submissionId}
    where ${evidence.claimId} = ${acceptanceClaims.id}
      and ${evidence.reviewStatus} = 'accepted'
      and ${evidence.polarity} = 'contradicting'
      and ${evidence.deletedAt} is null
      and ${submissionEvents.action} = 'negative_report_evidence_decided'
      and ${submissionEvents.reasonCode} = 'negative_evidence_recheck_priority'
      and not exists (
        select 1
        from ${verificationEvents}
        where ${verificationEvents.claimId} = ${acceptanceClaims.id}
          and ${verificationEvents.eventType} in ('reconfirmed', 'restored', 'marked_stale', 'ended', 'corrected')
          and ${verificationEvents.effectiveAt} >= ${evidence.createdAt}
      )
  )`;
}

export function createDrizzleProtectedReconfirmationWorkspaceBackend(
  database: CryptoPayMapDatabase,
): ProtectedReconfirmationWorkspaceBackend {
  return {
    async loadQueue(query, asOf) {
      const dueSoonCutoff = new Date(asOf.getTime() + query.dueSoonDays * 86_400_000);
      const signalAt = negativeEvidenceSignalAt();
      const hasSignal = hasNegativeEvidenceSignal();
      const priority = sql<number>`case
        when ${acceptanceClaims.claimStatus} = 'confirmed'
          and ${acceptanceClaims.nextReviewAt} is not null
          and ${acceptanceClaims.nextReviewAt} <= ${asOf} then 0
        when ${hasSignal} then 5
        when ${acceptanceClaims.claimStatus} = 'confirmed'
          and ${acceptanceClaims.nextReviewAt} is null then 10
        when ${acceptanceClaims.claimStatus} = 'stale' then 100
        else 200
      end`;

      const rows = await database
        .select({
          id: acceptanceClaims.id,
          claimStatus: acceptanceClaims.claimStatus,
          visibility: acceptanceClaims.visibility,
          lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
          nextReviewAt: acceptanceClaims.nextReviewAt,
          updatedAt: acceptanceClaims.updatedAt,
          deletedAt: acceptanceClaims.deletedAt,
          negativeEvidenceAt: signalAt,
          entityName: entities.name,
          entityType: entities.entityType,
          locationName: locations.name,
          locationLocality: locations.locality,
          locationCountryCode: locations.countryCode,
        })
        .from(acceptanceClaims)
        .innerJoin(entities, eq(acceptanceClaims.entityId, entities.id))
        .leftJoin(locations, eq(acceptanceClaims.locationId, locations.id))
        .where(
          and(
            isNull(acceptanceClaims.deletedAt),
            isNull(entities.deletedAt),
            or(isNull(acceptanceClaims.locationId), isNull(locations.deletedAt)),
            or(
              and(
                or(
                  eq(acceptanceClaims.claimStatus, 'confirmed'),
                  eq(acceptanceClaims.claimStatus, 'stale'),
                ),
                hasSignal,
              ),
              eq(acceptanceClaims.claimStatus, 'stale'),
              and(
                eq(acceptanceClaims.claimStatus, 'confirmed'),
                or(
                  isNull(acceptanceClaims.nextReviewAt),
                  lte(acceptanceClaims.nextReviewAt, dueSoonCutoff),
                ),
              ),
            ),
          ),
        )
        .orderBy(priority, asc(acceptanceClaims.nextReviewAt), asc(acceptanceClaims.id))
        .limit(query.limit + 1);

      const items = rows
        .slice(0, query.limit)
        .map((row) => {
          const snapshot: ReconfirmationClaimSnapshot = {
            id: row.id,
            claimStatus: row.claimStatus,
            visibility: row.visibility,
            lastConfirmedAt: iso(row.lastConfirmedAt),
            nextReviewAt: iso(row.nextReviewAt),
            updatedAt: row.updatedAt.toISOString(),
            deletedAt: iso(row.deletedAt),
          };
          const item = evaluateReconfirmationClaim(
            snapshot,
            asOf,
            { dueSoonDays: query.dueSoonDays },
            iso(row.negativeEvidenceAt),
          );
          return item === null
            ? null
            : decorate(item, {
                entityName: row.entityName,
                entityType: row.entityType,
                locationName: row.locationName,
                locationLocality: row.locationLocality,
                locationCountryCode: row.locationCountryCode,
              });
        })
        .filter((item): item is ProtectedReconfirmationQueueItem => item !== null);

      return { items, hasMore: rows.length > query.limit };
    },

    async loadDetail(claimId, asOf, dueSoonDays) {
      const signalAt = negativeEvidenceSignalAt();
      const rows = await database
        .select({
          id: acceptanceClaims.id,
          entityId: acceptanceClaims.entityId,
          locationId: acceptanceClaims.locationId,
          claimScope: acceptanceClaims.claimScope,
          routeType: acceptanceClaims.routeType,
          acceptanceScope: acceptanceClaims.acceptanceScope,
          claimStatus: acceptanceClaims.claimStatus,
          visibility: acceptanceClaims.visibility,
          customerPaysCrypto: acceptanceClaims.customerPaysCrypto,
          merchantExplicitlyAcceptsCrypto: acceptanceClaims.merchantExplicitlyAcceptsCrypto,
          howToPay: acceptanceClaims.howToPay,
          merchantReceives: acceptanceClaims.merchantReceives,
          restrictions: acceptanceClaims.restrictions,
          firstConfirmedAt: acceptanceClaims.firstConfirmedAt,
          lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
          nextReviewAt: acceptanceClaims.nextReviewAt,
          updatedAt: acceptanceClaims.updatedAt,
          deletedAt: acceptanceClaims.deletedAt,
          negativeEvidenceAt: signalAt,
          entityName: entities.name,
          entityType: entities.entityType,
          entityWebsiteUrl: entities.websiteUrl,
          entityCountryCode: entities.countryCode,
          locationName: locations.name,
          locationSlug: locations.slug,
          locationAddressLine: locations.addressLine,
          locationLocality: locations.locality,
          locationRegion: locations.region,
          locationCountryCode: locations.countryCode,
        })
        .from(acceptanceClaims)
        .innerJoin(entities, eq(acceptanceClaims.entityId, entities.id))
        .leftJoin(locations, eq(acceptanceClaims.locationId, locations.id))
        .where(
          and(
            eq(acceptanceClaims.id, claimId),
            isNull(acceptanceClaims.deletedAt),
            isNull(entities.deletedAt),
            or(isNull(acceptanceClaims.locationId), isNull(locations.deletedAt)),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;

      const snapshot: ReconfirmationClaimSnapshot = {
        id: row.id,
        claimStatus: row.claimStatus,
        visibility: row.visibility,
        lastConfirmedAt: iso(row.lastConfirmedAt),
        nextReviewAt: iso(row.nextReviewAt),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: iso(row.deletedAt),
      };
      const queueItem = evaluateReconfirmationClaim(
        snapshot,
        asOf,
        { dueSoonDays },
        iso(row.negativeEvidenceAt),
      );

      return {
        generatedAt: asOf.toISOString(),
        queueItem:
          queueItem === null
            ? null
            : decorate(queueItem, {
                entityName: row.entityName,
                entityType: row.entityType,
                locationName: row.locationName,
                locationLocality: row.locationLocality,
                locationCountryCode: row.locationCountryCode,
              }),
        claim: {
          id: row.id,
          entityId: row.entityId,
          locationId: row.locationId,
          entityName: row.entityName,
          entityType: row.entityType,
          entityWebsiteUrl: row.entityWebsiteUrl,
          entityCountryCode: row.entityCountryCode,
          locationName: row.locationName,
          locationSlug: row.locationSlug,
          locationAddressLine: row.locationAddressLine,
          locationLocality: row.locationLocality,
          locationRegion: row.locationRegion,
          locationCountryCode: row.locationCountryCode,
          claimScope: row.claimScope,
          routeType: row.routeType,
          acceptanceScope: row.acceptanceScope,
          claimStatus: row.claimStatus,
          visibility: row.visibility,
          customerPaysCrypto: row.customerPaysCrypto,
          merchantExplicitlyAcceptsCrypto: row.merchantExplicitlyAcceptsCrypto,
          howToPay: row.howToPay,
          merchantReceives: row.merchantReceives,
          restrictions: row.restrictions,
          firstConfirmedAt: iso(row.firstConfirmedAt),
          lastConfirmedAt: iso(row.lastConfirmedAt),
          nextReviewAt: iso(row.nextReviewAt),
          updatedAt: row.updatedAt.toISOString(),
        },
      };
    },
  };
}
