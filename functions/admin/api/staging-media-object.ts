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
const stagingMediaAssetId = '94000000-0000-4000-8000-000000000001';
const allowedKey = new RegExp(
  `^media/(private|public)/${stagingMediaAssetId}/(?:original-[a-f0-9]{64}\\.png|[a-f0-9-]{36}-[a-f0-9]{64}\\.(?:jpg|webp))$`,
);

function textResponse(status: number, message: string): Response {
  return withAdminSecurityHeaders(
    new Response(message, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  );
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

function internalUrl(scope: 'private' | 'public', key: string): string {
  const url = new URL('https://staging-media.internal/staging-media/object');
  url.searchParams.set('scope', scope);
  url.searchParams.set('key', key);
  return url.toString();
}

function validatedKey(value: unknown, scope: 'private' | 'public'): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(allowedKey);
  return match?.[1] === scope ? value : null;
}

function requestLocation(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');
  const key = url.searchParams.get('key');
  if (scope !== 'private' && scope !== 'public') return null;
  const validated = validatedKey(key, scope);
  return validated === null ? null : { scope, key: validated };
}

async function verifyPartialFailureCleanup(
  request: Request,
  namespace: StagingMediaDurableObjectNamespace,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'invalid_probe' });
  }
  const record = body as Record<string, unknown>;
  if (record.action !== 'verify_partial_failure_cleanup') {
    return jsonResponse(400, { error: 'invalid_probe' });
  }
  const sourceKey = validatedKey(record.sourceKey, 'private');
  const destinationKey = validatedKey(record.destinationKey, 'public');
  if (sourceKey === null || destinationKey === null) {
    return jsonResponse(400, { error: 'invalid_probe_keys' });
  }

  const stub = namespace.get(namespace.idFromName(durableObjectName));
  const source = await stub.fetch(new Request(internalUrl('private', sourceKey), { method: 'GET' }));
  if (!source.ok) return jsonResponse(409, { error: 'probe_source_missing' });
  const contentType = source.headers.get('content-type');
  const contentHash = source.headers.get('x-cpm-content-hash');
  if (contentType === null || contentHash === null) {
    return jsonResponse(409, { error: 'probe_source_invalid' });
  }

  const published = await stub.fetch(
    new Request(internalUrl('public', destinationKey), {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'X-CPM-Content-Hash': contentHash,
      },
      body: await source.arrayBuffer(),
    }),
  );
  if (!published.ok) return jsonResponse(503, { error: 'probe_publish_failed' });

  const cleanup = await stub.fetch(
    new Request(internalUrl('public', destinationKey), { method: 'DELETE' }),
  );
  const afterCleanup = await stub.fetch(
    new Request(internalUrl('public', destinationKey), { method: 'HEAD' }),
  );
  return jsonResponse(cleanup.ok && afterCleanup.status === 404 ? 200 : 503, {
    injectedFailureObserved: true,
    firstPublishSucceeded: true,
    cleanupSucceeded: cleanup.ok,
    externallyUnavailableAfterCleanup: afterCleanup.status === 404,
  });
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

  if (context.request.method === 'POST') {
    return verifyPartialFailureCleanup(context.request, context.env.CPM_STAGING_MEDIA_OBJECTS);
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
export const onRequestPost = handleStagingMediaObject;
export const onRequestDelete = handleStagingMediaObject;
