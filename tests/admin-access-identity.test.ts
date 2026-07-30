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

  it('supports a verified identity subject without assuming an email address', () => {
    expect(parseVerifiedAdminAccessIdentity({ sub: 'service-token-subject' })).toEqual({
      actorId: 'cloudflare-access:service-token-subject',
      actorType: 'system',
      subject: 'service-token-subject',
      email: null,
    });
  });

  it('maps a verified Cloudflare service-token common name to a bounded system identity', () => {
    expect(
      parseVerifiedAdminAccessIdentity({
        sub: '',
        common_name: '8f64ab31d9e844d491e42d31b3c1a201.access',
      }),
    ).toEqual({
      actorId: 'cloudflare-access:service-token:8f64ab31d9e844d491e42d31b3c1a201.access',
      actorType: 'system',
      subject: 'service-token:8f64ab31d9e844d491e42d31b3c1a201.access',
      email: null,
    });
  });

  it('rejects an empty subject without a valid verified service-token common name', () => {
    expect(() => parseVerifiedAdminAccessIdentity({ sub: '' })).toThrow(AdminAccessIdentityError);
    expect(() =>
      parseVerifiedAdminAccessIdentity({
        sub: '',
        common_name: 'not-a-service-token',
      }),
    ).toThrow(AdminAccessIdentityError);
  });

  it('rejects a service-token identity that contains a user email', () => {
    expect(() =>
      parseVerifiedAdminAccessIdentity({
        sub: '',
        common_name: '8f64ab31d9e844d491e42d31b3c1a201.access',
        email: 'reviewer@example.com',
      }),
    ).toThrow(AdminAccessIdentityError);
  });

  it('rejects an unverified or incomplete payload', () => {
    expect(() => parseVerifiedAdminAccessIdentity({ email: 'reviewer@example.com' })).toThrow(
      AdminAccessIdentityError,
    );
  });
});
