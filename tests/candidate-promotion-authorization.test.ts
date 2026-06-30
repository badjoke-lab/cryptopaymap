import { describe, expect, it } from 'vitest';
import {
  CandidatePromotionAuthorizationError,
  authorizeCandidatePromotion,
  readCandidatePromotionAuthorizationPolicy,
} from '../src/admin/promotion/authorization';

const identity = {
  actorId: 'cloudflare-access:promoter',
  actorType: 'human' as const,
  subject: 'promoter',
  email: 'promoter@example.test',
};
const requestId = '10000000-0000-4000-8000-000000000001';

describe('Candidate promotion authorization', () => {
  it('creates the isolated promotion capability for an allowlisted identity', () => {
    const policy = readCandidatePromotionAuthorizationPolicy({
      CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: JSON.stringify(['promoter']),
    });

    expect(authorizeCandidatePromotion(identity, policy, requestId)).toEqual({
      requestId,
      actorId: identity.actorId,
      actorType: 'human',
      capabilities: ['candidate:promote'],
    });
  });

  it('fails closed when the allowlist is missing', () => {
    expect(() =>
      authorizeCandidatePromotion(
        identity,
        readCandidatePromotionAuthorizationPolicy({}),
        requestId,
      ),
    ).toThrowError(CandidatePromotionAuthorizationError);
  });

  it('requires a valid idempotency UUID', () => {
    const policy = readCandidatePromotionAuthorizationPolicy({
      CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: JSON.stringify(['promoter']),
    });
    expect(() => authorizeCandidatePromotion(identity, policy, 'invalid')).toThrowError(
      expect.objectContaining({ code: 'invalid_request_id' }),
    );
  });
});
