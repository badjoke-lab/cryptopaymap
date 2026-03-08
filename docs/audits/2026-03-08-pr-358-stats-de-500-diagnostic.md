# CPM: PR #358 post-merge stats 500 diagnostic (`country=DE`, no-fix)

## Scope / Rule
- Code changes: **none** (diagnostic only)
- Target endpoints:
  - `/api/stats`
  - `/api/stats?country=AQ`
  - `/api/stats?country=DE`
- Debug flag: `CPM_STATS_DEBUG_TIMING=1`

## Execution environment check

```bash
printenv | rg 'DATABASE|PG|CPM_STATS|DATA_SOURCE|NODE_ENV'
# (no output)
```

- `DATABASE_URL` was not present in this container.
- External production endpoint access (`https://cryptopaymap.com`) is blocked in this environment (`CONNECT tunnel failed, response 403`).

## Commands actually run

```bash
# A) Forced DB path to capture failure diagnostics (500 reproduction)
PORT=3020 DATA_SOURCE=db CPM_STATS_DEBUG_TIMING=1 DATABASE_URL='postgresql://invalid:invalid@127.0.0.1:1/invalid' npm run dev
curl -sS -D - 'http://127.0.0.1:3020/api/stats'
curl -sS -D - 'http://127.0.0.1:3020/api/stats?country=AQ'
curl -sS -D - 'http://127.0.0.1:3020/api/stats?country=DE'

# B) Default mode for AQ/DE comparison baseline
PORT=3021 CPM_STATS_DEBUG_TIMING=1 npm run dev
curl -sS -D - 'http://127.0.0.1:3021/api/stats'
curl -sS -D - 'http://127.0.0.1:3021/api/stats?country=AQ'
curl -sS -D - 'http://127.0.0.1:3021/api/stats?country=DE'
```

## Raw response capture

### A) Forced DB mode (`DATA_SOURCE=db`)
All three endpoints returned `500`:

- `/api/stats`
```json
{"ok":false,"error":"stats_unavailable","reason":"db_error","code":"unknown","message":"stats snapshot unavailable","request_id":"7cf7a520-16f2-4542-bb22-15e544fc6a40"}
```

- `/api/stats?country=AQ`
```json
{"ok":false,"error":"stats_unavailable","reason":"db_error","code":"unknown","message":"stats snapshot unavailable","request_id":"d4ee5211-071c-4907-9eb0-842804d61863"}
```

- `/api/stats?country=DE`
```json
{"ok":false,"error":"stats_unavailable","reason":"db_error","code":"unknown","message":"stats snapshot unavailable","request_id":"5175ebf3-dc38-4610-af2a-2105a1a63e21"}
```

### B) Default mode
All three endpoints returned `200` with `x-cpm-data-source: json`.

## Raw diagnostic log (DE 500 event)

Server log at the DE request timing:

```text
[stats] failed to load stats snapshot {
  requestId: '5175ebf3-dc38-4610-af2a-2105a1a63e21',
  code: 'unknown',
  error: 'DB_UNAVAILABLE',
  detail: DbUnavailableError: DB_UNAVAILABLE
  ...
  cause: Error: connect ECONNREFUSED 127.0.0.1:1
}

[stats] failure diagnostic {
  route: 'api_stats',
  filters: {
    country: 'DE',
    city: null,
    category: null,
    accepted: null,
    verification: null,
    promoted: null,
    source: null
  },
  allowUnfilteredFastPath: true,
  isUnfilteredRequest: false,
  enteredFastPath: false,
  enteredLiveFallback: true,
  livePathSuccess: false,
  failure_code: 'unknown',
  error_message: 'DB_UNAVAILABLE',
  error_name: 'DbUnavailableError',
  error_stack_head: 'DbUnavailableError: DB_UNAVAILABLE ...',
  timeout_ms: null
}
```

## AQ / unfiltered / DE comparison

### Forced DB mode (500)
- `/api/stats`: `code=unknown`, `error_message=DB_UNAVAILABLE`
- `/api/stats?country=AQ`: `code=unknown`, `error_message=DB_UNAVAILABLE`
- `/api/stats?country=DE`: `code=unknown`, `error_message=DB_UNAVAILABLE`
- No route-specific divergence observed between AQ and DE.

### Default mode (json)
- `/api/stats`, AQ, DE are all served by JSON fallback (`x-cpm-data-source: json`) and all return 200.

## Required final extraction

- failure code: `unknown`
- error.message: `DB_UNAVAILABLE`
- pathState:
  - `enteredFastPath: false` (for filtered DE request)
  - `enteredLiveFallback: true`
  - `livePathSuccess: false`
- timeout: `none` (`timeout_ms: null`)

## Determination (this run)

- In this environment, the direct 500 cause for `country=DE` is **DB connectivity failure** (`ECONNREFUSED` → `DB_UNAVAILABLE`) before any stats aggregation query completes.
- Classification among requested buckets: **unknown** (as returned by `failure_code`), and specifically *connectivity-driven unknown*, not timeout.

## Single next PR proposal (1案)

Create one **diagnostic-only** PR that runs this exact trio (`none`, `AQ`, `DE`) in a **DB-connected CI/job environment** with `CPM_STATS_DEBUG_TIMING=1`, and stores the full `[stats] query timing` + `[stats] failure diagnostic` logs as artifact.

Rationale:
- Current container cannot reach production and has no usable DB endpoint.
- Therefore timeout-vs-shape root cause for real `country=DE` production data cannot be proven from this container alone.
