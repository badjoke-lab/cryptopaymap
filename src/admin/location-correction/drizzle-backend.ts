import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  locationProfileCorrectionDecisions,
  locations,
  provenanceLinks,
} from '../../db/schema';
import {
  LocationCorrectionDecisionError,
  type LocationCorrectionDecisionBackend,
  type LocationCorrectionDecisionCommand,
  type PracticalLocationCorrectionField,
} from './decision';
import {
  locationCorrectionSourceSetGuard,
  locationCorrectionTargetGuard,
} from './drizzle-guards';
import {
  projectLocationCorrection,
  readLocationCorrectionDecision,
  replayLocationCorrectionDecision,
} from './drizzle-state';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function valueAt(after: Record<string, unknown>, field: PracticalLocationCorrectionField): unknown {
  return after[field];
}

function hasCurrentValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function createDrizzleLocationCorrectionBackend(
  database: CryptoPayMapDatabase,
): LocationCorrectionDecisionBackend {
  return {
    async commitCorrection(command: LocationCorrectionDecisionCommand) {
      const existing = await readLocationCorrectionDecision(database, command.requestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new LocationCorrectionDecisionError(
            'conflict',
            'The correction request ID was reused with different content.',
          );
        }
        return replayLocationCorrectionDecision(existing);
      }

      const projected = await projectLocationCorrection(database, command);
      const afterRecord = projected.after as unknown as Record<string, unknown>;
      const currentCorrectionRows = command.provenanceAssignments.flatMap((assignment) => {
        if (!hasCurrentValue(valueAt(afterRecord, assignment.fieldPath))) return [];
        return assignment.sourceRecordIds.map((sourceRecordId) => ({
          subjectType: 'location' as const,
          subjectId: command.locationId,
          fieldPath: assignment.fieldPath,
          sourceRecordId,
          provenanceRole: 'correction' as const,
          effectiveFrom: command.decidedAt,
          effectiveTo: null,
        }));
      });

      const statements: unknown[] = [
        locationCorrectionTargetGuard(database, command),
        locationCorrectionSourceSetGuard(database, command),
        database
          .update(provenanceLinks)
          .set({ effectiveTo: command.decidedAt })
          .where(
            and(
              eq(provenanceLinks.subjectType, 'location'),
              eq(provenanceLinks.subjectId, command.locationId),
              inArray(provenanceLinks.fieldPath, projected.appliedFieldPaths),
              isNull(provenanceLinks.effectiveTo),
              ne(provenanceLinks.provenanceRole, 'correction'),
            ),
          ),
        database
          .delete(provenanceLinks)
          .where(
            and(
              eq(provenanceLinks.subjectType, 'location'),
              eq(provenanceLinks.subjectId, command.locationId),
              inArray(provenanceLinks.fieldPath, projected.appliedFieldPaths),
              eq(provenanceLinks.provenanceRole, 'correction'),
            ),
          ),
      ];

      if (currentCorrectionRows.length > 0) {
        statements.push(database.insert(provenanceLinks).values(currentCorrectionRows));
      }

      statements.push(
        database
          .update(locations)
          .set({
            addressLine: projected.after.addressLine,
            locality: projected.after.locality,
            region: projected.after.region,
            postalCode: projected.after.postalCode,
            websiteUrl: projected.after.websiteUrl,
            phone: projected.after.phone,
            description: projected.after.description ?? null,
            openingHours: projected.after.openingHours ?? null,
            amenities: projected.after.amenities ?? null,
            socialLinks: projected.after.socialLinks ?? null,
            updatedAt: command.decidedAt,
          })
          .where(eq(locations.id, command.locationId)),
        database.insert(locationProfileCorrectionDecisions).values({
          id: crypto.randomUUID(),
          requestId: command.requestId,
          locationId: command.locationId,
          actorId: command.actorId,
          actorType: command.actorType,
          expectedLocationUpdatedAt: command.expectedLocationUpdatedAt,
          changedFieldPaths: projected.appliedFieldPaths,
          changes: command.changes as unknown as Record<string, unknown>,
          beforeValues: projected.beforeValues,
          afterValues: projected.afterValues,
          sourceRecordIds: command.sourceRecordIds,
          provenanceAssignments: command.provenanceAssignments,
          reasonCode: command.reasonCode,
          publicSummary: command.publicSummary,
          internalNote: command.internalNote,
          decidedAt: command.decidedAt,
          requestFingerprint: command.requestFingerprint,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const replay = await readLocationCorrectionDecision(database, command.requestId);
          if (replay?.requestFingerprint === command.requestFingerprint) {
            return replayLocationCorrectionDecision(replay);
          }
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new LocationCorrectionDecisionError(
            'conflict',
            'The Location correction conflicted with current private state and was rolled back.',
            [`PostgreSQL rejected the atomic batch with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }

      return projected.receipt;
    },
  };
}
