import { createDrizzleMediaReviewBackend } from '../src/admin/media-review/drizzle-backend';
import { mediaReviewDecisions } from '../src/db/schema';

if (typeof createDrizzleMediaReviewBackend !== 'function') {
  throw new Error('Media review backend export is missing.');
}
if (mediaReviewDecisions.requestId.name !== 'request_id') {
  throw new Error('Media review request identity is missing.');
}
console.log('Media review persistence checks passed.');
