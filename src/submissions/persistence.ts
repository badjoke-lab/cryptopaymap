import type {
  SubmissionRelationship,
  SubmissionResolution,
  SubmissionTargetType,
  SubmissionType,
  SubmissionWorkflowStatus,
} from './contract';
import type { SubmissionEventActorType } from '../db/schema/submissions';

export class SubmissionPersistenceError extends Error {
  constructor(
    readonly code: 'conflict' | 'not_found' | 'reference_exhausted',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionPersistenceError';
  }
}

export interface SubmissionContactPersistenceInput {
  encryptedEmail: string;
  emailHash: string;
  contactAllowed: boolean;
  retentionUntil: Date | null;
}

export interface CreateSubmissionPersistenceCommand {
  id: string;
  intakeRequestId: string;
  requestFingerprint: string;
  publicId: string;
  submissionType: SubmissionType;
  targetType: SubmissionTargetType | null;
  targetId: string | null;
  relationship: SubmissionRelationship | null;
  statusTokenHash: string;
  submittedAt: Date;
  originalPayload: Record<string, unknown>;
  contact: SubmissionContactPersistenceInput | null;
  actorId: string;
  actorType: SubmissionEventActorType;
}

export interface CreateSubmissionPersistenceReceipt {
  submissionId: string;
  publicId: string;
  workflowStatus: 'received';
  submittedAt: string;
}

export interface SubmissionPersistenceReplayRecord {
  submissionId: string;
  publicId: string;
  requestFingerprint: string;
  workflowStatus: SubmissionWorkflowStatus;
  submittedAt: string;
}

export interface TransitionSubmissionPersistenceCommand {
  submissionId: string;
  expectedStatus: SubmissionWorkflowStatus;
  expectedUpdatedAt: Date;
  toStatus: SubmissionWorkflowStatus;
  resolution: SubmissionResolution | null;
  action: string;
  reasonCode: string | null;
  actorId: string;
  actorType: SubmissionEventActorType;
  internalNote: string | null;
  changedAt: Date;
}

export interface TransitionSubmissionPersistenceReceipt {
  submissionId: string;
  fromStatus: SubmissionWorkflowStatus;
  toStatus: SubmissionWorkflowStatus;
  resolution: SubmissionResolution | null;
  changedAt: string;
}

export interface SubmissionPersistenceBackend {
  allocatePublicReference(year: number, at: Date): Promise<string>;
  readByIntakeRequestId(requestId: string): Promise<SubmissionPersistenceReplayRecord | null>;
  createSubmission(
    command: CreateSubmissionPersistenceCommand,
  ): Promise<CreateSubmissionPersistenceReceipt>;
  transitionSubmission(
    command: TransitionSubmissionPersistenceCommand,
  ): Promise<TransitionSubmissionPersistenceReceipt>;
}
