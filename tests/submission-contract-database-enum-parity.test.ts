import { describe, expect, it } from 'vitest';
import {
  submissionResolutionValues as databaseSubmissionResolutionValues,
  submissionWorkflowStatusValues as databaseSubmissionWorkflowStatusValues,
} from '../src/db/schema/enums';
import {
  submissionRelationshipValues as databaseSubmissionRelationshipValues,
  submissionTargetTypeValues as databaseSubmissionTargetTypeValues,
  submissionTypeValues as databaseSubmissionTypeValues,
} from '../src/db/schema/submissions';
import {
  submissionRelationshipValues,
  submissionResolutionValues,
  submissionTargetTypeValues,
  submissionTypeValues,
  submissionWorkflowStatusValues,
} from '../src/submissions/contract';

describe('submission contract database enum parity', () => {
  it('keeps workflow status values aligned with the existing database enum contract', () => {
    expect(submissionWorkflowStatusValues).toEqual(databaseSubmissionWorkflowStatusValues);
  });

  it('keeps resolution values aligned with the existing database enum contract', () => {
    expect(submissionResolutionValues).toEqual(databaseSubmissionResolutionValues);
  });

  it('keeps submission type values aligned with the database enum contract', () => {
    expect(submissionTypeValues).toEqual(databaseSubmissionTypeValues);
  });

  it('keeps target type values aligned with the database enum contract', () => {
    expect(submissionTargetTypeValues).toEqual(databaseSubmissionTargetTypeValues);
  });

  it('keeps relationship values aligned with the database enum contract', () => {
    expect(submissionRelationshipValues).toEqual(databaseSubmissionRelationshipValues);
  });
});
