import { describe, expect, it } from 'vitest';
import {
  readTrustedCloudflareEdgeIdentity,
  SubmissionEdgeIdentityError,
} from '../src/submissions/cloudflare-edge-identity';

function requestWithHeaders(headers: HeadersInit): Request {
  return new Request('https://example.test/api/suggest', { headers });
}

describe('P5-02L trusted Cloudflare edge identity extraction', () => {
  it('reads a canonical IPv4 identity from CF-Connecting-IP', () => {
    expect(
      readTrustedCloudflareEdgeIdentity(requestWithHeaders({ 'CF-Connecting-IP': '203.0.113.42' })),
    ).toBe('203.0.113.42');
  });

  it('normalizes a valid IPv6 identity', () => {
    expect(
      readTrustedCloudflareEdgeIdentity(
        requestWithHeaders({ 'CF-Connecting-IP': '2001:0db8:0:0:0:0:0:1' }),
      ),
    ).toBe('2001:db8::1');
  });

  it('accepts compressed IPv6', () => {
    expect(
      readTrustedCloudflareEdgeIdentity(requestWithHeaders({ 'CF-Connecting-IP': '2001:db8::2' })),
    ).toBe('2001:db8::2');
  });

  it('does not fall back to X-Forwarded-For', () => {
    expect(() =>
      readTrustedCloudflareEdgeIdentity(requestWithHeaders({ 'X-Forwarded-For': '203.0.113.42' })),
    ).toThrow(SubmissionEdgeIdentityError);
  });

  it.each([
    ['missing header', {}],
    ['empty header', { 'CF-Connecting-IP': '' }],
    ['comma-separated list', { 'CF-Connecting-IP': '203.0.113.1, 203.0.113.2' }],
    ['invalid IPv4 range', { 'CF-Connecting-IP': '203.0.113.999' }],
    ['non-canonical IPv4', { 'CF-Connecting-IP': '203.0.113.042' }],
    ['bracketed IPv6', { 'CF-Connecting-IP': '[2001:db8::1]' }],
    ['IPv6 zone identifier', { 'CF-Connecting-IP': 'fe80::1%eth0' }],
    ['arbitrary text', { 'CF-Connecting-IP': 'not-an-ip' }],
  ])('fails closed for %s', (_name, headers) => {
    expect(() => readTrustedCloudflareEdgeIdentity(requestWithHeaders(headers))).toThrow(
      SubmissionEdgeIdentityError,
    );
  });

  it('returns only the edge identity and does not inspect unrelated headers', () => {
    const request = requestWithHeaders({
      'CF-Connecting-IP': '198.51.100.7',
      'X-Forwarded-For': '192.0.2.1, 192.0.2.2',
      'X-Real-IP': '192.0.2.9',
    });
    expect(readTrustedCloudflareEdgeIdentity(request)).toBe('198.51.100.7');
  });
});
