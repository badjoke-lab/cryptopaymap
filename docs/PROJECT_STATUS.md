# CryptoPayMap project status

**Last verified:** 2026-07-04

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-11 — Export controls and release workflow

## Active work

- P3-11H — export release history database backend and protected API
- Branch: `work/p311h`
- Pull request: pending

## Latest completed work

- Phase 2 completed through pull request #40
- P3-01 through P3-06 completed through pull request #47
- P3-07 completed through pull request #58
- P3-08 completed through pull request #63
- P3-09 completed through pull request #67
- P3-10 completed through pull request #74
- P3-11A completed through pull request #75
- P3-11B completed through pull request #76
- P3-11C completed through pull request #77
- P3-11D completed through pull request #78
- P3-11E completed through pull request #79
- P3-11F completed through pull request #80
- P3-11G read model completed through pull request #81

## P3-11H in progress

- Drizzle export release history backend over durable activation records
- protected `GET /admin/api/export-history` endpoint
- bounded release history query execution
- current snapshot marking from the newest durable activation
- API, backend, and runtime tests

## Next

1. Complete P3-11H validation and merge the pull request.
2. Add rollback operation contract and execution guardrails.
3. Complete the final P3-11 integration audit and P3-12 handoff.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database migration, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
