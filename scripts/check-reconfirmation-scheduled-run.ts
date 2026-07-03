import { createDrizzleScheduledReconfirmationBackend } from '../src/admin/reconfirmation/drizzle-scheduled-backend';
import { createScheduledReconfirmationBoundary } from '../src/admin/reconfirmation/scheduled-boundary';
import {
  scheduledReconfirmationBatchSchema,
  scheduledReconfirmationContextSchema,
  scheduledReconfirmationInputSchema,
  scheduledReconfirmationRunReceiptSchema,
} from '../src/admin/reconfirmation/scheduled-contract';
import {
  scheduledReconfirmationRequestId,
  scheduledReconfirmationRunId,
} from '../src/admin/reconfirmation/scheduled-request-id';
import { createScheduledReconfirmationService } from '../src/admin/reconfirmation/scheduled-run';

for (const value of [
  scheduledReconfirmationBatchSchema,
  scheduledReconfirmationContextSchema,
  scheduledReconfirmationInputSchema,
  scheduledReconfirmationRunReceiptSchema,
]) {
  if (value === undefined) throw new Error('Scheduled reconfirmation schema is missing.');
}
for (const value of [
  createDrizzleScheduledReconfirmationBackend,
  createScheduledReconfirmationBoundary,
  scheduledReconfirmationRequestId,
  scheduledReconfirmationRunId,
  createScheduledReconfirmationService,
]) {
  if (typeof value !== 'function') {
    throw new Error('Scheduled reconfirmation runtime export is missing.');
  }
}
console.log('Scheduled reconfirmation checks passed.');
