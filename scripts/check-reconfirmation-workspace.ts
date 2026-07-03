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

for (const value of [
  createReconfirmationQueueHandler,
  createReconfirmationDetailGetHandler,
  createReconfirmationDetailPostHandler,
  createDrizzleProtectedReconfirmationWorkspaceBackend,
]) {
  if (typeof value !== 'function') {
    throw new Error('Protected reconfirmation workspace export is missing.');
  }
}
if (
  protectedReconfirmationQueueResponseSchema === undefined ||
  protectedReconfirmationDetailResponseSchema === undefined
) {
  throw new Error('Protected reconfirmation schemas are missing.');
}
console.log('Reconfirmation workspace checks passed.');
