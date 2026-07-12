import { describe, expect, it } from 'vitest';
import { p502rSyntheticSuggestRequest } from '../scripts/p5-02r-synthetic-suggest-fixture.mjs';
import { suggestSubmissionIntakeSchema } from '../src/submissions/suggest-contract';

describe('P5-02R synthetic fixed-review fixture', () => {
  it('uses the strict Suggest contract and contains no contact or public target', () => {
    const request = p502rSyntheticSuggestRequest('ephemeral-test-token', 'P5-02R probe');

    expect(suggestSubmissionIntakeSchema.safeParse(request.submission).success).toBe(true);
    expect(request.submission.contact).toBeNull();
    expect(request.submission.targetType).toBeNull();
    expect(request.submission.targetId).toBeNull();
    expect(JSON.stringify(request.submission)).toContain('automated review probe');
  });
});
