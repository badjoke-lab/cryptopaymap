import { createReconfirmationQueueHandler } from '../functions/admin/api/rechecks';
import {
  createReconfirmationDetailGetHandler,
  createReconfirmationDetailPostHandler,
} from '../src/admin/reconfirmation/http-detail';
import { createDrizzleProtectedReconfirmationWorkspaceBackend } from '../src/admin/reconfirmation/drizzle-protected-workspace-backend';
import {
  protectedReconfirmationDetailResponseSchema,
  protectedReconfirmationQueueResponseSchema,
} from '../src/admin/reconfirmation/protected-workspace';
import {
  scheduledReconfirmationContextSchema,
  scheduledReconfirmationInputSchema,
  scheduledReconfirmationRunReceiptSchema,
} from '../src/admin/reconfirmation/scheduled-contract';
import { scheduledReconfirmationRequestId } from '../src/admin/reconfirmation/scheduled-request-id';
import { createScheduledReconfirmationService } from '../src/admin/reconfirmation/scheduled-run';

for (const value of [
  createReconfirmationQueueHandler,
  createReconfirmationDetailGetHandler,
  createReconfirmationDetailPostHandler,
  createDrizzleProtectedReconfirmationWorkspaceBackend,
  scheduledReconfirmationRequestId,
  createScheduledReconfirmationService,
]) {
  if (typeof value !== 'function') {
    throw new Error('Protected reconfirmation workspace export is missing.');
  }
}
if (
  protectedReconfirmationQueueResponseSchema === undefined ||
  protectedReconfirmationDetailResponseSchema === undefined ||
  scheduledReconfirmationContextSchema === undefined ||
  scheduledReconfirmationInputSchema === undefined ||
  scheduledReconfirmationRunReceiptSchema === undefined
) {
  throw new Error('Protected reconfirmation schema is missing.');
}
console.log('Reconfirmation workspace checks passed.');
