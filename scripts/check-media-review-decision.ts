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

for (const value of [
  mediaReviewActorPolicySchema,
  mediaReviewDecisionInputSchema,
  mediaReviewFileSnapshotSchema,
  mediaReviewMutationContextSchema,
  mediaReviewRightsDecisionSchema,
]) {
  if (value === undefined) throw new Error('Media review schema is missing.');
}
for (const value of [authorizeMediaReview, createMediaReviewDecisionService]) {
  if (typeof value !== 'function') throw new Error('Media review runtime export is missing.');
}
console.log('Media review decision checks passed.');
