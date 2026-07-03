import {
  authorizeMediaReview,
  mediaReviewActorPolicySchema,
  readMediaReviewAuthorizationPolicy,
} from '../src/admin/media-review/authorization';
import {
  createMediaReviewDecisionService,
  mediaReviewDecisionInputSchema,
  mediaReviewFileSnapshotSchema,
  mediaReviewMutationContextSchema,
  mediaReviewRightsDecisionSchema,
} from '../src/admin/media-review/decision';
import { createDrizzleMediaReviewBackend } from '../src/admin/media-review/drizzle-backend';
import { createDrizzleMediaReviewWorkspaceBackend } from '../src/admin/media-review/drizzle-workspace-backend';
import { authorizeMediaReviewRead } from '../src/admin/media-review/read-authorization';
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
import {
  loadMediaReviewDetail,
  loadMediaReviewQueue,
  mediaReviewDetailResponseSchema,
  mediaReviewQueueResponseSchema,
  parseMediaReviewQueueQuery,
} from '../src/admin/media-review/workspace';

for (const value of [
  mediaReviewActorPolicySchema,
  mediaReviewDecisionInputSchema,
  mediaReviewFileSnapshotSchema,
  mediaReviewMutationContextSchema,
  mediaReviewRightsDecisionSchema,
  mediaFileTransitionSchema,
  mediaStoragePlanSchema,
  mediaReviewQueueResponseSchema,
  mediaReviewDetailResponseSchema,
]) {
  if (value === undefined) throw new Error('Media review schema is missing.');
}
for (const value of [
  authorizeMediaReview,
  authorizeMediaReviewRead,
  readMediaReviewAuthorizationPolicy,
  createMediaReviewDecisionService,
  createDrizzleMediaReviewBackend,
  createDrizzleMediaReviewWorkspaceBackend,
  createStorageAwareMediaReviewBackend,
  buildMediaStoragePlan,
  privateMediaDerivativeKey,
  publicMediaDerivativeKey,
  parseMediaReviewQueueQuery,
  loadMediaReviewQueue,
  loadMediaReviewDetail,
]) {
  if (typeof value !== 'function') throw new Error('Media review runtime export is missing.');
}
console.log('Media review decision checks passed.');
