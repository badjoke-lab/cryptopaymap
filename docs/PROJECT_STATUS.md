# CryptoPayMap project status

**Last verified:** 2026-07-04

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-11 — Export controls and release workflow

## Active work

- P3-11C — protected export queue, detail, and decision APIs
- Branch: `work/p311c`
- Pull request: not opened yet

## Latest completed work

- Phase 2 completed through pull request #40
- P3-01 through P3-06 completed through pull request #47
- P3-07 completed through pull request #58
- P3-08 completed through pull request #63
- P3-09 completed through pull request #67
- P3-10 completed through pull request #74
- P3-11A completed through pull request #75
- P3-11B completed through pull request #76

## P3-11C in progress

- private R2 candidate bundle source
- server-side candidate revalidation
- bounded durable release history queue
- exact current-snapshot detail and artifact summaries
- protected queue and detail GET endpoints
- protected idempotent approve and reject POST endpoint
- fail-closed actor, database, and candidate binding validation
- source, workspace, API, and runtime tests

## Next

1. Complete P3-11C validation and merge its pull request.
2. Add `/admin/exports` reviewer UI.
3. Add controlled publication and active release pointer switching.

## Blocked

No repository blocker. Live R2 candidate generation, database, deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
