import {
  publicStatusLabelForSubmission,
  submissionPublicIdSchema,
  submissionPublicStatusProjectionSchema,
  type SubmissionPublicStatusProjection,
  type SubmissionWorkflowStatus,
} from './contract';
import type { SubmissionPersistenceBackend } from './persistence';
import { submissionStatusSecretSchema, verifySubmissionStatusSecret } from './status-secret';

const dummyStatusTokenHash = `sha256:${'0'.repeat(64)}`;

export class SubmissionPrivateStatusError extends Error {
  constructor(readonly code: 'status_not_available') {
    super('Submission status is not available for the supplied credentials.');
    this.name = 'SubmissionPrivateStatusError';
  }
}

export interface SubmissionPrivateStatusService {
  read(publicId: string, statusSecret: string): Promise<SubmissionPublicStatusProjection>;
}

function permittedActionsForStatus(
  status: SubmissionWorkflowStatus,
): SubmissionPublicStatusProjection['permittedActions'] {
  if (status === 'needs_information') {
    return ['provide_information', 'withdraw', 'rotate_status_secret'];
  }
  if (['received', 'triage', 'in_review', 'on_hold'].includes(status)) {
    return ['withdraw', 'rotate_status_secret'];
  }
  return [];
}

function notAvailable(): never {
  throw new SubmissionPrivateStatusError('status_not_available');
}

export function createSubmissionPrivateStatusService(
  persistence: SubmissionPersistenceBackend,
): SubmissionPrivateStatusService {
  return {
    async read(publicId, statusSecret) {
      const parsedPublicId = submissionPublicIdSchema.safeParse(publicId);
      const parsedSecret = submissionStatusSecretSchema.safeParse(statusSecret);
      if (!parsedPublicId.success || !parsedSecret.success) notAvailable();

      const record = await persistence.readPrivateStatusByPublicId(parsedPublicId.data);
      if (record === null) {
        await verifySubmissionStatusSecret(parsedSecret.data, dummyStatusTokenHash);
        notAvailable();
      }

      const verified = await verifySubmissionStatusSecret(
        parsedSecret.data,
        record.statusTokenHash,
      );
      if (!verified) notAvailable();

      return submissionPublicStatusProjectionSchema.parse({
        publicId: record.publicId,
        statusLabel: publicStatusLabelForSubmission(record.workflowStatus, record.resolution),
        requestedAction:
          record.workflowStatus === 'needs_information' ? record.requestedAction : null,
        publicMessage: record.workflowStatus === 'needs_information' ? record.publicMessage : null,
        linkedPublicRecord: null,
        mediaDecisions: [],
        permittedActions: permittedActionsForStatus(record.workflowStatus),
      });
    },
  };
}
