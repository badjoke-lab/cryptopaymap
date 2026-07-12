import { describe, expect, it } from 'vitest';
import {
  applyPagesResponseHeaders,
  suggestContentSecurityPolicy,
} from '../src/http/pages-response-headers';

function apply(path: string, hostname = 'www.example.test', response?: Response): Response {
  return applyPagesResponseHeaders(
    new Request(`https://${hostname}${path}`),
    response ?? new Response('ok', { status: 200, headers: { 'X-Upstream': 'kept' } }),
  );
}

describe('P5-02Q Pages Function response headers', () => {
  it('attaches the exact Suggest CSP and fail-closed cache/referrer policy', async () => {
    const response = apply('/suggest', 'review.cryptopaymap-staging.pages.dev');

    expect(response.headers.get('Content-Security-Policy')).toBe(
      suggestContentSecurityPolicy,
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(response.headers.get('X-Upstream')).toBe('kept');
    await expect(response.text()).resolves.toBe('ok');
  });

  it('does not attach the Suggest CSP to unrelated public paths', () => {
    const response = apply('/places');

    expect(response.headers.has('Content-Security-Policy')).toBe(false);
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.has('X-Robots-Tag')).toBe(false);
  });

  it('marks every fixed-review response as non-indexable', () => {
    const response = apply('/places', 'cryptopaymap-staging.pages.dev');

    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
  });

  it('preserves the protected Admin cache, referrer, and robots policy', () => {
    const response = apply('/admin/submissions/example');

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
  });

  it.each([
    ['/_astro/app.123.js', 'public, max-age=31556952, immutable'],
    ['/data/places.json', 'public, max-age=300, must-revalidate'],
    ['/manifest.webmanifest', 'public, max-age=300, must-revalidate'],
    ['/icons/icon-192.png', 'public, max-age=86400, must-revalidate'],
  ])('preserves the cache policy for %s', (path, expectedCacheControl) => {
    expect(apply(path).headers.get('Cache-Control')).toBe(expectedCacheControl);
  });

  it('preserves status, status text, and existing response headers', () => {
    const response = apply(
      '/places',
      'www.example.test',
      new Response(null, {
        status: 304,
        statusText: 'Not Modified',
        headers: { ETag: 'example-etag' },
      }),
    );

    expect(response.status).toBe(304);
    expect(response.statusText).toBe('Not Modified');
    expect(response.headers.get('ETag')).toBe('example-etag');
  });
});
