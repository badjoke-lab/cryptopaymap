import { describe, expect, it } from 'vitest';
import {
  CandidateQueueAuthorizationError,
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
} from '../src/admin/candidates/authorization';

const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

describe('Candidate queue authorization', () => {
  it('grants only candidate:read to an exact verified subject', () => {
    const policy = readCandidateQueueAuthorizationPolicy({
      CPM_ADMIN_CANDIDATE_SUBJECTS: JSON.stringify(['reviewer-subject']),
    });
    expect(authorizeCandidateQueueRead(identity, policy)).toEqual({
      actorId: identity.actorId,
      actorType: 'human',
      capabilities: ['candidate:read'],
    });
  });

  it.each([
    {},
    { CPM_ADMIN_CANDIDATE_SUBJECTS: '' },
    { CPM_ADMIN_CANDIDATE_SUBJECTS: 'not-json' },
    { CPM_ADMIN_CANDIDATE_SUBJECTS: JSON.stringify([]) },
    { CPM_ADMIN_CANDIDATE_SUBJECTS: JSON.stringify(['same', 'same']) },
  ])('fails closed on missing or malformed policy', (environment) => {
    expect(() => readCandidateQueueAuthorizationPolicy(environment)).toThrow(
      CandidateQueueAuthorizationError,
    );
  });

  it('denies a verified subject not present in the allowlist', () => {
    const policy = readCandidateQueueAuthorizationPolicy({
      CPM_ADMIN_CANDIDATE_SUBJECTS: JSON.stringify(['another-subject']),
    });
    expect(() => authorizeCandidateQueueRead(identity, policy)).toThrow(
      expect.objectContaining({ code: 'denied' }),
    );
  });
});
