import { describe, expect, it, vi } from 'vitest';
import type { AdminAccessConfiguration } from '../src/admin/access/config';
import { verifyAdminAccessRequest } from '../src/admin/access/verification';

const configuration: AdminAccessConfiguration = {
  domain: 'https://test-team.cloudflareaccess.com',
  aud: 'a'.repeat(64),
};
const now = 1_800_000_000_000;

function encodeSegment(value: unknown): string {
  return globalThis
    .btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function assertion(overrides: Record<string, unknown> = {}): string {
  const header = encodeSegment({ alg: 'RS256', kid: 'signing-key-1' });
  const payload = encodeSegment({
    sub: 'reviewer-subject',
    email: 'reviewer@example.com',
    iss: configuration.domain,
    aud: [configuration.aud],
    exp: Math.floor(now / 1000) + 300,
    nbf: Math.floor(now / 1000) - 30,
    ...overrides,
  });
  return `${header}.${payload}.c2lnbmF0dXJl`;
}

function dependencies(signatureValid = true) {
  const fetchImplementation = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          keys: [
            {
              kid: 'signing-key-1',
              kty: 'RSA',
              alg: 'RS256',
              n: 'AQAB',
              e: 'AQAB',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const importKey = vi.fn(async () => ({ type: 'public' }) as unknown as CryptoKey);
  const verify = vi.fn(async () => signatureValid);

  return {
    dependencies: {
      fetch: fetchImplementation as typeof globalThis.fetch,
      crypto: { subtle: { importKey, verify } as unknown as SubtleCrypto },
      now: () => now,
    },
    fetchImplementation,
    importKey,
    verify,
  };
}

describe('Cloudflare Access assertion verification', () => {
  it('verifies signature and claims before returning an administration identity', async () => {
    const runtime = dependencies();
    const request = new Request('https://cryptopaymap.example/admin', {
      headers: { 'Cf-Access-Jwt-Assertion': assertion() },
    });

    await expect(
      verifyAdminAccessRequest(request, configuration, runtime.dependencies),
    ).resolves.toEqual({
      actorId: 'cloudflare-access:reviewer-subject',
      actorType: 'human',
      subject: 'reviewer-subject',
      email: 'reviewer@example.com',
    });

    expect(runtime.fetchImplementation).toHaveBeenCalledWith(
      new URL('/cdn-cgi/access/certs', configuration.domain),
      { headers: { Accept: 'application/json' } },
    );
    expect(runtime.importKey).toHaveBeenCalledOnce();
    expect(runtime.verify).toHaveBeenCalledOnce();
  });

  it('rejects a request without an Access assertion before fetching signing keys', async () => {
    const runtime = dependencies();

    await expect(
      verifyAdminAccessRequest(
        new Request('https://cryptopaymap.example/admin'),
        configuration,
        runtime.dependencies,
      ),
    ).rejects.toThrow('missing');
    expect(runtime.fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects an oversized assertion before parsing or fetching signing keys', async () => {
    const runtime = dependencies();
    const request = new Request('https://cryptopaymap.example/admin', {
      headers: { 'Cf-Access-Jwt-Assertion': `a.${'b'.repeat(16_384)}.c` },
    });

    await expect(
      verifyAdminAccessRequest(request, configuration, runtime.dependencies),
    ).rejects.toThrow('size');
    expect(runtime.fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects a verified token for another application audience', async () => {
    const runtime = dependencies();
    const request = new Request('https://cryptopaymap.example/admin', {
      headers: {
        'Cf-Access-Jwt-Assertion': assertion({ aud: ['b'.repeat(64)] }),
      },
    });

    await expect(
      verifyAdminAccessRequest(request, configuration, runtime.dependencies),
    ).rejects.toThrow('audience');
  });

  it('rejects a verified token from another issuer', async () => {
    const runtime = dependencies();
    const request = new Request('https://cryptopaymap.example/admin', {
      headers: {
        'Cf-Access-Jwt-Assertion': assertion({
          iss: 'https://another-team.cloudflareaccess.com',
        }),
      },
    });

    await expect(
      verifyAdminAccessRequest(request, configuration, runtime.dependencies),
    ).rejects.toThrow('issuer');
  });

  it('rejects expired and not-yet-valid assertions', async () => {
    const expiredRuntime = dependencies();
    const expiredRequest = new Request('https://cryptopaymap.example/admin', {
      headers: {
        'Cf-Access-Jwt-Assertion': assertion({ exp: Math.floor(now / 1000) }),
      },
    });
    await expect(
      verifyAdminAccessRequest(expiredRequest, configuration, expiredRuntime.dependencies),
    ).rejects.toThrow('expired');

    const futureRuntime = dependencies();
    const futureRequest = new Request('https://cryptopaymap.example/admin', {
      headers: {
        'Cf-Access-Jwt-Assertion': assertion({ nbf: Math.floor(now / 1000) + 60 }),
      },
    });
    await expect(
      verifyAdminAccessRequest(futureRequest, configuration, futureRuntime.dependencies),
    ).rejects.toThrow('not yet valid');
  });

  it('rejects an assertion when cryptographic verification fails', async () => {
    const runtime = dependencies(false);
    const request = new Request('https://cryptopaymap.example/admin', {
      headers: { 'Cf-Access-Jwt-Assertion': assertion() },
    });

    await expect(
      verifyAdminAccessRequest(request, configuration, runtime.dependencies),
    ).rejects.toThrow('signature');
  });
});
