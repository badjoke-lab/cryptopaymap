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
  contact: CreateSubmissionPersistenceCommand['contact'];
}

export function createInMemorySubmissionPersistenceBackend(): SubmissionPersistenceBackend & {
  snapshot(): StoredSubmission[];
} {
  const counters = new Map<number, number>();
  const submissionsById = new Map<string, StoredSubmission>();
  const submissionIdByRequest = new Map<string, string>();
  const publicIds = new Set<string>();
  const statusTokenHashes = new Set<string>();

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
        contact: command.contact === null ? null : { ...command.contact },
      };
      submissionsById.set(command.id, stored);
      submissionIdByRequest.set(command.intakeRequestId, command.id);
      publicIds.add(command.publicId);
      statusTokenHashes.add(command.statusTokenHash);

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
        contact: stored.contact === null ? null : { ...stored.contact },
      }));
    },
  };
}
