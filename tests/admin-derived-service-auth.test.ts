import { describe, expect, it } from 'vitest';
import type { DerivedStagingServiceConfiguration } from '../src/admin/access/config';
import { verifyAdminAccessRequest } from '../src/admin/access/verification';

const now = 1_800_000_000_000;
const reviewerKey = new Uint8Array(32).fill(17);
const publisherKey = new Uint8Array(32).fill(23);

function base64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

const configuration: DerivedStagingServiceConfiguration = {
  mode: 'derived_staging_service',
  reviewerKeyBase64Url: base64Url(reviewerKey),
  publisherKeyBase64Url: base64Url(publisherKey),
  maximumClockSkewSeconds: 90,
};

async function signedRequest(
  role: 'reviewer' | 'publisher',
  path: string,
  options: { method?: string; timestamp?: number; key?: Uint8Array; forgedEmail?: boolean } = {},
): Promise<Request> {
  const method = options.method ?? 'GET';
  const timestamp = String(options.timestamp ?? Math.floor(now / 1000));
  const keyBytes = options.key ?? (role === 'reviewer' ? reviewerKey : publisherKey);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const message = ['cryptopaymap-staging-admin-v1', role, timestamp, method, path].join('\n');
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)),
  );
  const headers = new Headers({
    'X-CPM-Admin-Role': role,
    'X-CPM-Admin-Timestamp': timestamp,
    'X-CPM-Admin-Signature': base64Url(signature),
  });
  if (options.forgedEmail) {
    headers.set('Cf-Access-Authenticated-User-Email', 'forged@example.invalid');
  }
  return new Request(`https://cryptopaymap.example${path}`, { method, headers });
}

describe('derived staging service authentication', () => {
  it('returns distinct bounded reviewer and publisher identities', async () => {
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('reviewer', '/admin/api/dashboard'),
        configuration,
        {
          now: () => now,
        },
      ),
    ).resolves.toEqual({
      actorId: 'cryptopaymap-service:staging-service:reviewer',
      actorType: 'system',
      subject: 'staging-service:reviewer',
      email: null,
    });
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('publisher', '/admin/api/export-activate', { method: 'POST' }),
        configuration,
        { now: () => now },
      ),
    ).resolves.toEqual({
      actorId: 'cryptopaymap-service:staging-service:publisher',
      actorType: 'system',
      subject: 'staging-service:publisher',
      email: null,
    });
  });

  it('rejects a cross-role signature and a stale request', async () => {
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('publisher', '/admin/api/export-activate', {
          method: 'POST',
          key: reviewerKey,
        }),
        configuration,
        { now: () => now },
      ),
    ).rejects.toThrow('signature');
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('reviewer', '/admin/api/dashboard', {
          timestamp: Math.floor(now / 1000) - 91,
        }),
        configuration,
        { now: () => now },
      ),
    ).rejects.toThrow('timestamp');
  });

  it('rejects forged email headers even when the service signature is valid', async () => {
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('reviewer', '/admin/api/dashboard', { forgedEmail: true }),
        configuration,
        { now: () => now },
      ),
    ).rejects.toThrow('email');
  });
});
