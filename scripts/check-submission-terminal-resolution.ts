import { createTerminalResolutionHandler } from '../functions/admin/api/terminal-resolution/[submissionId]';
import { createDrizzleTerminalResolutionBackend } from '../src/admin/submissions/drizzle-terminal-resolution-backend';
import {
  authorizeSubmissionTerminalResolution,
  readSubmissionTerminalResolutionAuthorizationPolicy,
} from '../src/admin/submissions/terminal-resolution-authorization';
import {
  applySubmissionTerminalResolution,
  submissionTerminalResolutionReceiptSchema,
  submissionTerminalResolutionRequestSchema,
} from '../src/admin/submissions/terminal-resolution';
import {
  parseSubmissionTerminalResolutionEventPayload,
  submissionTerminalResolutionEventPayloadSchema,
} from '../src/submissions/terminal-resolution-contract';

submissionTerminalResolutionRequestSchema.parse({
  schemaVersion: 'submission-terminal-resolution-v1',
  requestId: '10000000-0000-4000-8000-000000000001',
  submissionType: 'suggest',
  action: 'not_approved',
  expectedStatus: 'in_review',
  expectedUpdatedAt: '2026-07-16T04:00:00.000Z',
  reasonCode: 'insufficient_evidence',
  publicMessage: 'The Submission could not be approved.',
  internalNote: null,
  duplicateSubmissionId: null,
});

submissionTerminalResolutionReceiptSchema.parse({
  state: 'committed',
  submissionId: '20000000-0000-4000-8000-000000000001',
  submissionType: 'photos',
  action: 'no_change',
  fromStatus: 'in_review',
  toStatus: 'resolved',
  resolution: 'no_change',
  reasonCode: 'already_current',
  publicMessage: 'No public change is required.',
  duplicateSubmissionId: null,
  duplicateSubmissionPublicId: null,
  changedAt: '2026-07-16T04:01:00.000Z',
});

for (const executable of [
  applySubmissionTerminalResolution,
  readSubmissionTerminalResolutionAuthorizationPolicy,
  authorizeSubmissionTerminalResolution,
  createDrizzleTerminalResolutionBackend,
  createTerminalResolutionHandler,
  parseSubmissionTerminalResolutionEventPayload,
  submissionTerminalResolutionEventPayloadSchema.parse,
]) {
  if (typeof executable !== 'function') {
    throw new Error('Submission terminal-resolution boundary is not executable.');
  }
}

console.log('Submission terminal-resolution schemas and services passed.');
