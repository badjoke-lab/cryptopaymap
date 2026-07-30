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
  body: ArrayBuffer;
  createdAtMs: number;
}

const stagingMediaKeyPattern = /^media\/(private|public)\/ops-p6-001h\/[A-Za-z0-9._/-]{1,300}$/;
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
  const headers = new Headers({
    'Cache-Control': object.storageScope === 'public' ? 'public, max-age=60' : 'private, no-store',
    'Content-Length': String(object.byteSize),
    'Content-Type': object.contentType,
    ETag: `"${object.contentHash}"`,
    'X-CPM-Content-Hash': object.contentHash,
    'X-Content-Type-Options': 'nosniff',
  });
  return headers;
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
      this.sql.exec(
        `
          INSERT INTO staging_media_objects (
            object_key,
            storage_scope,
            content_type,
            content_hash,
            byte_size,
            body,
            created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(object_key) DO UPDATE SET
            storage_scope = excluded.storage_scope,
            content_type = excluded.content_type,
            content_hash = excluded.content_hash,
            byte_size = excluded.byte_size,
            body = excluded.body,
            created_at_ms = excluded.created_at_ms
        `,
        location.objectKey,
        location.scope,
        contentType,
        contentHash,
        body.byteLength,
        body,
        Date.now(),
      );
      return jsonResponse(201, {
        stored: true,
        scope: location.scope,
        byteSize: body.byteLength,
        contentHash,
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
