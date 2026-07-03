import {
  scheduledReconfirmationContextSchema,
  scheduledReconfirmationInputSchema,
  scheduledReconfirmationRunReceiptSchema,
} from '../src/admin/reconfirmation/scheduled-contract';
import { scheduledReconfirmationRequestId } from '../src/admin/reconfirmation/scheduled-request-id';
import { createScheduledReconfirmationService } from '../src/admin/reconfirmation/scheduled-run';

for (const value of [
  scheduledReconfirmationContextSchema,
  scheduledReconfirmationInputSchema,
  scheduledReconfirmationRunReceiptSchema,
]) {
  if (value === undefined) throw new Error('Scheduled reconfirmation schema is missing.');
}
if (typeof scheduledReconfirmationRequestId !== 'function') {
  throw new Error('Scheduled reconfirmation request ID factory is missing.');
}
if (typeof createScheduledReconfirmationService !== 'function') {
  throw new Error('Scheduled reconfirmation service is missing.');
}
console.log('Scheduled reconfirmation checks passed.');
