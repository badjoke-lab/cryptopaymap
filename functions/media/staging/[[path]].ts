import type { StagingMediaDurableObjectNamespace } from '../../../src/admin/media-review/durable-object-storage';

interface StagingPublicMediaEnvironment {
  CPM_ADMIN_AUTH_MODE?: string;
  CPM_STAGING_MEDIA_OBJECTS?: StagingMediaDurableObjectNamespace;
}

interface StagingPublicMediaPagesContext {
  request: Request;
  env: StagingPublicMediaEnvironment;
  params: Record<string, string | string[]>;
}

const durableObjectName = 'ops-p6-001h-configured-media';
const stagingMediaAssetId = '94000000-0000-4000-8000-000000000001';
const pathPattern = /^[a-f0-9-]{36}-[a-f0-9]{64}\.(?:jpg|webp)$/;

function notFound(): Response {
  return new Response('Not found.', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function parameterPath(value: string | string[] | undefined): string | null {
  const path = Array.isArray(value) ? value.join('/') : value;
  return typeof path === 'string' && pathPattern.test(path) ? path : null;
}

async function handlePublicStagingMedia(
  context: StagingPublicMediaPagesContext,
): Promise<Response> {
  if (
    context.env.CPM_ADMIN_AUTH_MODE !== 'derived_staging_service' ||
    context.env.CPM_STAGING_MEDIA_OBJECTS === undefined ||
    (context.request.method !== 'GET' && context.request.method !== 'HEAD')
  ) {
    return notFound();
  }
  const path = parameterPath(context.params.path);
  if (path === null) return notFound();

  const key = `media/public/${stagingMediaAssetId}/${path}`;
  const url = new URL('https://staging-media.internal/staging-media/object');
  url.searchParams.set('scope', 'public');
  url.searchParams.set('key', key);
  const namespace = context.env.CPM_STAGING_MEDIA_OBJECTS;
  const response = await namespace
    .get(namespace.idFromName(durableObjectName))
    .fetch(new Request(url, { method: context.request.method }));
  if (!response.ok) return notFound();

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=60');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(context.request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers,
  });
}

export const onRequestGet = handlePublicStagingMedia;
export const onRequestHead = handlePublicStagingMedia;
