# CryptoPayMap project status

**Last verified:** 2026-07-04

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-11 — Export controls and release workflow

## Active work

- P3-11E — controlled export activation and active release pointer
- Branch: `work/p311e`
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
- P3-11C completed through pull request #77
- P3-11D completed through pull request #78

## P3-11E in progress

- isolated `export:publish` capability and actor allowlist
- durable approved-decision lookup
- complete private candidate revalidation
- deterministic immutable release object keys
- exact object metadata verification
- conditional ETag compare-and-set pointer switch
- protected activation POST endpoint
- contract, R2, authorization, API, and runtime tests

## Next

1. Complete P3-11E validation and merge its pull request.
2. Add durable activation history and request-level replay records.
3. Add rollback operations and complete the P3-11 integration audit.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
