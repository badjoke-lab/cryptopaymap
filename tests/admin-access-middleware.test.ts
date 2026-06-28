import { describe, expect, it, vi } from 'vitest';
import { createAdminAccessMiddleware } from '../functions/admin/_middleware';

const validEnvironment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'a'.repeat(64),
};

function context(environment: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  return {
    request: new Request('https://cryptopaymap.example/admin'),
    env: environment,
    params: {},
    data,
    next: vi.fn(async () => new Response('next')),
    waitUntil: vi.fn(),
  };
}

const verifiedIdentity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

describe('administration Pages middleware', () => {
  it('fails closed before verification when configuration is unavailable', async () => {
    const verifier = vi.fn(async () => verifiedIdentity);
    const middleware = createAdminAccessMiddleware(verifier);

    const response = await middleware(context({}));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(verifier).not.toHaveBeenCalled();
  });

  it('stores only a verified identity and applies private response headers', async () => {
    const verifier = vi.fn(async () => verifiedIdentity);
    const middleware = createAdminAccessMiddleware(verifier);
    const requestContext = context(validEnvironment);

    const response = await middleware(requestContext);

    expect(verifier).toHaveBeenCalledWith(requestContext.request, {
      domain: validEnvironment.CF_ACCESS_TEAM_DOMAIN,
      aud: validEnvironment.CF_ACCESS_AUD,
    });
    expect(requestContext.data.adminIdentity).toEqual(verifiedIdentity);
    expect(requestContext.next).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    await expect(response.text()).resolves.toBe('next');
  });

  it('denies an invalid assertion without serving the administration shell', async () => {
    const verifier = vi.fn(async () => {
      throw new Error('invalid assertion');
    });
    const middleware = createAdminAccessMiddleware(verifier);
    const requestContext = context(validEnvironment);

    const response = await middleware(requestContext);

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(requestContext.next).not.toHaveBeenCalled();
    expect(requestContext.data.adminIdentity).toBeUndefined();
    await expect(response.text()).resolves.toBe('Administration access was denied.');
  });
});
