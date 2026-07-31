import {
  consumeFixedWindowRateLimit,
  durableObjectRateLimitOptionsSchema,
} from '../../src/submissions/durable-object-rate-limit-contract';

type SqlBinding = ArrayBuffer | string | number | null;

interface SqlCursor<Row> {
  toArray(): Row[];
}

interface SqlStorage {
  exec<Row>(query: string, ...bindings: SqlBinding[]): SqlCursor<Row>;
}

interface SubmissionRateLimitDurableObjectState {
  storage: { sql: SqlStorage };
}

interface StoredFixedWindowState {
  windowStartedAtMs: number;
  requestCount: number;
}

interface StoredStagingMediaObject {
  objectKey: string;
  storageScope: 'private' | 'public';
  contentType: string;
  contentHash: string;
  byteSize: number;
  width: number;
  height: number;
  body: ArrayBuffer;
  createdAtMs: number;
}

const stagingMediaAssetId = '94000000-0000-4000-8000-000000000001';
const stagingMediaKeyPattern = new RegExp(
  `^media/(private|public)/${stagingMediaAssetId}/(?:original-[a-f0-9]{64}\\.png|[a-f0-9-]{36}-[a-f0-9]{64}\\.(?:jpg|webp))$`,
);
const stagingMediaHashPattern = /^[a-f0-9]{64}$/;
const maximumStagingMediaBytes = 1_000_000;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: ArrayBuffer): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', value));
}

function inspectPng(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  if (new TextDecoder().decode(bytes.slice(12, 16)) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

function inspectWebp(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 30 ||
    new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' ||
    new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP' ||
    new TextDecoder().decode(bytes.slice(12, 16)) !== 'VP8 ' ||
    bytes[23] !== 0x9d ||
    bytes[24] !== 0x01 ||
    bytes[25] !== 0x2a
  ) {
    return null;
  }
  const width = ((bytes[27] ?? 0) << 8 | (bytes[26] ?? 0)) & 0x3fff;
  const height = ((bytes[29] ?? 0) << 8 | (bytes[28] ?? 0)) & 0x3fff;
  return width > 0 && height > 0 ? { width, height } : null;
}

function inspectJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += length;
  }
  return null;
}

function inspectImage(
  body: ArrayBuffer,
  contentType: string,
): { width: number; height: number } | null {
  const bytes = new Uint8Array(body);
  if (contentType === 'image/png') return inspectPng(bytes);
  if (contentType === 'image/webp') return inspectWebp(bytes);
  if (contentType === 'image/jpeg') return inspectJpeg(bytes);
  return null;
}

function mediaLocation(request: Request): {
  scope: 'private' | 'public';
  objectKey: string;
} | null {
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');
  const objectKey = url.searchParams.get('key');
  const match = objectKey?.match(stagingMediaKeyPattern);
  if (
    (scope !== 'private' && scope !== 'public') ||
    !match ||
    match[1] !== scope ||
    objectKey === null
  ) {
    return null;
  }
  return { scope, objectKey };
}

function objectHeaders(object: StoredStagingMediaObject): Headers {
  return new Headers({
    'Cache-Control': object.storageScope === 'public' ? 'public, max-age=60' : 'private, no-store',
    'Content-Length': String(object.byteSize),
    'Content-Type': object.contentType,
    ETag: `"${object.contentHash}"`,
    'X-CPM-Content-Hash': object.contentHash,
    'X-CPM-Image-Height': String(object.height),
    'X-CPM-Image-Width': String(object.width),
    'X-Content-Type-Options': 'nosniff',
  });
}

export class SubmissionRateLimitBucket {
  private readonly sql: SqlStorage;

  constructor(state: SubmissionRateLimitDurableObjectState) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS fixed_window_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        window_started_at_ms INTEGER NOT NULL,
        request_count INTEGER NOT NULL CHECK (request_count >= 1)
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS staging_media_objects (
        object_key TEXT PRIMARY KEY,
        storage_scope TEXT NOT NULL CHECK (storage_scope IN ('private', 'public')),
        content_type TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 1000000),
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        body BLOB NOT NULL,
        created_at_ms INTEGER NOT NULL
      )
    `);
  }

  private readMediaObject(scope: 'private' | 'public', objectKey: string) {
    return (
      this.sql
        .exec<StoredStagingMediaObject>(
          `
            SELECT
              object_key AS objectKey,
              storage_scope AS storageScope,
              content_type AS contentType,
              content_hash AS contentHash,
              byte_size AS byteSize,
              width,
              height,
              body,
              created_at_ms AS createdAtMs
            FROM staging_media_objects
            WHERE object_key = ? AND storage_scope = ?
          `,
          objectKey,
          scope,
        )
        .toArray()[0] ?? null
    );
  }

  private async handleStagingMedia(request: Request): Promise<Response> {
    const location = mediaLocation(request);
    if (location === null) return jsonResponse(400, { error: 'invalid_media_location' });

    if (request.method === 'PUT') {
      const contentType = request.headers.get('content-type')?.split(';')[0] ?? '';
      const contentHash = request.headers.get('x-cpm-content-hash') ?? '';
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) ||
        !stagingMediaHashPattern.test(contentHash) ||
        (location.scope === 'public' && !['image/jpeg', 'image/webp'].includes(contentType))
      ) {
        return jsonResponse(400, { error: 'invalid_media_metadata' });
      }
      const body = await request.arrayBuffer();
      if (body.byteLength < 1 || body.byteLength > maximumStagingMediaBytes) {
        return jsonResponse(413, { error: 'invalid_media_size' });
      }
      if ((await sha256(body)) !== contentHash) {
        return jsonResponse(409, { error: 'media_hash_mismatch' });
      }
      const dimensions = inspectImage(body, contentType);
      if (dimensions === null) return jsonResponse(415, { error: 'invalid_media_bytes' });
      this.sql.exec(
        `
          INSERT INTO staging_media_objects (
            object_key,
            storage_scope,
            content_type,
            content_hash,
            byte_size,
            width,
            height,
            body,
            created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(object_key) DO UPDATE SET
            storage_scope = excluded.storage_scope,
            content_type = excluded.content_type,
            content_hash = excluded.content_hash,
            byte_size = excluded.byte_size,
            width = excluded.width,
            height = excluded.height,
            body = excluded.body,
            created_at_ms = excluded.created_at_ms
        `,
        location.objectKey,
        location.scope,
        contentType,
        contentHash,
        body.byteLength,
        dimensions.width,
        dimensions.height,
        body,
        Date.now(),
      );
      return jsonResponse(201, {
        stored: true,
        scope: location.scope,
        byteSize: body.byteLength,
        contentHash,
        width: dimensions.width,
        height: dimensions.height,
      });
    }

    if (request.method === 'DELETE') {
      this.sql.exec(
        'DELETE FROM staging_media_objects WHERE object_key = ? AND storage_scope = ?',
        location.objectKey,
        location.scope,
      );
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonResponse(405, { error: 'method_not_allowed' });
    }
    const object = this.readMediaObject(location.scope, location.objectKey);
    if (object === null) return jsonResponse(404, { error: 'media_object_not_found' });
    return new Response(request.method === 'HEAD' ? null : object.body, {
      status: 200,
      headers: objectHeaders(object),
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/staging-media/object') {
      return this.handleStagingMedia(request);
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(200, { status: 'ready' });
    }
    if (request.method !== 'POST' || url.pathname !== '/consume') {
      return jsonResponse(404, { error: 'not_found' });
    }

    let rawOptions: unknown;
    try {
      rawOptions = await request.json();
    } catch {
      return jsonResponse(400, { error: 'invalid_request' });
    }

    const parsedOptions = durableObjectRateLimitOptionsSchema.safeParse(rawOptions);
    if (!parsedOptions.success) {
      return jsonResponse(400, { error: 'invalid_request' });
    }

    try {
      const rows = this.sql
        .exec<StoredFixedWindowState>(`
          SELECT
            window_started_at_ms AS windowStartedAtMs,
            request_count AS requestCount
          FROM fixed_window_state
          WHERE id = 1
        `)
        .toArray();
      const current = rows[0] ?? null;
      const transition = consumeFixedWindowRateLimit(current, Date.now(), parsedOptions.data);

      this.sql.exec(
        `
          INSERT INTO fixed_window_state (id, window_started_at_ms, request_count)
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            window_started_at_ms = excluded.window_started_at_ms,
            request_count = excluded.request_count
        `,
        transition.state.windowStartedAtMs,
        transition.state.requestCount,
      );

      return jsonResponse(200, transition.response);
    } catch {
      return jsonResponse(503, { error: 'rate_limit_unavailable' });
    }
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
};
