import { describe, expect, it } from 'vitest';
import {
  AdminDashboardAuthorizationError,
  authorizeAdminDashboardRead,
  readAdminDashboardAuthorizationPolicy,
} from '../src/admin/dashboard/authorization';
import { readProtectedAdminIdentity } from '../src/admin/dashboard/identity-context';

const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

describe('administration dashboard authorization', () => {
  it('parses an exact subject allowlist without using email addresses', () => {
    const policy = readAdminDashboardAuthorizationPolicy({
      CPM_ADMIN_DASHBOARD_SUBJECTS: JSON.stringify(['reviewer-subject', 'service-subject']),
    });

    expect(policy.subjects).toEqual(new Set(['reviewer-subject', 'service-subject']));
    expect(authorizeAdminDashboardRead(identity, policy)).toEqual({
      actorId: identity.actorId,
      actorType: 'human',
      capabilities: ['dashboard:read'],
    });
  });

  it.each([
    {},
    { CPM_ADMIN_DASHBOARD_SUBJECTS: '' },
    { CPM_ADMIN_DASHBOARD_SUBJECTS: 'not-json' },
    { CPM_ADMIN_DASHBOARD_SUBJECTS: JSON.stringify([]) },
    { CPM_ADMIN_DASHBOARD_SUBJECTS: JSON.stringify(['same', 'same']) },
  ])('fails closed on missing or malformed policy', (environment) => {
    expect(() => readAdminDashboardAuthorizationPolicy(environment)).toThrow(
      AdminDashboardAuthorizationError,
    );
  });

  it('denies a verified subject that is not explicitly allowlisted', () => {
    const policy = readAdminDashboardAuthorizationPolicy({
      CPM_ADMIN_DASHBOARD_SUBJECTS: JSON.stringify(['another-subject']),
    });

    expect(() => authorizeAdminDashboardRead(identity, policy)).toThrow(
      expect.objectContaining({ code: 'denied' }),
    );
  });

  it('accepts only a structurally consistent protected identity context', () => {
    expect(readProtectedAdminIdentity(identity)).toEqual(identity);

    expect(() =>
      readProtectedAdminIdentity({
        ...identity,
        actorId: 'cloudflare-access:another-subject',
      }),
    ).toThrow(expect.objectContaining({ code: 'denied' }));

    expect(() =>
      readProtectedAdminIdentity({
        ...identity,
        actorType: 'system',
      }),
    ).toThrow(expect.objectContaining({ code: 'denied' }));
  });
});
