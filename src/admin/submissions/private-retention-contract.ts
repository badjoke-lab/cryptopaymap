import { z } from 'zod';
import {
  submissionRetentionMaterialValues,
  submissionRetentionPolicyValues,
  submissionRetentionReferenceTypeValues,
} from '../../db/schema';

export const PRIVATE_RETENTION_DAYS = {
  payload: 180,
  evidence: 180,
  ownerVerificationMedia: 90,
} as const;

export const privateRetentionCapabilityValues = ['submission:retention:execute'] as const;
export const privateRetentionContextSchema = z
  .object({
    runId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.literal('system'),
    capabilities: z.array(z.literal('submission:retention:execute')).min(1),
  })
  .strict();

export const privateRetentionInputSchema = z
  .object({
    effectiveAt: z.iso.datetime({ offset: true }),
    databaseLimit: z.number().int().min(1).max(50).default(50),
    photoLimit: z.number().int().min(1).max(50).default(50),
    privateMediaLimit: z.number().int().min(1).max(50).default(50),
  })
  .strict();

export const privateRetentionDatabaseCandidateSchema = z
  .object({
    material: z.enum(['contact', 'payload', 'evidence']),
    policy: z.enum(['contact_retention_expired', 'terminal_payload_180d', 'private_evidence_180d']),
    referenceType: z.enum(['submission', 'evidence']),
    referenceId: z.uuid(),
    submissionId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    eligibleAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((candidate, context) => {
    const valid =
      (candidate.material === 'contact' &&
        candidate.policy === 'contact_retention_expired' &&
        candidate.referenceType === 'submission' &&
        candidate.referenceId === candidate.submissionId) ||
      (candidate.material === 'payload' &&
        candidate.policy === 'terminal_payload_180d' &&
        candidate.referenceType === 'submission' &&
        candidate.referenceId === candidate.submissionId) ||
      (candidate.material === 'evidence' &&
        candidate.policy === 'private_evidence_180d' &&
        candidate.referenceType === 'evidence');
    if (!valid) {
      context.addIssue({
        code: 'custom',
        path: ['policy'],
        message: 'Retention material, policy, and reference type do not match.',
      });
    }
  });

export const privateRetentionDatabaseBatchSchema = z
  .object({
    candidates: z.array(privateRetentionDatabaseCandidateSchema).max(50),
    hasMore: z.boolean(),
  })
  .strict();

export const privateRetentionOutcomeSchema = z
  .object({
    material: z.enum(submissionRetentionMaterialValues),
    policy: z.enum(submissionRetentionPolicyValues),
    referenceType: z.enum(submissionRetentionReferenceTypeValues),
    referenceId: z.uuid(),
    state: z.enum(['committed', 'replayed', 'conflict', 'failed']),
  })
  .strict();

export const privateRetentionRunReceiptSchema = z
  .object({
    schemaVersion: z.literal('private-retention-run-receipt-v1'),
    runId: z.uuid(),
    effectiveAt: z.iso.datetime({ offset: true }),
    state: z.enum(['completed', 'partial', 'replayed']),
    scannedCount: z.number().int().min(0).max(150),
    committedCount: z.number().int().min(0).max(150),
    replayedCount: z.number().int().min(0).max(150),
    conflictCount: z.number().int().min(0).max(150),
    failedCount: z.number().int().min(0).max(150),
    deletedObjectCount: z.number().int().min(0),
    missingObjectCount: z.number().int().min(0),
    failedObjectCount: z.number().int().min(0),
    hasMore: z.boolean(),
    phaseFailures: z
      .array(z.enum(['database_candidates', 'photo_cleanup', 'private_media_cleanup']))
      .max(3),
    outcomes: z.array(privateRetentionOutcomeSchema).max(150),
  })
  .strict();

export type PrivateRetentionContext = z.infer<typeof privateRetentionContextSchema>;
export type PrivateRetentionInput = z.infer<typeof privateRetentionInputSchema>;
export type PrivateRetentionDatabaseCandidate = z.infer<
  typeof privateRetentionDatabaseCandidateSchema
>;
export type PrivateRetentionDatabaseBatch = z.infer<typeof privateRetentionDatabaseBatchSchema>;
export type PrivateRetentionOutcome = z.infer<typeof privateRetentionOutcomeSchema>;
export type PrivateRetentionRunReceipt = z.infer<typeof privateRetentionRunReceiptSchema>;

export interface PrivateRetentionRunRecord {
  runId: string;
  effectiveAt: string;
  actorId: string;
  requestFingerprint: string;
  state: 'running' | 'completed' | 'partial';
  receipt: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface BeginPrivateRetentionRunCommand {
  runId: string;
  effectiveAt: Date;
  actorId: string;
  requestFingerprint: string;
  startedAt: Date;
}

export interface ApplyPrivateRetentionCandidateCommand {
  itemId: string;
  runId: string;
  actorId: string;
  effectiveAt: Date;
  candidate: PrivateRetentionDatabaseCandidate;
}

export interface CompletePrivateMediaRetentionCommand {
  itemId: string;
  runId: string;
  actorId: string;
  effectiveAt: Date;
  policy: z.infer<typeof privateRetentionOutcomeSchema>['policy'];
  referenceType: 'reservation' | 'submission' | 'media_asset';
  referenceId: string;
  submissionId: string | null;
  deletedObjectCount: number;
  missingObjectCount: number;
}

export interface FinalizePrivateRetentionRunCommand {
  runId: string;
  requestFingerprint: string;
  state: 'completed' | 'partial';
  receipt: PrivateRetentionRunReceipt;
  completedAt: Date;
}

export interface PrivateRetentionBackend {
  beginRun(command: BeginPrivateRetentionRunCommand): Promise<{
    state: 'started' | 'resumed' | 'replayed';
    receipt: PrivateRetentionRunReceipt | null;
  }>;
  loadDatabaseCandidates(effectiveAt: Date, limit: number): Promise<PrivateRetentionDatabaseBatch>;
  applyDatabaseCandidate(
    command: ApplyPrivateRetentionCandidateCommand,
  ): Promise<'committed' | 'replayed'>;
  completeMediaCandidate(
    command: CompletePrivateMediaRetentionCommand,
  ): Promise<'committed' | 'replayed'>;
  finalizeRun(command: FinalizePrivateRetentionRunCommand): Promise<void>;
}

export class PrivateRetentionError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'invalid_run' | 'idempotency_conflict' | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PrivateRetentionError';
  }
}
