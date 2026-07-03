import { describe, expect, it, vi } from 'vitest';
import {
  createMediaFileGetHandler,
  type MediaFileLoadResult,
} from '../functions/admin/api/media-file';

const identity = {
  actorId: 'cloudflare-access:media-reviewer',
  actorType: 'human' as const,
  subject: 'media-reviewer',
  email: 'reviewer@example.test',
};
const fileId = '40000000-0000-4000-8000-000000000001';

function context(overrides: { identity?: unknown; actorIds?: string; id?: string | null } = {}) {
  const id = overrides.id === undefined ? fileId : overrides.id;
  const query = id === null ? '' : `?fileId=${id}`;
  return {
    request: new Request(`https://example.test/admin/api/media-file${query}`),
    env: {
      CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS: overrides.actorIds ?? JSON.stringify([identity.actorId]),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected Media file preview endpoint', () => {
  it('returns verified bytes with private no-store headers', async () => {
    const loadFile = vi.fn(
      async (): Promise<MediaFileLoadResult> => ({
        status: 'ready',
        body: new Uint8Array([1, 2, 3]),
        mimeType: 'image/webp',
        byteSize: 3,
      }),
    );
    const response = await createMediaFileGetHandler({ loadFile })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('content-length')).toBe('3');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(loadFile).toHaveBeenCalledWith(fileId, expect.any(Object));
  });

  it('rejects an invalid identifier before loading storage', async () => {
    const loadFile = vi.fn(async (): Promise<MediaFileLoadResult> => ({ status: 'not_found' }));
    const response = await createMediaFileGetHandler({ loadFile })(context({ id: 'invalid' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'media_file_invalid_id' });
    expect(loadFile).not.toHaveBeenCalled();
  });

  it('denies missing identity before loading private bytes', async () => {
    const loadFile = vi.fn(async (): Promise<MediaFileLoadResult> => ({ status: 'not_found' }));
    const response = await createMediaFileGetHandler({ loadFile })(context({ identity: null }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'media_file_denied' });
    expect(loadFile).not.toHaveBeenCalled();
  });

  it('maps metadata conflict without exposing a storage key', async () => {
    const loadFile = vi.fn(async (): Promise<MediaFileLoadResult> => ({ status: 'conflict' }));
    const response = await createMediaFileGetHandler({ loadFile })(context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'media_file_conflict' });
  });
});
