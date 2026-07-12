export const suggestContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const reviewRobotsPolicy = 'noindex, nofollow, noarchive';

function isFixedReviewHostname(hostname: string): boolean {
  return (
    hostname === 'cryptopaymap-staging.pages.dev' ||
    hostname.endsWith('.cryptopaymap-staging.pages.dev')
  );
}

function isExactPath(pathname: string, path: string): boolean {
  return pathname === path || pathname === `${path}/`;
}

function setIfMissing(headers: Headers, name: string, value: string): void {
  if (!headers.has(name)) headers.set(name, value);
}

function applyCommonSecurityHeaders(headers: Headers): void {
  setIfMissing(headers, 'X-Content-Type-Options', 'nosniff');
  setIfMissing(headers, 'X-Frame-Options', 'DENY');
  setIfMissing(headers, 'Referrer-Policy', 'strict-origin-when-cross-origin');
  setIfMissing(
    headers,
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()',
  );
}

function applyPathSpecificHeaders(requestUrl: URL, headers: Headers): void {
  const { pathname } = requestUrl;

  if (isFixedReviewHostname(requestUrl.hostname)) {
    headers.set('X-Robots-Tag', reviewRobotsPolicy);
  }

  if (isExactPath(pathname, '/suggest')) {
    headers.set('Content-Security-Policy', suggestContentSecurityPolicy);
    headers.set('Cache-Control', 'no-store');
    headers.set('Referrer-Policy', 'no-referrer');
    return;
  }

  if (isExactPath(pathname, '/admin') || pathname.startsWith('/admin/')) {
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Robots-Tag', reviewRobotsPolicy);
    return;
  }

  if (pathname.startsWith('/_astro/')) {
    headers.set('Cache-Control', 'public, max-age=31556952, immutable');
    return;
  }

  if (pathname.startsWith('/data/')) {
    headers.set('Cache-Control', 'public, max-age=300, must-revalidate');
    return;
  }

  if (isExactPath(pathname, '/manifest.webmanifest')) {
    headers.set('Cache-Control', 'public, max-age=300, must-revalidate');
    return;
  }

  if (pathname.startsWith('/icons/')) {
    headers.set('Cache-Control', 'public, max-age=86400, must-revalidate');
  }
}

export function applyPagesResponseHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  applyCommonSecurityHeaders(headers);
  applyPathSpecificHeaders(new URL(request.url), headers);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
