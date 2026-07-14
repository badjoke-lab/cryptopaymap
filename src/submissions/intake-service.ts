import { z } from 'zod';
import type { SubmissionContactProtector } from './contact-protection';
import { protectedSubmissionContactSchema } from './contact-protection';
import {
  commonSubmissionIntakeSchema,
  submissionOriginalPayloadSchema,
  type CommonSubmissionIntake,
} from './contract';
import { fingerprintSubmissionIntake } from './fingerprint';
import {
  SubmissionPersistenceError,
  type SubmissionPersistenceBackend,
  type SubmissionPersistenceReplayRecord,
} from './persistence';
import type { SubmissionStatusSecretProvider } from './status-secret-provider';

const requestIdSchema = z.uuid();
const submissionIdSchema = z.uuid();

export class SubmissionIntakeError extends Error {
  constructor(
    readonly code:
      | 'invalid_request'
      | 'idempotency_conflict'
      | 'replay_integrity_failure'
      | 'contact_protection_failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionIntakeError';
  }
}

export interface SubmissionPrivateIntakeReceipt {
  state: 'committed' | 'replayed';
  publicId: string;
  statusSecret: string;
  submittedAt: string;
}

export interface SubmissionPrivateIntakeService {
  submit(
    requestId: string,
    rawInput: unknown,
    receivedAt?: Date,
  ): Promise<SubmissionPrivateIntakeReceipt>;
}

export interface ParsedSubmissionPrivateIntake {
  intake: CommonSubmissionIntake;
  normalizedPayload: Record<string, unknown> | null;
  quarantineUploadIds?: string[];
}

export interface SubmissionIntakeParser {
  parse(rawInput: unknown): ParsedSubmissionPrivateIntake;
}

export interface SubmissionPrivateIntakeDependencies {
  persistence: SubmissionPersistenceBackend;
  statusSecrets: SubmissionStatusSecretProvider;
  contactProtector: SubmissionContactProtector;
  intakeParser?: SubmissionIntakeParser;
  generateSubmissionId?: () => string;
  intakeActorId?: string;
}

const commonSubmissionIntakeParser: SubmissionIntakeParser = {
  parse(rawInput) {
    return {
      intake: commonSubmissionIntakeSchema.parse(rawInput),
      normalizedPayload: null,
    };
  },
};

function persistencePayload(intake: CommonSubmissionIntake): Record<string, unknown> {
  return {
    originalPayload: structuredClone(intake.originalPayload),
    evidenceLinks: structuredClone(intake.evidenceLinks),
    acknowledgements: structuredClone(intake.acknowledgements),
  };
}

function validateReceivedAt(receivedAt: Date): void {
  if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) {
    throw new SubmissionIntakeError('invalid_request', 'Submission receivedAt is invalid.');
  }
}

export function createSubmissionPrivateIntakeService(
  dependencies: SubmissionPrivateIntakeDependencies,
): SubmissionPrivateIntakeService {
  const generateSubmissionId = dependencies.generateSubmissionId ?? (() => crypto.randomUUID());
  const actorId = dependencies.intakeActorId ?? 'submitter:public-intake';
  const intakeParser = dependencies.intakeParser ?? commonSubmissionIntakeParser;
  if (actorId.trim().length === 0) {
    throw new Error('Submission intake actor ID must not be empty.');
  }

  async function replayReceipt(
    existing: SubmissionPersistenceReplayRecord,
    fingerprint: string,
    requestId: string,
  ): Promise<SubmissionPrivateIntakeReceipt> {
    if (existing.requestFingerprint !== fingerprint) {
      throw new SubmissionIntakeError(
        'idempotency_conflict',
        'The submission request ID was reused with different content.',
      );
    }

    const issued = await dependencies.statusSecrets.issueForRequest(requestId);
    if (issued.tokenHash !== existing.statusTokenHash) {
      throw new SubmissionIntakeError(
        'replay_integrity_failure',
        'The stored status secret hash does not match the deterministic replay secret.',
      );
    }

    return {
      state: 'replayed',
      publicId: existing.publicId,
      statusSecret: issued.secret,
      submittedAt: existing.submittedAt,
    };
  }

  return {
    async submit(requestId, rawInput, receivedAt = new Date()) {
      validateReceivedAt(receivedAt);

      let parsedRequestId: string;
      let intake: CommonSubmissionIntake;
      let normalizedPayload: Record<string, unknown> | null;
      let quarantineUploadIds: string[] | undefined;
      try {
        parsedRequestId = requestIdSchema.parse(requestId);
        const parsed = intakeParser.parse(rawInput);
        intake = commonSubmissionIntakeSchema.parse(parsed.intake);
        normalizedPayload =
          parsed.normalizedPayload === null
            ? null
            : submissionOriginalPayloadSchema.parse(parsed.normalizedPayload);
        quarantineUploadIds = parsed.quarantineUploadIds;
      } catch (error) {
        throw new SubmissionIntakeError(
          'invalid_request',
          'Submission intake request failed validation.',
          { cause: error },
        );
      }

      const fingerprint = await fingerprintSubmissionIntake(intake);
      const existing = await dependencies.persistence.readByIntakeRequestId(parsedRequestId);
      if (existing !== null) {
        return replayReceipt(existing, fingerprint, parsedRequestId);
      }

      const issued = await dependencies.statusSecrets.issueForRequest(parsedRequestId);

      let contact = null;
      if (intake.contact !== null) {
        try {
          const protectedContact = protectedSubmissionContactSchema.parse(
            await dependencies.contactProtector.protectEmail(intake.contact.email, receivedAt),
          );
          contact = {
            ...protectedContact,
            contactAllowed: intake.contact.contactAllowed,
          };
        } catch (error) {
          throw new SubmissionIntakeError(
            'contact_protection_failed',
            'Submission contact could not be protected for private persistence.',
            { cause: error },
          );
        }
      }

      const publicId = await dependencies.persistence.allocatePublicReference(
        receivedAt.getUTCFullYear(),
        receivedAt,
      );
      const submissionId = submissionIdSchema.parse(generateSubmissionId());

      try {
        const receipt = await dependencies.persistence.createSubmission({
          id: submissionId,
          intakeRequestId: parsedRequestId,
          requestFingerprint: fingerprint,
          publicId,
          submissionType: intake.submissionType,
          targetType: intake.targetType,
          targetId: intake.targetId,
          relationship: intake.relationship,
          statusTokenHash: issued.tokenHash,
          submittedAt: receivedAt,
          originalPayload: persistencePayload(intake),
          normalizedPayload,
          contact,
          actorId,
          actorType: 'submitter',
          ...(quarantineUploadIds === undefined ? {} : { quarantineUploadIds }),
        });

        return {
          state: 'committed',
          publicId: receipt.publicId,
          statusSecret: issued.secret,
          submittedAt: receipt.submittedAt,
        };
      } catch (error) {
        if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
          const raced = await dependencies.persistence.readByIntakeRequestId(parsedRequestId);
          if (raced !== null) {
            return replayReceipt(raced, fingerprint, parsedRequestId);
          }
        }
        throw error;
      }
    },
  };
}
