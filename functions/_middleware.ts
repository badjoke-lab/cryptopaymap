import { applyPagesResponseHeaders } from '../src/http/pages-response-headers';

interface PagesMiddlewareContext {
  request: Request;
  next(): Promise<Response>;
}

const canonicalHost = 'cryptopaymap.com';
const redirectHost = 'www.cryptopaymap.com';

export async function onRequest(context: PagesMiddlewareContext): Promise<Response> {
  const url = new URL(context.request.url);
  if (url.hostname.toLowerCase() === redirectHost) {
    url.protocol = 'https:';
    url.hostname = canonicalHost;
    url.port = '';
    const response = new Response(null, {
      status: 308,
      headers: { location: url.toString() },
    });
    return applyPagesResponseHeaders(context.request, response);
  }
  return applyPagesResponseHeaders(context.request, await context.next());
}
