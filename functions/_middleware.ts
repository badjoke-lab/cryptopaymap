import { applyPagesResponseHeaders } from '../src/http/pages-response-headers';

interface PagesMiddlewareContext {
  request: Request;
  next(): Promise<Response>;
}

export async function onRequest(context: PagesMiddlewareContext): Promise<Response> {
  return applyPagesResponseHeaders(context.request, await context.next());
}
