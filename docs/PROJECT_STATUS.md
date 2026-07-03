# CryptoPayMap project status

**Last verified:** 2026-07-04

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-11 — Export controls and release workflow

## Active work

- P3-11B — durable export release decision persistence
- Branch: `work/p311b`
- Pull request: #76

## Latest completed work

- Phase 2 completed through pull request #40
- P3-01 through P3-06 completed through pull request #47
- P3-07 completed through pull request #58
- P3-08 completed through pull request #63
- P3-09 completed through pull request #67
- P3-10 completed through pull request #74
- P3-11A completed through pull request #75

## P3-11B in progress

- durable `export_release_decisions` receipts
- unique request identity
- approved snapshot and dataset-version uniqueness
- database candidate, action, status, metadata, and time-order constraints
- guarded first commit and deterministic replay
- duplicate and constraint conflict classification
- generated Drizzle migration `0018_clumsy_drax.sql` and snapshot
- persistence runtime and unit tests

## Next

1. Complete P3-11B validation and merge pull request #76.
2. Add the protected export queue and release workspace.
3. Add `/admin/exports` reviewer UI and controlled publication operations.

## Blocked

No repository blocker. Live database migration, public deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
