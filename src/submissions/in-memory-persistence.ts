import { formatSubmissionPublicId } from './contract';
import {
  SubmissionPersistenceError,
  type CreateSubmissionPersistenceCommand,
  type SubmissionPersistenceBackend,
  type SubmissionPersistenceReplayRecord,
  type TransitionSubmissionPersistenceCommand,
} from './persistence';
import { assertSubmissionWorkflowTransition } from './workflow';

interface StoredSubmission extends SubmissionPersistenceReplayRecord {
  updatedAt: Date;
  resolution: TransitionSubmissionPersistenceCommand['resolution'];
  originalPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown> | null;
  contact: CreateSubmissionPersistenceCommand['contact'];
}

interface StoredQuarantineReservation {
  id: string;
  intakeRequestId: string;
  purpose: 'evidence_image' | 'owner_verification_proof' | 'public_gallery_candidate';
  expiresAt: Date;
  consumedBySubmissionId: string | null;
  consumedAt: Date | null;
}

export function createInMemorySubmissionPersistenceBackend(): SubmissionPersistenceBackend & {
  snapshot(): StoredSubmission[];
  seedQuarantineReservation(
    reservation: Omit<StoredQuarantineReservation, 'consumedBySubmissionId' | 'consumedAt'> &
      Partial<Pick<StoredQuarantineReservation, 'consumedBySubmissionId' | 'consumedAt'>>,
  ): void;
  reservationSnapshot(): StoredQuarantineReservation[];
} {
  const counters = new Map<number, number>();
  const submissionsById = new Map<string, StoredSubmission>();
  const submissionIdByRequest = new Map<string, string>();
  const submissionIdByPublicId = new Map<string, string>();
  const publicIds = new Set<string>();
  const statusTokenHashes = new Set<string>();
  const quarantineReservations = new Map<string, StoredQuarantineReservation>();

  return {
    async allocatePublicReference(year) {
      const next = counters.get(year) ?? 1;
      if (next > 999_999) {
        throw new SubmissionPersistenceError(
          'reference_exhausted',
          `Submission public references for ${year} are exhausted.`,
        );
      }
      counters.set(year, next + 1);
      return formatSubmissionPublicId(year, next);
    },

    async readByIntakeRequestId(requestId) {
      const submissionId = submissionIdByRequest.get(requestId);
      if (submissionId === undefined) return null;
      const stored = submissionsById.get(submissionId);
      if (stored === undefined) return null;
      return {
        submissionId: stored.submissionId,
        publicId: stored.publicId,
        requestFingerprint: stored.requestFingerprint,
        workflowStatus: stored.workflowStatus,
        statusTokenHash: stored.statusTokenHash,
        submittedAt: stored.submittedAt,
      };
    },

    async readPrivateStatusByPublicId(publicId) {
      const submissionId = submissionIdByPublicId.get(publicId);
      if (submissionId === undefined) return null;
      const stored = submissionsById.get(submissionId);
      if (stored === undefined) return null;
      return {
        publicId: stored.publicId,
        workflowStatus: stored.workflowStatus,
        resolution: stored.resolution,
        statusTokenHash: stored.statusTokenHash,
        requestedAction: null,
        publicMessage: null,
        nextReviewAt: null,
      };
    },

    async createSubmission(command) {
      if (
        submissionsById.has(command.id) ||
        submissionIdByRequest.has(command.intakeRequestId) ||
        publicIds.has(command.publicId) ||
        statusTokenHashes.has(command.statusTokenHash)
      ) {
        throw new SubmissionPersistenceError(
          'conflict',
          'Submission persistence conflicted with current private state.',
        );
      }

      const reservationIds = command.quarantineUploadIds ?? [];
      const reservations = reservationIds.map((id) => quarantineReservations.get(id));
      if (
        reservations.some(
          (reservation) =>
            reservation === undefined ||
            reservation.intakeRequestId !== command.intakeRequestId ||
            reservation.purpose !== 'public_gallery_candidate' ||
            reservation.expiresAt.getTime() <= command.submittedAt.getTime() ||
            reservation.consumedBySubmissionId !== null ||
            reservation.consumedAt !== null,
        )
      ) {
        throw new SubmissionPersistenceError(
          'conflict',
          'Submission persistence conflicted with current private state.',
        );
      }

      const stored: StoredSubmission = {
        submissionId: command.id,
        publicId: command.publicId,
        requestFingerprint: command.requestFingerprint,
        workflowStatus: 'received',
        statusTokenHash: command.statusTokenHash,
        submittedAt: command.submittedAt.toISOString(),
        updatedAt: command.submittedAt,
        resolution: null,
        originalPayload: structuredClone(command.originalPayload),
        normalizedPayload:
          command.normalizedPayload === undefined || command.normalizedPayload === null
            ? null
            : structuredClone(command.normalizedPayload),
        contact: command.contact === null ? null : { ...command.contact },
      };
      submissionsById.set(command.id, stored);
      submissionIdByRequest.set(command.intakeRequestId, command.id);
      submissionIdByPublicId.set(command.publicId, command.id);
      publicIds.add(command.publicId);
      statusTokenHashes.add(command.statusTokenHash);
      for (const reservation of reservations) {
        if (reservation === undefined) continue;
        reservation.consumedBySubmissionId = command.id;
        reservation.consumedAt = command.submittedAt;
      }

      return {
        submissionId: command.id,
        publicId: command.publicId,
        workflowStatus: 'received',
        submittedAt: command.submittedAt.toISOString(),
      };
    },

    async transitionSubmission(command) {
      const stored = submissionsById.get(command.submissionId);
      if (stored === undefined) {
        throw new SubmissionPersistenceError('not_found', 'Submission was not found.');
      }
      if (
        stored.workflowStatus !== command.expectedStatus ||
        stored.updatedAt.getTime() !== command.expectedUpdatedAt.getTime()
      ) {
        throw new SubmissionPersistenceError(
          'conflict',
          'Submission workflow transition conflicted with current private state.',
        );
      }

      assertSubmissionWorkflowTransition({
        fromStatus: command.expectedStatus,
        toStatus: command.toStatus,
        resolution: command.resolution,
      });
      stored.workflowStatus = command.toStatus;
      stored.resolution = command.resolution;
      stored.updatedAt = command.changedAt;

      return {
        submissionId: command.submissionId,
        fromStatus: command.expectedStatus,
        toStatus: command.toStatus,
        resolution: command.resolution,
        changedAt: command.changedAt.toISOString(),
      };
    },

    snapshot() {
      return [...submissionsById.values()].map((stored) => ({
        ...stored,
        originalPayload: structuredClone(stored.originalPayload),
        normalizedPayload:
          stored.normalizedPayload === null ? null : structuredClone(stored.normalizedPayload),
        contact: stored.contact === null ? null : { ...stored.contact },
      }));
    },

    seedQuarantineReservation(reservation) {
      quarantineReservations.set(reservation.id, {
        ...reservation,
        expiresAt: new Date(reservation.expiresAt),
        consumedBySubmissionId: reservation.consumedBySubmissionId ?? null,
        consumedAt: reservation.consumedAt ? new Date(reservation.consumedAt) : null,
      });
    },

    reservationSnapshot() {
      return [...quarantineReservations.values()].map((reservation) => ({
        ...reservation,
        expiresAt: new Date(reservation.expiresAt),
        consumedAt: reservation.consumedAt ? new Date(reservation.consumedAt) : null,
      }));
    },
  };
}
