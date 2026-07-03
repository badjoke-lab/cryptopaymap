import {
  authorizeMediaReview,
  mediaReviewActorPolicySchema,
} from '../src/admin/media-review/authorization';
import {
  createMediaReviewDecisionService,
  mediaReviewDecisionInputSchema,
  mediaReviewFileSnapshotSchema,
  mediaReviewMutationContextSchema,
  mediaReviewRightsDecisionSchema,
} from '../src/admin/media-review/decision';
import { createDrizzleMediaReviewBackend } from '../src/admin/media-review/drizzle-backend';
import { createStorageAwareMediaReviewBackend } from '../src/admin/media-review/storage-backend';
import {
  mediaFileTransitionSchema,
  mediaStoragePlanSchema,
} from '../src/admin/media-review/storage-contract';
import {
  buildMediaStoragePlan,
  privateMediaDerivativeKey,
  publicMediaDerivativeKey,
} from '../src/admin/media-review/storage-plan';

for (const value of [
  mediaReviewActorPolicySchema,
  mediaReviewDecisionInputSchema,
  mediaReviewFileSnapshotSchema,
  mediaReviewMutationContextSchema,
  mediaReviewRightsDecisionSchema,
  mediaFileTransitionSchema,
  mediaStoragePlanSchema,
]) {
  if (value === undefined) throw new Error('Media review schema is missing.');
}
for (const value of [
  authorizeMediaReview,
  createMediaReviewDecisionService,
  createDrizzleMediaReviewBackend,
  createStorageAwareMediaReviewBackend,
  buildMediaStoragePlan,
  privateMediaDerivativeKey,
  publicMediaDerivativeKey,
]) {
  if (typeof value !== 'function') throw new Error('Media review runtime export is missing.');
}
console.log('Media review decision checks passed.');
