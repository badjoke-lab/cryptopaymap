import { describe, expect, it } from 'vitest';
import {
  availableMediaReviewActions,
  isMediaReviewUiStateSupported,
} from '../src/admin/media-review/ui-actions';

describe('Media reviewer UI action matrix', () => {
  it('keeps Evidence and owner proof on the private review path', () => {
    for (const purpose of ['evidence', 'owner_verification'] as const) {
      expect(
        availableMediaReviewActions({
          reviewStatus: 'pending',
          purpose,
          visibility: 'private',
        }),
      ).toEqual(['approve_private', 'reject']);
    }
  });

  it('offers public approval only for gallery candidates and canonical logos', () => {
    for (const purpose of ['public_gallery_candidate', 'canonical_logo'] as const) {
      expect(
        availableMediaReviewActions({
          reviewStatus: 'pending',
          purpose,
          visibility: 'private',
        }),
      ).toEqual(['approve_public', 'reject']);
    }

    const unsupported = {
      reviewStatus: 'pending' as const,
      purpose: 'public_gallery' as const,
      visibility: 'private' as const,
    };
    expect(isMediaReviewUiStateSupported(unsupported)).toBe(false);
    expect(availableMediaReviewActions(unsupported)).toEqual([]);
  });

  it('offers restriction and supersession only for accepted display Media', () => {
    expect(
      availableMediaReviewActions({
        reviewStatus: 'accepted',
        purpose: 'public_gallery',
        visibility: 'public',
      }),
    ).toEqual(['restrict', 'supersede']);
    expect(
      availableMediaReviewActions({
        reviewStatus: 'accepted',
        purpose: 'canonical_logo',
        visibility: 'restricted',
      }),
    ).toEqual(['supersede']);
    expect(
      availableMediaReviewActions({
        reviewStatus: 'accepted',
        purpose: 'evidence',
        visibility: 'private',
      }),
    ).toEqual([]);
  });

  it('offers no mutation for rejected or superseded Media', () => {
    expect(
      availableMediaReviewActions({
        reviewStatus: 'rejected',
        purpose: 'evidence',
        visibility: 'private',
      }),
    ).toEqual([]);
    expect(
      availableMediaReviewActions({
        reviewStatus: 'superseded',
        purpose: 'public_gallery',
        visibility: 'restricted',
      }),
    ).toEqual([]);
  });
});
