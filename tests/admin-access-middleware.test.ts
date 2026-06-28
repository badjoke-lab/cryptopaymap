import { describe, expect, it, vi } from 'vitest';
import { createAdminAccessMiddleware } from '../functions/admin/_middleware';

const validEnvironment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'a'.repeat(64),
};

function context(environment: Record<string, unknown>) {
  return {
    request: new Request('https://cryptopaymap.example/admin'),
    env: environment,
    params: {},
    data: {},
    next: vi.fn(async () => new Response('next')),
    waitUntil: vi.fn(),
  };
}

describe('administration Pages middleware', () => {
  it('fails closed before invoking the plugin when configuration is unavailable', async () => {
    const pluginFactory = vi.fn(() => vi.fn(async () => new Response('allowed')));
    const middleware = createAdminAccessMiddleware(pluginFactory);

    const response = await middleware(context({}));

    expect(response.status).toBe(503);
    expect(pluginFactory).not.toHaveBeenCalled();
  });

  it('delegates valid requests to the Access plugin boundary', async () => {
    const pluginMiddleware = vi.fn(async () => new Response('verified'));
    const pluginFactory = vi.fn(() => pluginMiddleware);
    const middleware = createAdminAccessMiddleware(pluginFactory);
    const requestContext = context(validEnvironment);

    const response = await middleware(requestContext);

    expect(pluginFactory).toHaveBeenCalledWith({
      domain: validEnvironment.CF_ACCESS_TEAM_DOMAIN,
      aud: validEnvironment.CF_ACCESS_AUD,
    });
    expect(pluginMiddleware).toHaveBeenCalledWith(requestContext);
    await expect(response.text()).resolves.toBe('verified');
  });
});
