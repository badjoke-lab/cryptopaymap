import { describe, expect, it } from 'vitest';
import {
  AdminAccessConfigurationError,
  adminAccessUnavailableResponse,
  readAdminAccessConfiguration,
} from '../src/admin/access/config';

const validEnvironment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'a'.repeat(64),
};

describe('administration Access configuration', () => {
  it('normalizes a valid team origin and audience tag', () => {
    expect(readAdminAccessConfiguration(validEnvironment)).toEqual({
      domain: 'https://test-team.cloudflareaccess.com',
      aud: 'a'.repeat(64),
    });
  });

  it.each([
    {},
    { ...validEnvironment, CF_ACCESS_TEAM_DOMAIN: 'http://test-team.cloudflareaccess.com' },
    { ...validEnvironment, CF_ACCESS_TEAM_DOMAIN: 'https://example.invalid' },
    { ...validEnvironment, CF_ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com/path' },
    { ...validEnvironment, CF_ACCESS_AUD: 'short' },
  ])('rejects missing or malformed configuration', (environment) => {
    expect(() => readAdminAccessConfiguration(environment)).toThrow(
      AdminAccessConfigurationError,
    );
  });

  it('returns a private unavailable response without configuration details', async () => {
    const response = adminAccessUnavailableResponse();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    await expect(response.text()).resolves.toBe('Administration access is unavailable.');
  });
});
