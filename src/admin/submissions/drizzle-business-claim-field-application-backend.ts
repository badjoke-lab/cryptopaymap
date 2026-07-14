import { eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  entities,
  locations,
  submissionEvents,
  submissionPayloads,
  submissions,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type {
  BusinessClaimFieldApplicationPersistenceBackend,
  BusinessClaimFieldApplicationPersistenceEventRecord,
} from './business-claim-field-application-persistence';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function mapEvent(
  row:
    | {
        eventId: string;
        submissionId: string;
        fromStatus: string | null;
        toStatus: string;
        action: string;
        reasonCode: string | null;
        actorId: string;
        internalNote: string | null;
        createdAt: Date;
      }
    | undefined,
): BusinessClaimFieldApplicationPersistenceEventRecord | null {
  if (row === undefined) return null;
  return {
    eventId: row.eventId,
    submissionId: row.submissionId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    action: row.action,
    reasonCode: row.reasonCode,
    actorId: row.actorId,
    internalNote: row.internalNote,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createDrizzleBusinessClaimFieldApplicationBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimFieldApplicationPersistenceBackend {
  return {
    async loadState(submissionId, relationshipDecisionId) {
      const submissionRows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          updatedAt: submissions.updatedAt,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          normalizedProjection: submissionPayloads.normalizedPayload,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const relationshipRows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          fromStatus: submissionEvents.fromStatus,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
          reasonCode: submissionEvents.reasonCode,
          actorId: submissionEvents.actorId,
          internalNote: submissionEvents.internalNote,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.id, relationshipDecisionId))
        .limit(1);

      let entityTarget = null;
      if (submission.targetType === 'entity' && submission.targetId !== null) {
        const rows = await database
          .select({
            id: entities.id,
            entityType: entities.entityType,
            name: entities.name,
            slug: entities.slug,
            legalName: entities.legalName,
            websiteUrl: entities.websiteUrl,
            countryCode: entities.countryCode,
            entityStatus: entities.entityStatus,
            visibility: entities.visibility,
            updatedAt: entities.updatedAt,
          })
          .from(entities)
          .where(eq(entities.id, submission.targetId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          entityTarget = {
            id: row.id,
            updatedAt: row.updatedAt.toISOString(),
            value: {
              entityType: row.entityType,
              name: row.name,
              slug: row.slug,
              legalName: row.legalName,
              websiteUrl: row.websiteUrl,
              countryCode: row.countryCode,
              entityStatus: row.entityStatus,
              visibility: row.visibility,
            },
          };
        }
      }

      let locationTarget = null;
      if (submission.targetType === 'location' && submission.targetId !== null) {
        const rows = await database
          .select({
            id: locations.id,
            name: locations.name,
            slug: locations.slug,
            addressLine: locations.addressLine,
            locality: locations.locality,
            region: locations.region,
            postalCode: locations.postalCode,
            countryCode: locations.countryCode,
            latitude: locations.latitude,
            longitude: locations.longitude,
            locationStatus: locations.locationStatus,
            visibility: locations.visibility,
            websiteUrl: locations.websiteUrl,
            phone: locations.phone,
            description: locations.description,
            openingHours: locations.openingHours,
            amenities: locations.amenities,
            socialLinks: locations.socialLinks,
            osmType: locations.osmType,
            osmId: locations.osmId,
            updatedAt: locations.updatedAt,
          })
          .from(locations)
          .where(eq(locations.id, submission.targetId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          locationTarget = {
            id: row.id,
            updatedAt: row.updatedAt.toISOString(),
            value: {
              name: row.name,
              slug: row.slug,
              addressLine: row.addressLine,
              locality: row.locality,
              region: row.region,
              postalCode: row.postalCode,
              countryCode: row.countryCode,
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              locationStatus: row.locationStatus,
              visibility: row.visibility,
              websiteUrl: row.websiteUrl,
              phone: row.phone,
              description: row.description,
              openingHours: row.openingHours,
              amenities: row.amenities ?? [],
              socialLinks: row.socialLinks ?? [],
              osmType: row.osmType,
              osmId: row.osmId,
            },
          };
        }
      }

      return {
        submissionId: submission.submissionId,
        submissionType: submission.submissionType,
        workflowStatus: submission.workflowStatus,
        resolution: submission.resolution,
        updatedAt: submission.updatedAt.toISOString(),
        targetType: submission.targetType,
        targetId: submission.targetId,
        normalizedProjection: submission.normalizedProjection,
        relationshipEvent: mapEvent(relationshipRows[0]),
        entityTarget,
        locationTarget,
      };
    },

    async readApplicationEvent(requestId) {
      const rows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          fromStatus: submissionEvents.fromStatus,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
          reasonCode: submissionEvents.reasonCode,
          actorId: submissionEvents.actorId,
          internalNote: submissionEvents.internalNote,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.id, requestId))
        .limit(1);
      return mapEvent(rows[0]);
    },

    async commitApplication(command) {
      const statements: unknown[] = [
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1
            from ${submissions}
            where ${submissions.id} = ${command.submissionId}
              and ${submissions.submissionType} = 'claim'
              and ${submissions.workflowStatus} = 'resolved'
              and ${submissions.resolution} = 'approved'
              and ${submissions.updatedAt} = ${command.expectedSubmissionUpdatedAt}
          ) then 1 else 0 end`,
        }),
      ];

      const entityApplication = command.projection.entityApplication;
      if (entityApplication !== null && entityApplication.acceptedFields.length > 0) {
        statements.push(
          database.select({
            guard: sql<number>`1 / case when exists (
              select 1
              from ${entities}
              where ${entities.id} = ${command.projection.targetId}
                and ${entities.updatedAt} = ${new Date(entityApplication.expectedUpdatedAt)}
            ) then 1 else 0 end`,
          }),
          database
            .update(entities)
            .set({
              name: entityApplication.after.name,
              legalName: entityApplication.after.legalName,
              websiteUrl: entityApplication.after.websiteUrl,
              countryCode: entityApplication.after.countryCode,
              updatedAt: command.appliedAt,
            })
            .where(eq(entities.id, command.projection.targetId)),
        );
      }

      const locationApplication = command.projection.locationApplication;
      if (locationApplication !== null && locationApplication.acceptedFields.length > 0) {
        statements.push(
          database.select({
            guard: sql<number>`1 / case when exists (
              select 1
              from ${locations}
              where ${locations.id} = ${command.projection.targetId}
                and ${locations.updatedAt} = ${new Date(locationApplication.expectedUpdatedAt)}
            ) then 1 else 0 end`,
          }),
          database
            .update(locations)
            .set({
              name: locationApplication.after.name,
              addressLine: locationApplication.after.addressLine,
              locality: locationApplication.after.locality,
              region: locationApplication.after.region,
              postalCode: locationApplication.after.postalCode,
              countryCode: locationApplication.after.countryCode,
              latitude: String(locationApplication.after.latitude),
              longitude: String(locationApplication.after.longitude),
              websiteUrl: locationApplication.after.websiteUrl,
              phone: locationApplication.after.phone,
              description: locationApplication.after.description ?? null,
              openingHours: locationApplication.after.openingHours ?? null,
              amenities: locationApplication.after.amenities ?? [],
              socialLinks: locationApplication.after.socialLinks ?? [],
              updatedAt: command.appliedAt,
            })
            .where(eq(locations.id, command.projection.targetId)),
        );
      }

      statements.push(
        database
          .update(submissions)
          .set({ updatedAt: command.appliedAt })
          .where(eq(submissions.id, command.submissionId)),
        database.insert(submissionEvents).values({
          id: command.requestId,
          submissionId: command.submissionId,
          fromStatus: null,
          toStatus: 'resolved',
          action: 'business_claim_fields_applied',
          reasonCode: command.projection.hasAcceptedChanges
            ? 'field_decisions_committed'
            : 'field_decisions_reviewed_no_changes',
          actorId: command.actorId,
          actorType: command.actorType === 'system' ? 'system' : 'reviewer',
          internalNote: command.internalNote,
          createdAt: command.appliedAt,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Business Claim field application conflicted with current state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
