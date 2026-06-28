import { describe, expect, it } from 'vitest';
import {
  AdminAccessIdentityError,
  parseVerifiedAdminAccessIdentity,
} from '../src/admin/access/identity';

describe('verified Cloudflare Access identity', () => {
  it('creates a human administration actor from a verified identity payload', () => {
    expect(
      parseVerifiedAdminAccessIdentity({
        sub: '7335d417-61da-459d-899c-0a01c76a2f94',
        email: 'reviewer@example.com',
      }),
    ).toEqual({
      actorId: 'cloudflare-access:7335d417-61da-459d-899c-0a01c76a2f94',
      actorType: 'human',
      subject: '7335d417-61da-459d-899c-0a01c76a2f94',
      email: 'reviewer@example.com',
    });
  });

  it('supports a verified service identity without assuming an email address', () => {
    expect(parseVerifiedAdminAccessIdentity({ sub: 'service-token-subject' })).toEqual({
      actorId: 'cloudflare-access:service-token-subject',
      actorType: 'system',
      subject: 'service-token-subject',
      email: null,
    });
  });

  it('rejects an unverified or incomplete payload', () => {
    expect(() => parseVerifiedAdminAccessIdentity({ email: 'reviewer@example.com' })).toThrow(
      AdminAccessIdentityError,
    );
  });
});
