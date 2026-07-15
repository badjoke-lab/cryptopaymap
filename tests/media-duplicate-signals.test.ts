import { describe, expect, it } from 'vitest';
import {
  mediaDuplicateSignalsSchema,
  projectMediaDuplicateSignals,
} from '../src/admin/media-review/duplicate-signals';

const currentSubject = {
  type: 'location' as const,
  id: '10000000-0000-4000-8000-000000000001',
};

function candidate(mediaAssetId: string, subjectId: string, createdAt: string) {
  return {
    mediaAssetId,
    subject: { type: 'location' as const, id: subjectId },
    reviewStatus: 'pending' as const,
    visibility: 'private' as const,
    createdAt,
  };
}

describe('P5-05F Media duplicate signals', () => {
  it('projects exact original-hash matches as bounded manual-review signals', () => {
    const result = projectMediaDuplicateSignals(currentSubject, 'a'.repeat(64), [
      candidate(
        '20000000-0000-4000-8000-000000000001',
        currentSubject.id,
        '2026-07-15T02:00:00.000Z',
      ),
      candidate(
        '20000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002',
        '2026-07-15T03:00:00.000Z',
      ),
    ]);

    expect(result).toEqual({
      sourceOriginalContentHash: 'a'.repeat(64),
      matches: [
        expect.objectContaining({
          mediaAssetId: '20000000-0000-4000-8000-000000000002',
          sameTarget: false,
        }),
        expect.objectContaining({
          mediaAssetId: '20000000-0000-4000-8000-000000000001',
          sameTarget: true,
        }),
      ],
      hasMore: false,
      automaticDecision: false,
      manualReviewRequired: true,
    });
  });

  it('deduplicates Media Asset matches and reports a bounded remainder', () => {
    const duplicate = candidate(
      '20000000-0000-4000-8000-000000000001',
      currentSubject.id,
      '2026-07-15T02:00:00.000Z',
    );
    const result = projectMediaDuplicateSignals(
      currentSubject,
      'b'.repeat(64),
      [
        duplicate,
        duplicate,
        candidate(
          '20000000-0000-4000-8000-000000000002',
          currentSubject.id,
          '2026-07-15T01:00:00.000Z',
        ),
      ],
      1,
    );

    expect(result.matches).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.automaticDecision).toBe(false);
  });

  it('returns no review requirement when no original hash is available', () => {
    expect(projectMediaDuplicateSignals(currentSubject, null, [])).toEqual({
      sourceOriginalContentHash: null,
      matches: [],
      hasMore: false,
      automaticDecision: false,
      manualReviewRequired: false,
    });
  });

  it('rejects storage paths and automatic decisions from the signal contract', () => {
    expect(
      mediaDuplicateSignalsSchema.safeParse({
        sourceOriginalContentHash: 'c'.repeat(64),
        matches: [],
        hasMore: false,
        automaticDecision: true,
        manualReviewRequired: false,
        storageKey: 'media/private/secret.webp',
      }).success,
    ).toBe(false);
  });
});
