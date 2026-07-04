# CryptoPayMap project status

**Last verified:** 2026-07-04

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-12 — Audit history and Phase 3 integration audit

## Active work

- P3-12C — durable audit history source adapters
- Branch: `work/audit-history-sources`
- Pull request: pending

## Latest completed work

- Phase 2 completed through pull request #40
- P3-01 through P3-06 completed through pull request #47
- P3-07 completed through pull request #58
- P3-08 completed through pull request #63
- P3-09 completed through pull request #67
- P3-10 completed through pull request #74
- P3-11 completed through pull request #87
- P3-12A normalized audit history read contract completed through pull request #88
- P3-12B bounded audit history aggregation completed through pull request #89

## P3-12C in progress

- Drizzle-backed source adapters over existing durable Phase 3 tables
- source-side actor, time-range, cursor, and target filter pushdown
- deterministic per-source ordering compatible with the global audit cursor
- bounded source reads with one-row pagination lookahead
- explicit exclusion of restore execution from the database source registry until a table exists
- runtime and unit verification

## Next

1. Complete P3-12C validation and merge the pull request.
2. Add protected audit history API and administration surface.
3. Complete the final Phase 3 cross-domain integration audit and hand off to Phase 4.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database migration, restore persistence deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
