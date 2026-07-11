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

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
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
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
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
