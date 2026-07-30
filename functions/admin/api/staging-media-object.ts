import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import type { StagingMediaDurableObjectNamespace } from '../../../src/admin/media-review/durable-object-storage';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';

interface StagingMediaObjectEnvironment {
  CPM_ADMIN_AUTH_MODE?: string;
  CPM_STAGING_MEDIA_OBJECTS?: StagingMediaDurableObjectNamespace;
}

interface StagingMediaObjectPagesContext {
  request: Request;
  env: StagingMediaObjectEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

const durableObjectName = 'ops-p6-001h-configured-media';
const expectedActorId = 'cryptopaymap-service:staging-service:reviewer';
const allowedKey = /^media\/(private|public)\/ops-p6-001h\/[A-Za-z0-9._/-]{1,300}$/;

function textResponse(status: number, message: string): Response {
  return withAdminSecurityHeaders(
    new Response(message, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  );
}

function internalUrl(scope: 'private' | 'public', key: string): string {
  const url = new URL('https://staging-media.internal/staging-media/object');
  url.searchParams.set('scope', scope);
  url.searchParams.set('key', key);
  return url.toString();
}

function requestLocation(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');
  const key = url.searchParams.get('key');
  const match = key?.match(allowedKey);
  if (
    (scope !== 'private' && scope !== 'public') ||
    key === null ||
    match === null ||
    match === undefined ||
    match[1] !== scope
  ) {
    return null;
  }
  return { scope, key } as const;
}

async function handleStagingMediaObject(
  context: StagingMediaObjectPagesContext,
): Promise<Response> {
  if (
    context.env.CPM_ADMIN_AUTH_MODE !== 'derived_staging_service' ||
    context.env.CPM_STAGING_MEDIA_OBJECTS === undefined
  ) {
    return textResponse(404, 'Not found.');
  }

  try {
    const identity = readProtectedAdminIdentity(context.data.adminIdentity);
    if (identity.actorId !== expectedActorId) return textResponse(403, 'Access denied.');
  } catch {
    return textResponse(403, 'Access denied.');
  }

  const location = requestLocation(context.request);
  if (location === null) return textResponse(400, 'Invalid Media object location.');
  if (context.request.method === 'PUT' && location.scope !== 'private') {
    return textResponse(403, 'Public Media writes require a durable Media decision.');
  }
  if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(context.request.method)) {
    return textResponse(405, 'Method not allowed.');
  }

  const namespace = context.env.CPM_STAGING_MEDIA_OBJECTS;
  const stub = namespace.get(namespace.idFromName(durableObjectName));
  const headers = new Headers();
  if (context.request.method === 'PUT') {
    const contentType = context.request.headers.get('content-type');
    const contentHash = context.request.headers.get('x-cpm-content-hash');
    if (contentType === null || contentHash === null) {
      return textResponse(400, 'Media object metadata is required.');
    }
    headers.set('Content-Type', contentType);
    headers.set('X-CPM-Content-Hash', contentHash);
  }

  const response = await stub.fetch(
    new Request(internalUrl(location.scope, location.key), {
      method: context.request.method,
      headers,
      body:
        context.request.method === 'PUT'
          ? await context.request.arrayBuffer()
          : undefined,
    }),
  );
  return withAdminSecurityHeaders(response);
}

export const onRequestGet = handleStagingMediaObject;
export const onRequestHead = handleStagingMediaObject;
export const onRequestPut = handleStagingMediaObject;
export const onRequestDelete = handleStagingMediaObject;
