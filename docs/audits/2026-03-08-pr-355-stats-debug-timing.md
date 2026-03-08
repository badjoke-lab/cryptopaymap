# CPM: PR #355 post-merge stats timing collection (`CPM_STATS_DEBUG_TIMING=1`)

## Scope / Rule check
- Code modification: **none** (stats endpoints only, runtime verification only).
- Target routes:
  - `/api/stats`
  - `/api/stats?country=AQ`
  - `/api/stats?country=DE`

## Executed commands

```bash
# 1) Check environment
python - <<'PY'
import os
print('DATABASE_URL' in os.environ)
PY

# 2) Try public endpoint (for reference)
curl -sS -D /tmp/cpm_headers.txt 'https://cryptopaymap.com/api/stats?country=DE' -o /tmp/cpm_body.json

# 3) Local run with debug timing and default data source
PORT=3010 CPM_STATS_DEBUG_TIMING=1 npm run dev
curl -sS -D - 'http://127.0.0.1:3010/api/stats'
curl -sS -D - 'http://127.0.0.1:3010/api/stats?country=AQ'
curl -sS -D - 'http://127.0.0.1:3010/api/stats?country=DE'

# 4) Force DB mode to verify DB path behavior
PORT=3011 DATA_SOURCE=db CPM_STATS_DEBUG_TIMING=1 DATABASE_URL='postgresql://invalid:invalid@127.0.0.1:1/invalid' npm run dev
curl -sS -D - 'http://127.0.0.1:3011/api/stats'
curl -sS -D - 'http://127.0.0.1:3011/api/stats?country=AQ'
curl -sS -D - 'http://127.0.0.1:3011/api/stats?country=DE'
```

## Raw findings

### Environment constraints
- `DATABASE_URL` is **not set** in this container.
- Outbound call to `https://cryptopaymap.com` failed with `CONNECT tunnel failed, response 403`.

### Local run (default source, `CPM_STATS_DEBUG_TIMING=1`)
- All 3 requests returned `200` with response headers:
  - `x-cpm-data-source: json`
  - `x-cpm-limited: 1`
- Because JSON fallback path was used, **no DB aggregate query timing logs** (`[stats] query timing`) were emitted.

### Local run (forced DB mode)
- All 3 requests returned `500 stats_unavailable` due to DB connection refusal (`ECONNREFUSED 127.0.0.1:1`).
- Failure occurred before query execution timing collection, so **aggregate-level `elapsed_ms` was unavailable**.

## Required extraction table (route/filter/timeout/query)

| Route | Filters | Query label | elapsed_ms | timeout reached | Note |
|---|---|---|---:|---|---|
| `/api/stats` | none | N/A | N/A | N/A | JSON fallback (`x-cpm-data-source: json`) |
| `/api/stats?country=AQ` | `country=AQ` | N/A | N/A | N/A | JSON fallback (`x-cpm-data-source: json`) |
| `/api/stats?country=DE` | `country=DE` | N/A | N/A | N/A | JSON fallback (`x-cpm-data-source: json`) |

## AQ vs DE comparison (query unit)

- In this environment, both AQ and DE were served via JSON fallback (or failed in forced DB mode), so **DB query-unit comparison is not observable**.
- Therefore, this run **cannot identify** which DB query makes `country=DE` time out.

## Interim technical read (from route implementation)

If DB-backed timing can be collected in a DB-enabled environment, compare at least these labels in order:
- `totals`
- `country_ranking`
- `city_ranking`
- `top_chains`
- `top_assets`
- `asset_acceptance_matrix`
- `accepting_any_count`
- `acceptance_coverage`

These are logged as `[stats] query timing` with `{ route, query, elapsed_ms, filters }` when diagnostics are enabled.

## Single next-PR recommendation (1案)

**Recommendation:** Create one PR that adds a **temporary DB-only audit script** (no behavior change) to run `/api/stats` with `{none, AQ, DE}` under `CPM_STATS_DEBUG_TIMING=1` and persist structured timing logs as CI artifact in a DB-connected runner.

Reason:
- Current blocker is not timeout tuning itself but **missing comparable query-level evidence** for DE vs AQ.
- Without per-query elapsed data, choosing “timeout extension” vs “specific query optimization” is guesswork.
