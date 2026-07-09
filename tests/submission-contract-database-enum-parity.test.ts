import { describe, expect, it } from 'vitest';
import {
  submissionResolutionValues as databaseSubmissionResolutionValues,
  submissionWorkflowStatusValues as databaseSubmissionWorkflowStatusValues,
} from '../src/db/schema/enums';
import {
  submissionResolutionValues,
  submissionWorkflowStatusValues,
} from '../src/submissions/contract';

describe('submission contract database enum parity', () => {
  it('keeps workflow status values aligned with the existing database enum contract', () => {
    expect(submissionWorkflowStatusValues).toEqual(databaseSubmissionWorkflowStatusValues);
  });

  it('keeps resolution values aligned with the existing database enum contract', () => {
    expect(submissionResolutionValues).toEqual(databaseSubmissionResolutionValues);
  });
});
