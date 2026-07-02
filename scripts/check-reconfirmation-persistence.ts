import { createDrizzleReconfirmationExpirationBackend } from '../src/admin/reconfirmation/drizzle-backend';
import { createDrizzleReconfirmationQueueBackend } from '../src/admin/reconfirmation/drizzle-queue-backend';
import { reconfirmationExpirations } from '../src/db/schema';

if (reconfirmationExpirations.requestId.name !== 'request_id') {
  throw new Error('Missing durable request ID.');
}
if (reconfirmationExpirations.requestFingerprint.name !== 'request_fingerprint') {
  throw new Error('Missing replay fingerprint.');
}
if (typeof createDrizzleReconfirmationExpirationBackend !== 'function') {
  throw new Error('Missing durable backend.');
}
if (typeof createDrizzleReconfirmationQueueBackend !== 'function') {
  throw new Error('Missing queue backend.');
}

console.log('Reconfirmation persistence checks passed.');
