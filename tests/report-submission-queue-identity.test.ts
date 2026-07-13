import { describe, expect, it } from 'vitest';
import { assertReportSubmissionQueueIdentity } from '../src/admin/submissions/drizzle-report-submission-queue-backend';

const validIdentity = {
  submissionType: 'payment_report',
  storedTargetType: 'entity',
  storedTargetId: '20000000-0000-4000-8000-000000000001',
  normalizedReportKind: 'payment_report',
  normalizedTargetType: 'entity',
  normalizedTargetId: '20000000-0000-4000-8000-000000000001',
};

describe('P5-03D report queue identity validation', () => {
  it('accepts exact stored and normalized report identity', () => {
    expect(() => assertReportSubmissionQueueIdentity(validIdentity)).not.toThrow();
  });

  it.each([
    { normalizedReportKind: 'problem_report' },
    { normalizedTargetType: 'location' },
    { normalizedTargetId: '30000000-0000-4000-8000-000000000001' },
    { storedTargetType: null },
    { storedTargetId: null },
  ])('rejects mismatched report queue identity: %o', (override) => {
    expect(() =>
      assertReportSubmissionQueueIdentity({ ...validIdentity, ...override }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid_page',
      }),
    );
  });
});
