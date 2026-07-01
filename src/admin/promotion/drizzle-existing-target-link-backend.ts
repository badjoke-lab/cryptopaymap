import { and, eq, inArray } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  candidatePromotionDecisions,
  claimAssets,
  legacyPlaceIds,
  provenanceLinks,
  sourceCandidates,
} from '../../db/schema';
import { CandidatePromotionError, type CandidatePromotionReceipt } from './candidate-promotion';
import {
  existingTargetGuards,
  postgresErrorCode,
  preflightExistingTargetLink,
  readExistingLink,
  replayExistingLink,
} from './existing-target-link-guards';
import type {
  CandidateExistingTargetLinkBackend,
  CandidateExistingTargetLinkCommand,
} from './existing-target-link';
import { expandPromotionProvenanceAssignments } from './provenance-plan';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function claimInsert(command: CandidateExistingTargetLinkCommand) {
  const value = command.claim.value;
  return {
    id: command.claim.id,
    entityId: value.entityId,
    locationId: value.locationId,
    claimScope: value.claimScope,
    routeType: value.routeType,
    acceptanceScope: value.acceptanceScope,
    claimStatus: value.claimStatus,
    visibility: value.visibility,
    customerPaysCrypto: value.customerPaysCrypto,
    merchantExplicitlyAcceptsCrypto: value.merchantExplicitlyAcceptsCrypto,
    processorId: value.processorId,
    howToPay: value.howToPay,
    instructionsLanguage: value.instructionsLanguage,
    merchantReceives: value.merchantReceives,
    restrictions: value.restrictions,
    firstConfirmedAt: null,
    lastConfirmedAt: null,
    nextReviewAt: null,
    endedAt: null,
    endedReason: null,
    createdAt: command.linkedAt,
    updatedAt: command.linkedAt,
  };
}

function provenanceRows(command: CandidateExistingTargetLinkCommand) {
  if (command.provenanceAssignments.length > 0) {
    return expandPromotionProvenanceAssignments(command.provenanceAssignments, command.linkedAt);
  }
  const identitySubjects: Array<{ subjectType: 'entity' | 'location'; subjectId: string }> = [
    { subjectType: 'entity', subjectId: command.target.entityId },
  ];
  if (command.target.locationId !== null) {
    identitySubjects.push({ subjectType: 'location', subjectId: command.target.locationId });
  }
  const originSubjects: Array<{
    subjectType: 'acceptance_claim' | 'claim_asset';
    subjectId: string;
  }> = [
    { subjectType: 'acceptance_claim', subjectId: command.claim.id },
    ...command.claimAssets.map((row) => ({
      subjectType: 'claim_asset' as const,
      subjectId: row.id,
    })),
  ];
  return [
    ...identitySubjects.flatMap((subject) =>
      command.sourceRecordIds.map((sourceRecordId) => ({
        ...subject,
        sourceRecordId,
        provenanceRole: 'attribution' as const,
        effectiveFrom: command.linkedAt,
      })),
    ),
    ...originSubjects.flatMap((subject) =>
      command.sourceRecordIds.map((sourceRecordId) => ({
        ...subject,
        sourceRecordId,
        provenanceRole: 'origin' as const,
        effectiveFrom: command.linkedAt,
      })),
    ),
  ];
}

function committedReceipt(command: CandidateExistingTargetLinkCommand): CandidatePromotionReceipt {
  return {
    requestId: command.requestId,
    candidateId: command.candidateId,
    entityId: command.target.entityId,
    locationId: command.target.locationId,
    claimId: command.claim.id,
    claimAssetIds: command.claimAssets.map((row) => row.id),
    canonicalPath: command.target.expectedCanonicalPath,
    claimStatus: 'candidate',
    visibility: 'hidden',
    promotedAt: command.linkedAt.toISOString(),
    state: 'committed',
  };
}

export function createDrizzleExistingTargetLinkBackend(
  database: CryptoPayMapDatabase,
): CandidateExistingTargetLinkBackend {
  return {
    async commitExistingTargetLink(command) {
      const existing = await readExistingLink(database, command.requestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new CandidatePromotionError(
            'conflict',
            'The existing-target request ID was reused with different content.',
          );
        }
        return replayExistingLink(existing);
      }

      await preflightExistingTargetLink(database, command);
      const statements: unknown[] = existingTargetGuards(database, command);
      statements.push(
        database.insert(acceptanceClaims).values(claimInsert(command)),
        database.insert(claimAssets).values(
          command.claimAssets.map((row) => ({
            id: row.id,
            claimId: row.value.claimId,
            assetId: row.value.assetId,
            networkId: row.value.networkId,
            paymentMethodId: row.value.paymentMethodId,
            contractAddress: row.value.contractAddress,
            isPrimary: row.value.isPrimary,
            notes: row.value.notes,
            createdAt: command.linkedAt,
            updatedAt: command.linkedAt,
          })),
        ),
        database.insert(provenanceLinks).values(provenanceRows(command)).onConflictDoNothing(),
        database
          .update(legacyPlaceIds)
          .set({
            migrationStatus: 'mapped',
            canonicalPath: command.target.expectedCanonicalPath,
            entityId:
              command.expectedCandidateType === 'online_service' ? command.target.entityId : null,
            locationId:
              command.expectedCandidateType === 'physical_place' ? command.target.locationId : null,
            resolvedAt: command.linkedAt,
            updatedAt: command.linkedAt,
          })
          .where(
            and(
              eq(legacyPlaceIds.migrationStatus, 'pending'),
              inArray(legacyPlaceIds.sourceRecordId, command.sourceRecordIds),
            ),
          ),
        database
          .update(sourceCandidates)
          .set({
            candidateStatus: 'promoted',
            canonicalEntityId: command.target.entityId,
            canonicalLocationId: command.target.locationId,
            updatedAt: command.linkedAt,
          })
          .where(eq(sourceCandidates.id, command.candidateId)),
        database.insert(candidatePromotionDecisions).values({
          id: crypto.randomUUID(),
          requestId: command.requestId,
          candidateId: command.candidateId,
          entityId: command.target.entityId,
          locationId: command.target.locationId,
          claimId: command.claim.id,
          claimAssetIds: command.claimAssets.map((row) => row.id),
          sourceRecordIds: command.sourceRecordIds,
          canonicalPath: command.target.expectedCanonicalPath,
          actorId: command.actorId,
          actorType: command.actorType,
          expectedCandidateUpdatedAt: command.expectedCandidateUpdatedAt,
          promotedAt: command.linkedAt,
          requestFingerprint: command.requestFingerprint,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const replay = await readExistingLink(database, command.requestId);
          if (replay?.requestFingerprint === command.requestFingerprint) {
            return replayExistingLink(replay);
          }
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new CandidatePromotionError(
            'conflict',
            'The existing-target link conflicted with current private state and was rolled back.',
            [`PostgreSQL rejected the atomic batch with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }
      return committedReceipt(command);
    },
  };
}
