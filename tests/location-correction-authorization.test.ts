import { describe, expect, it } from 'vitest';
import {
  LocationCorrectionAuthorizationError,
  authorizeLocationCorrection,
  authorizeLocationCorrectionRead,
  readLocationCorrectionAuthorizationPolicy,
} from '../src/admin/location-correction/authorization';

const identity = {
  actorId: 'cloudflare-access:subject-1',
  actorType: 'human' as const,
  subject: 'subject-1',
  email: 'reviewer@example.test',
};

describe('Location correction authorization', () => {
  it('issues isolated read and mutation contexts for an allowlisted subject', () => {
    const policy = readLocationCorrectionAuthorizationPolicy({
      CPM_ADMIN_LOCATION_CORRECT_SUBJECTS: JSON.stringify(['subject-1']),
    });
    expect(authorizeLocationCorrectionRead(identity, policy)).toEqual({
      actorId: identity.actorId,
      actorType: 'human',
      capabilities: ['location:correct'],
    });
    expect(
      authorizeLocationCorrection(
        identity,
        policy,
        '10000000-0000-4000-8000-000000000001',
      ),
    ).toMatchObject({
      requestId: '10000000-0000-4000-8000-000000000001',
      actorId: identity.actorId,
      capabilities: ['location:correct'],
    });
  });

  it('fails closed for missing configuration, wrong subject, and invalid idempotency key', () => {
    expect(() => readLocationCorrectionAuthorizationPolicy({})).not.toThrow();
    const unconfigured = readLocationCorrectionAuthorizationPolicy({});
    expect(() => authorizeLocationCorrectionRead(identity, unconfigured)).toThrow(
      LocationCorrectionAuthorizationError,
    );

    const wrongSubject = readLocationCorrectionAuthorizationPolicy({
      CPM_ADMIN_LOCATION_CORRECT_SUBJECTS: JSON.stringify(['subject-2']),
    });
    expect(() => authorizeLocationCorrectionRead(identity, wrongSubject)).toThrow(
      LocationCorrectionAuthorizationError,
    );

    const allowed = readLocationCorrectionAuthorizationPolicy({
      CPM_ADMIN_LOCATION_CORRECT_SUBJECTS: JSON.stringify(['subject-1']),
    });
    expect(() => authorizeLocationCorrection(identity, allowed, 'not-a-uuid')).toThrowError(
      expect.objectContaining({ code: 'invalid_request_id' }),
    );
  });
});
