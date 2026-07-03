import type { MediaReviewAction } from './decision';
import type { MediaReviewDetailResponse } from './workspace';

type MediaReviewUiState = Pick<
  MediaReviewDetailResponse['media'],
  'reviewStatus' | 'purpose' | 'visibility'
>;

export function isMediaReviewUiStateSupported(media: MediaReviewUiState): boolean {
  if (media.reviewStatus !== 'pending') return true;
  return ['evidence', 'owner_verification', 'public_gallery_candidate', 'canonical_logo'].includes(
    media.purpose,
  );
}

export function availableMediaReviewActions(media: MediaReviewUiState): MediaReviewAction[] {
  if (!isMediaReviewUiStateSupported(media)) return [];

  if (media.reviewStatus === 'pending') {
    if (['evidence', 'owner_verification'].includes(media.purpose)) {
      return ['approve_private', 'reject'];
    }
    if (['public_gallery_candidate', 'canonical_logo'].includes(media.purpose)) {
      return ['approve_public', 'reject'];
    }
    return [];
  }

  if (
    media.reviewStatus === 'accepted' &&
    ['public_gallery', 'canonical_logo'].includes(media.purpose)
  ) {
    if (media.visibility === 'public') return ['restrict', 'supersede'];
    if (media.visibility === 'restricted') return ['supersede'];
  }

  return [];
}
