import { and, asc, eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  networks,
  paymentMethods,
  submissionEvents,
  submissionPayloads,
  submissions,
} from '../../db/schema';
import { createDrizzleSubmissionApplicationLifecycleBackend } from './drizzle-application-lifecycle-backend';
import type {
  ProblemClaimAssetSetPreviewBackend,
  ProblemClaimAssetSetPreviewState,
} from './problem-claim-asset-set-preview';

export function createDrizzleProblemClaimAssetSetPreviewBackend(
  database: CryptoPayMapDatabase,
): ProblemClaimAssetSetPreviewBackend {
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
          normalizedPayload: submissionPayloads.normalizedPayload,
          eventId: submissionEvents.id,
          eventSubmissionId: submissionEvents.submissionId,
          eventToStatus: submissionEvents.toStatus,
          eventAction: submissionEvents.action,
          eventInternalNote: submissionEvents.internalNote,
          claimId: acceptanceClaims.id,
          claimStatus: acceptanceClaims.claimStatus,
          claimRouteType: acceptanceClaims.routeType,
          claimUpdatedAt: acceptanceClaims.updatedAt,
          claimDeletedAt: acceptanceClaims.deletedAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .leftJoin(
          submissionEvents,
          and(
            eq(submissionEvents.id, application.sourceDecisionEventId),
            eq(submissionEvents.submissionId, submissions.id),
          ),
        )
        .leftJoin(acceptanceClaims, eq(acceptanceClaims.id, submissions.targetId))
        .where(eq(submissions.id, application.submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const rows =
        submission.claimId === null
          ? []
          : await database
              .select({
                rowId: claimAssets.id,
                claimId: claimAssets.claimId,
                contractAddress: claimAssets.contractAddress,
                isPrimary: claimAssets.isPrimary,
                notes: claimAssets.notes,
                assetId: assets.id,
                assetSlug: assets.slug,
                assetSymbol: assets.symbol,
                assetStatus: assets.status,
                networkId: networks.id,
                networkSlug: networks.slug,
                networkStatus: networks.status,
                paymentMethodId: paymentMethods.id,
                paymentMethodSlug: paymentMethods.slug,
                paymentMethodStatus: paymentMethods.status,
              })
              .from(claimAssets)
              .innerJoin(assets, eq(assets.id, claimAssets.assetId))
              .innerJoin(networks, eq(networks.id, claimAssets.networkId))
              .innerJoin(paymentMethods, eq(paymentMethods.id, claimAssets.paymentMethodId))
              .where(eq(claimAssets.claimId, submission.claimId))
              .orderBy(asc(claimAssets.id))
              .limit(51);

      return {
        application,
        submission: {
          submissionId: submission.submissionId,
          submissionType: submission.submissionType,
          targetType: submission.targetType,
          targetId: submission.targetId,
          workflowStatus: submission.workflowStatus,
          resolution: submission.resolution,
          normalizedPayload: submission.normalizedPayload,
        },
        sourceDecisionEvent:
          submission.eventId === null ||
          submission.eventSubmissionId === null ||
          submission.eventToStatus === null ||
          submission.eventAction === null
            ? null
            : {
                eventId: submission.eventId,
                submissionId: submission.eventSubmissionId,
                toStatus: submission.eventToStatus,
                action: submission.eventAction,
                internalNote: submission.eventInternalNote,
              },
        claim:
          submission.claimId === null ||
          submission.claimStatus === null ||
          submission.claimRouteType === null ||
          submission.claimUpdatedAt === null
            ? null
            : {
                claimId: submission.claimId,
                claimStatus: submission.claimStatus,
                routeType: submission.claimRouteType,
                updatedAt: submission.claimUpdatedAt.toISOString(),
                deletedAt: submission.claimDeletedAt?.toISOString() ?? null,
              },
        rows: rows.map((row) => ({
          rowId: row.rowId,
          claimId: row.claimId,
          asset: {
            id: row.assetId,
            slug: row.assetSlug,
            symbol: row.assetSymbol,
            status: row.assetStatus,
          },
          network: { id: row.networkId, slug: row.networkSlug, status: row.networkStatus },
          paymentMethod: {
            id: row.paymentMethodId,
            slug: row.paymentMethodSlug as
              | 'onchain'
              | 'lightning_invoice'
              | 'lightning_nfc'
              | 'wallet_qr'
              | 'processor_checkout'
              | 'pos_terminal'
              | 'invoice'
              | 'payment_link',
            status: row.paymentMethodStatus,
          },
          contractAddress: row.contractAddress,
          isPrimary: row.isPrimary,
          notes: row.notes,
        })),
      } satisfies ProblemClaimAssetSetPreviewState;
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
  };
}
