import { and, asc, eq, ilike, isNull } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  entities,
  locations,
  networks,
  paymentMethods,
  submissionEvents,
  submissions,
} from '../../db/schema';
import { createDrizzleSubmissionApplicationLifecycleBackend } from './drizzle-application-lifecycle-backend';
import type {
  BusinessClaimPaymentPreviewBackend,
  BusinessClaimPaymentPreviewClaimState,
  BusinessClaimPaymentPreviewState,
} from './business-claim-payment-preview';

export function createDrizzleBusinessClaimPaymentPreviewBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimPaymentPreviewBackend {
  const lifecycle = createDrizzleSubmissionApplicationLifecycleBackend(database);
  return {
    async readApplicationState(applicationId) {
      const application = await lifecycle.readApplication(applicationId);
      if (application === null) return null;

      const submissionRows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
        })
        .from(submissions)
        .where(eq(submissions.id, application.submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const sourceRows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
        })
        .from(submissionEvents)
        .where(
          and(
            eq(submissionEvents.id, application.sourceDecisionEventId),
            eq(submissionEvents.submissionId, application.submissionId),
          ),
        )
        .limit(1);

      const fieldRows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          action: submissionEvents.action,
          internalNote: submissionEvents.internalNote,
        })
        .from(submissionEvents)
        .where(
          and(
            eq(submissionEvents.submissionId, application.submissionId),
            eq(submissionEvents.action, 'business_claim_fields_applied'),
          ),
        )
        .orderBy(asc(submissionEvents.createdAt), asc(submissionEvents.id))
        .limit(2);
      if (fieldRows.length > 1) {
        throw new Error('Business Claim Submission contains multiple field-application events.');
      }

      let target: BusinessClaimPaymentPreviewState['target'] = null;
      if (submission.targetType === 'entity' && submission.targetId !== null) {
        const rows = await database
          .select({ id: entities.id, deletedAt: entities.deletedAt })
          .from(entities)
          .where(eq(entities.id, submission.targetId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined && row.deletedAt === null) {
          target = {
            targetType: 'entity',
            targetId: row.id,
            entityId: row.id,
            locationId: null,
          };
        }
      } else if (submission.targetType === 'location' && submission.targetId !== null) {
        const rows = await database
          .select({ id: locations.id, entityId: locations.entityId, deletedAt: locations.deletedAt })
          .from(locations)
          .where(eq(locations.id, submission.targetId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined && row.deletedAt === null) {
          target = {
            targetType: 'location',
            targetId: row.id,
            entityId: row.entityId,
            locationId: row.id,
          };
        }
      }

      const claimRows =
        target === null
          ? []
          : await database
              .select({
                claimId: acceptanceClaims.id,
                entityId: acceptanceClaims.entityId,
                locationId: acceptanceClaims.locationId,
                claimStatus: acceptanceClaims.claimStatus,
                routeType: acceptanceClaims.routeType,
                processorId: acceptanceClaims.processorId,
                updatedAt: acceptanceClaims.updatedAt,
                deletedAt: acceptanceClaims.deletedAt,
              })
              .from(acceptanceClaims)
              .where(
                target.targetType === 'location'
                  ? and(
                      eq(acceptanceClaims.entityId, target.entityId),
                      eq(acceptanceClaims.locationId, target.locationId as string),
                    )
                  : and(
                      eq(acceptanceClaims.entityId, target.entityId),
                      isNull(acceptanceClaims.locationId),
                    ),
              )
              .orderBy(asc(acceptanceClaims.id))
              .limit(101);

      const claims: BusinessClaimPaymentPreviewClaimState[] = [];
      for (const claim of claimRows) {
        const rows = await database
          .select({
            rowId: claimAssets.id,
            claimId: claimAssets.claimId,
            assetId: claimAssets.assetId,
            networkId: claimAssets.networkId,
            paymentMethodId: claimAssets.paymentMethodId,
            contractAddress: claimAssets.contractAddress,
          })
          .from(claimAssets)
          .where(eq(claimAssets.claimId, claim.claimId))
          .orderBy(asc(claimAssets.id))
          .limit(101);
        claims.push({
          claimId: claim.claimId,
          entityId: claim.entityId,
          locationId: claim.locationId,
          claimStatus: claim.claimStatus,
          routeType: claim.routeType,
          processorId: claim.processorId,
          updatedAt: claim.updatedAt.toISOString(),
          deletedAt: claim.deletedAt?.toISOString() ?? null,
          rows,
        });
      }

      const source = sourceRows[0];
      const field = fieldRows[0];
      return {
        application,
        submission: {
          submissionId: submission.submissionId,
          submissionType: submission.submissionType,
          targetType: submission.targetType,
          targetId: submission.targetId,
          workflowStatus: submission.workflowStatus,
          resolution: submission.resolution,
        },
        sourceDecisionEvent:
          source === undefined
            ? null
            : {
                eventId: source.eventId,
                submissionId: source.submissionId,
                toStatus: source.toStatus,
                action: source.action,
              },
        fieldApplicationEvent:
          field === undefined
            ? null
            : {
                eventId: field.eventId,
                submissionId: field.submissionId,
                action: field.action,
                internalNote: field.internalNote,
              },
        target,
        claims,
      } satisfies BusinessClaimPaymentPreviewState;
    },

    async readAssetBySlug(slug) {
      const rows = await database
        .select({ id: assets.id, slug: assets.slug, symbol: assets.symbol, status: assets.status })
        .from(assets)
        .where(eq(assets.slug, slug))
        .limit(1);
      return rows[0] ?? null;
    },

    async readNetworkBySlug(slug) {
      const rows = await database
        .select({ id: networks.id, slug: networks.slug, status: networks.status })
        .from(networks)
        .where(eq(networks.slug, slug))
        .limit(1);
      return rows[0] ?? null;
    },

    async readPaymentMethodBySlug(slug) {
      const rows = await database
        .select({ id: paymentMethods.id, slug: paymentMethods.slug, status: paymentMethods.status })
        .from(paymentMethods)
        .where(eq(paymentMethods.slug, slug))
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : {
            ...row,
            slug: row.slug as
              | 'onchain'
              | 'lightning_invoice'
              | 'lightning_nfc'
              | 'wallet_qr'
              | 'processor_checkout'
              | 'pos_terminal'
              | 'invoice'
              | 'payment_link',
          };
    },

    async readProcessorCandidates(name) {
      const rows = await database
        .select({
          id: entities.id,
          name: entities.name,
          websiteUrl: entities.websiteUrl,
          updatedAt: entities.updatedAt,
        })
        .from(entities)
        .where(
          and(
            eq(entities.entityType, 'payment_processor'),
            eq(entities.entityStatus, 'active'),
            isNull(entities.deletedAt),
            ilike(entities.name, name),
          ),
        )
        .orderBy(asc(entities.id))
        .limit(3);
      return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
    },
  };
}
