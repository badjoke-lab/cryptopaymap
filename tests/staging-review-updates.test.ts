import { describe, expect, it } from 'vitest';
import { buildStagingReviewUpdates } from '../scripts/staging-review-updates';

describe('staging review Updates feed', () => {
  it('covers all public update types with synthetic subjects', () => {
    const updates = buildStagingReviewUpdates();

    expect(updates.records).toHaveLength(8);
    expect(new Set(updates.records.map((update) => update.updateType))).toEqual(
      new Set([
        'newly_confirmed',
        'reconfirmed',
        'payment_method_changed',
        'marked_stale',
        'ended',
        'new_online_service',
      ]),
    );
    expect(updates.records.every((update) => update.subjectSlug.startsWith('staging-'))).toBe(true);
  });
});
