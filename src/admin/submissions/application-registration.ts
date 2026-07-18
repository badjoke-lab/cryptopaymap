import { z } from 'zod';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionType } from '../../submissions/contract';

const timestampSchema = z.iso.datetime({ offset: true });

export const submissionApplicationSourceDecisionKindValues = [
  'suggest_candidate_acceptance',
  'positive_payment_evidence',
  'negative_report_evidence',
  'problem_correction_handoff',
  'problem_claim_mutation',
  'business_claim_relationship',
  'photos_parent_resolution',
] as const;
export const submissionApplicationSourceDecisionKindSchema = z.enum(
  submissionApplicationSourceDecisionKindValues,
);

export const submissionApplicationKindValues = [
  'candidate_resolution',
  'report_evidence',
  'problem_correction',
  'problem_claim_mutation',
  'business_claim_update',
  'photo_media_set',
] as const;
export const submissionApplicationKindSchema = z.enum(submissionApplicationKindValues);
export const submissionApplicationStatusSchema = z.enum(['pending', 'committed', 'failed']);
export const submissionPublicationStatusSchema = z.enum([
  'blocked',
  'pending',
  'committed',
  'failed',
]);
export const submissionApplicationReceiptKindSchema = z.enum([
  'submission_event',
  'candidate_promotion_decision',
  'location_profile_correction_decision',
  'media_review_decision',
  'export_release_decision',
]);

export const submissionApplicationRegistrationRequestSchema = z
  .object({
    schemaVersion: z.literal('submission-application-registration-v1'),
    requestId: z.uuid(),
    sourceDecisionKind: submissionApplicationSourceDecisionKindSchema,
    sourceDecisionEventId: z.uuid(),
    expectedSubmissionUpdatedAt: timestampSchema,
  })
  .strict();

export const submissionApplicationReceiptReferenceSchema = z
  .object({
    kind: submissionApplicationReceiptKindSchema,
    ids: z.array(z.uuid()).min(1).max(20),
  })
  .strict()
  .superRefine((reference, context) => {
    if (new Set(reference.ids).size !== reference.ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['ids'],
        message: 'Application receipt identifiers must be unique.',
      });
    }
  });

export const submissionApplicationRegistrationReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    applicationId: z.uuid(),
    submissionId: z.uuid(),
    submissionType: z.enum(['suggest', 'payment_report', 'problem_report', 'claim', 'photos']),
    sourceDecisionKind: submissionApplicationSourceDecisionKindSchema,
    sourceDecisionEventId: z.uuid(),
    applicationKind: submissionApplicationKindSchema,
    applicationStatus: submissionApplicationStatusSchema,
    publicationStatus: submissionPublicationStatusSchema,
    applicationReceipt: submissionApplicationReceiptReferenceSchema.nullable(),
    publicationReceipt: submissionApplicationReceiptReferenceSchema.nullable(),
    registeredAt: timestampSchema,
  })
  .strict();

export type SubmissionApplicationRegistrationRequest = z.infer<
  typeof submissionApplicationRegistrationRequestSchema
>;
export type SubmissionApplicationRegistrationReceipt = z.infer<
  typeof submissionApplicationRegistrationReceiptSchema
>;
export type SubmissionApplicationSourceDecisionKind = z.infer<
  typeof submissionApplicationSourceDecisionKindSchema
>;
export type SubmissionApplicationKind = z.infer<typeof submissionApplicationKindSchema>;
export type SubmissionApplicationStatus = z.infer<typeof submissionApplicationStatusSchema>;
export type SubmissionPublicationStatus = z.infer<typeof submissionPublicationStatusSchema>;
export type SubmissionApplicationReceiptReference = z.infer<
  typeof submissionApplicationReceiptReferenceSchema
>;

export interface SubmissionApplicationRegistrationContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:application:register'];
}

export interface SubmissionApplicationRegistrationState {
  submissionId: string;
  submissionType: SubmissionType;
  workflowStatus: string;
  resolution: string | null;
  updatedAt: string;
  sourceDecisionEvent: {
    eventId: string;
    submissionId: string;
    toStatus: string;
    action: string;
    createdAt: string;
  } | null;
  candidatePromotionDecisionId: string | null;
  businessClaimFieldApplicationEventId: string | null;
}

export interface SubmissionApplicationRegistrationRecord {
  registrationRequestId: string;
  applicationId: string;
  submissionId: string;
  submissionType: SubmissionType;
  sourceDecisionKind: SubmissionApplicationSourceDecisionKind;
  sourceDecisionEventId: string;
  applicationKind: SubmissionApplicationKind;
  applicationStatus: SubmissionApplicationStatus;
  publicationStatus: SubmissionPublicationStatus;
  applicationReceipt: SubmissionApplicationReceiptReference | null;
  publicationReceipt: SubmissionApplicationReceiptReference | null;
  actorId: string;
  requestFingerprint: string;
  registeredAt: string;
}

export interface SubmissionApplicationRegistrationCommand {
  registrationRequestId: string;
  applicationId: string;
  submissionId: string;
  submissionType: SubmissionType;
  sourceDecisionKind: SubmissionApplicationSourceDecisionKind;
  sourceDecisionEventId: string;
  expectedSubmissionUpdatedAt: Date;
  applicationKind: SubmissionApplicationKind;
  applicationStatus: SubmissionApplicationStatus;
  publicationStatus: SubmissionPublicationStatus;
  applicationReceipt: SubmissionApplicationReceiptReference | null;
  publicationReceipt: SubmissionApplicationReceiptReference | null;
  actorId: string;
  actorType: 'human' | 'system';
  requestFingerprint: string;
  registeredAt: Date;
}

export interface SubmissionApplicationRegistrationBackend {
  readRegistration(requestId: string): Promise<SubmissionApplicationRegistrationRecord | null>;
  readApplicationBySubmission(
    submissionId: string,
  ): Promise<SubmissionApplicationRegistrationRecord | null>;
  readState(
    submissionId: string,
    sourceDecisionEventId: string,
  ): Promise<SubmissionApplicationRegistrationState | null>;
  commitRegistration(command: SubmissionApplicationRegistrationCommand): Promise<void>;
}

export class SubmissionApplicationRegistrationError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'ineligible'
      | 'conflict'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionApplicationRegistrationError';
  }
}

interface SourceDecisionContract {
  submissionTypes: readonly SubmissionType[];
  actions: readonly string[];
  resolutions: readonly string[];
  applicationKind: SubmissionApplicationKind;
  defaultApplicationStatus: SubmissionApplicationStatus;
  defaultPublicationStatus: SubmissionPublicationStatus;
}

const sourceDecisionContracts: Record<
  SubmissionApplicationSourceDecisionKind,
  SourceDecisionContract
> = {
  suggest_candidate_acceptance: {
    submissionTypes: ['suggest'],
    actions: ['submission_accepted_as_candidate'],
    resolutions: ['accepted_as_candidate'],
    applicationKind: 'candidate_resolution',
    defaultApplicationStatus: 'pending',
    defaultPublicationStatus: 'blocked',
  },
  positive_payment_evidence: {
    submissionTypes: ['payment_report'],
    actions: ['positive_payment_evidence_decided'],
    resolutions: ['approved'],
    applicationKind: 'report_evidence',
    defaultApplicationStatus: 'committed',
    defaultPublicationStatus: 'pending',
  },
  negative_report_evidence: {
    submissionTypes: ['payment_report', 'problem_report'],
    actions: ['negative_report_evidence_decided'],
    resolutions: ['approved'],
    applicationKind: 'report_evidence',
    defaultApplicationStatus: 'committed',
    defaultPublicationStatus: 'pending',
  },
  problem_correction_handoff: {
    submissionTypes: ['problem_report'],
    actions: ['problem_correction_handoff_approved'],
    resolutions: ['approved'],
    applicationKind: 'problem_correction',
    defaultApplicationStatus: 'pending',
    defaultPublicationStatus: 'blocked',
  },
  problem_claim_mutation: {
    submissionTypes: ['problem_report', 'payment_report'],
    actions: ['problem_urgent_visibility_decided', 'negative_claim_action_decided'],
    resolutions: ['approved'],
    applicationKind: 'problem_claim_mutation',
    defaultApplicationStatus: 'committed',
    defaultPublicationStatus: 'pending',
  },
  business_claim_relationship: {
    submissionTypes: ['claim'],
    actions: ['business_claim_relationship_approved'],
    resolutions: ['approved'],
    applicationKind: 'business_claim_update',
    defaultApplicationStatus: 'pending',
    defaultPublicationStatus: 'blocked',
  },
  photos_parent_resolution: {
    submissionTypes: ['photos'],
    actions: ['photo_parent_resolution_decided'],
    resolutions: ['approved', 'partially_approved'],
    applicationKind: 'photo_media_set',
    defaultApplicationStatus: 'committed',
    defaultPublicationStatus: 'pending',
  },
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonicalize(value))),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function registrationReceipt(
  state: 'committed' | 'replayed',
  record: SubmissionApplicationRegistrationRecord,
): SubmissionApplicationRegistrationReceipt {
  return submissionApplicationRegistrationReceiptSchema.parse({
    state,
    applicationId: record.applicationId,
    submissionId: record.submissionId,
    submissionType: record.submissionType,
    sourceDecisionKind: record.sourceDecisionKind,
    sourceDecisionEventId: record.sourceDecisionEventId,
    applicationKind: record.applicationKind,
    applicationStatus: record.applicationStatus,
    publicationStatus: record.publicationStatus,
    applicationReceipt: record.applicationReceipt,
    publicationReceipt: record.publicationReceipt,
    registeredAt: record.registeredAt,
  });
}

function sameRegistration(
  existing: SubmissionApplicationRegistrationRecord,
  command: SubmissionApplicationRegistrationCommand,
): boolean {
  return (
    existing.registrationRequestId === command.registrationRequestId &&
    existing.applicationId === command.applicationId &&
    existing.submissionId === command.submissionId &&
    existing.submissionType === command.submissionType &&
    existing.sourceDecisionKind === command.sourceDecisionKind &&
    existing.sourceDecisionEventId === command.sourceDecisionEventId &&
    existing.applicationKind === command.applicationKind &&
    existing.applicationStatus === command.applicationStatus &&
    existing.publicationStatus === command.publicationStatus &&
    JSON.stringify(existing.applicationReceipt) === JSON.stringify(command.applicationReceipt) &&
    JSON.stringify(existing.publicationReceipt) === JSON.stringify(command.publicationReceipt) &&
    existing.actorId === command.actorId &&
    existing.requestFingerprint === command.requestFingerprint &&
    existing.registeredAt === command.registeredAt.toISOString()
  );
}

function planRegistration(
  context: SubmissionApplicationRegistrationContext,
  state: SubmissionApplicationRegistrationState,
  request: SubmissionApplicationRegistrationRequest,
  registeredAt: Date,
): Promise<SubmissionApplicationRegistrationCommand> {
  const contract = sourceDecisionContracts[request.sourceDecisionKind];
  if (
    !contract.submissionTypes.includes(state.submissionType) ||
    state.workflowStatus !== 'resolved' ||
    state.resolution === null ||
    !contract.resolutions.includes(state.resolution) ||
    state.sourceDecisionEvent === null ||
    state.sourceDecisionEvent.eventId !== request.sourceDecisionEventId ||
    state.sourceDecisionEvent.submissionId !== state.submissionId ||
    state.sourceDecisionEvent.toStatus !== 'resolved' ||
    !contract.actions.includes(state.sourceDecisionEvent.action) ||
    state.updatedAt !== request.expectedSubmissionUpdatedAt
  ) {
    throw new SubmissionApplicationRegistrationError(
      'ineligible',
      'The Submission decision is not eligible for application registration.',
    );
  }

  let applicationReceipt: SubmissionApplicationReceiptReference | null = null;
  if (
    request.sourceDecisionKind === 'suggest_candidate_acceptance' &&
    state.candidatePromotionDecisionId !== null
  ) {
    applicationReceipt = {
      kind: 'candidate_promotion_decision',
      ids: [state.candidatePromotionDecisionId],
    };
  }
  if (
    request.sourceDecisionKind === 'business_claim_relationship' &&
    state.businessClaimFieldApplicationEventId !== null
  ) {
    applicationReceipt = {
      kind: 'submission_event',
      ids: [state.businessClaimFieldApplicationEventId],
    };
  }

  const applicationStatus =
    applicationReceipt === null ? contract.defaultApplicationStatus : 'committed';
  const publicationStatus = applicationStatus === 'committed' ? 'pending' : 'blocked';
  const applicationId = await deterministicUuid(
    `submission-application:${state.submissionId}:${request.sourceDecisionEventId}`,
  );
  const requestFingerprint = await sha256({
    schemaVersion: request.schemaVersion,
    registrationRequestId: request.requestId,
    applicationId,
    submissionId: state.submissionId,
    submissionType: state.submissionType,
    sourceDecisionKind: request.sourceDecisionKind,
    sourceDecisionEventId: request.sourceDecisionEventId,
    expectedSubmissionUpdatedAt: request.expectedSubmissionUpdatedAt,
    applicationKind: contract.applicationKind,
    applicationStatus,
    publicationStatus,
    applicationReceipt,
    publicationReceipt: null,
    actorId: context.actorId,
    actorType: context.actorType,
    registeredAt: registeredAt.toISOString(),
  });

  return {
    registrationRequestId: request.requestId,
    applicationId,
    submissionId: state.submissionId,
    submissionType: state.submissionType,
    sourceDecisionKind: request.sourceDecisionKind,
    sourceDecisionEventId: request.sourceDecisionEventId,
    expectedSubmissionUpdatedAt: new Date(request.expectedSubmissionUpdatedAt),
    applicationKind: contract.applicationKind,
    applicationStatus,
    publicationStatus,
    applicationReceipt,
    publicationReceipt: null,
    actorId: context.actorId,
    actorType: context.actorType,
    requestFingerprint,
    registeredAt,
  };
}

export async function registerSubmissionApplication(
  context: SubmissionApplicationRegistrationContext,
  backend: SubmissionApplicationRegistrationBackend,
  submissionId: string,
  rawRequest: unknown,
  registeredAt = new Date(),
): Promise<SubmissionApplicationRegistrationReceipt> {
  if (!context.capabilities.includes('submission:application:register')) {
    throw new SubmissionApplicationRegistrationError(
      'unauthorized',
      'The actor is not authorized to register Submission applications.',
    );
  }
  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = submissionApplicationRegistrationRequestSchema.safeParse(rawRequest);
  if (
    !submissionIdResult.success ||
    !requestResult.success ||
    Number.isNaN(registeredAt.getTime())
  ) {
    throw new SubmissionApplicationRegistrationError(
      'invalid_request',
      'The Submission application registration request is invalid.',
    );
  }
  const request = requestResult.data;

  let existing: SubmissionApplicationRegistrationRecord | null;
  try {
    existing = await backend.readRegistration(request.requestId);
  } catch (error) {
    throw new SubmissionApplicationRegistrationError(
      'backend_failure',
      'The application registration replay check failed.',
      { cause: error },
    );
  }
  if (existing !== null) {
    if (
      existing.registrationRequestId !== request.requestId ||
      existing.submissionId !== submissionIdResult.data ||
      existing.sourceDecisionKind !== request.sourceDecisionKind ||
      existing.sourceDecisionEventId !== request.sourceDecisionEventId ||
      existing.actorId !== context.actorId
    ) {
      throw new SubmissionApplicationRegistrationError(
        'idempotency_conflict',
        'The application registration UUID was already used for different content.',
      );
    }
    return registrationReceipt('replayed', existing);
  }

  let alreadyRegistered: SubmissionApplicationRegistrationRecord | null;
  try {
    alreadyRegistered = await backend.readApplicationBySubmission(submissionIdResult.data);
  } catch (error) {
    throw new SubmissionApplicationRegistrationError(
      'backend_failure',
      'The existing Submission application could not be loaded.',
      { cause: error },
    );
  }
  if (alreadyRegistered !== null) {
    throw new SubmissionApplicationRegistrationError(
      'conflict',
      'The Submission already has an application record.',
    );
  }

  let state: SubmissionApplicationRegistrationState | null;
  try {
    state = await backend.readState(submissionIdResult.data, request.sourceDecisionEventId);
  } catch (error) {
    throw new SubmissionApplicationRegistrationError(
      'backend_failure',
      'The Submission decision state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null) {
    throw new SubmissionApplicationRegistrationError(
      'not_found',
      'The Submission decision was not found.',
    );
  }

  const command = await planRegistration(context, state, request, registeredAt);
  try {
    await backend.commitRegistration(command);
  } catch (error) {
    if (error instanceof SubmissionApplicationRegistrationError) throw error;
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let concurrent: SubmissionApplicationRegistrationRecord | null = null;
      try {
        concurrent = await backend.readRegistration(request.requestId);
      } catch {
        // Keep the original persistence conflict.
      }
      if (concurrent !== null && sameRegistration(concurrent, command)) {
        return registrationReceipt('replayed', concurrent);
      }
      throw new SubmissionApplicationRegistrationError(
        'conflict',
        'The Submission application registration conflicted with current state.',
        { cause: error },
      );
    }
    throw new SubmissionApplicationRegistrationError(
      'backend_failure',
      'The Submission application registration could not be committed.',
      { cause: error },
    );
  }

  return registrationReceipt('committed', {
    registrationRequestId: command.registrationRequestId,
    applicationId: command.applicationId,
    submissionId: command.submissionId,
    submissionType: command.submissionType,
    sourceDecisionKind: command.sourceDecisionKind,
    sourceDecisionEventId: command.sourceDecisionEventId,
    applicationKind: command.applicationKind,
    applicationStatus: command.applicationStatus,
    publicationStatus: command.publicationStatus,
    applicationReceipt: command.applicationReceipt,
    publicationReceipt: command.publicationReceipt,
    actorId: command.actorId,
    requestFingerprint: command.requestFingerprint,
    registeredAt: command.registeredAt.toISOString(),
  });
}
