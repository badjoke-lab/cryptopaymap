# CryptoPayMap project status

**Last verified:** 2026-07-04

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-11 — Export controls and release workflow

## Active work

- P3-11J — export release restore execution record boundary
- Branch: `work/p311j`
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
- P3-11G release history read model completed through pull request #81
- P3-11H release history backend and API completed through pull request #82
- P3-11I restore operation contract completed through pull request #83

## P3-11J in progress

- restore pointer inventory schema
- restore pointer switch receipt schema
- restore execution record schema
- inventory fingerprint and request fingerprint
- replay and request conflict behavior
- inventory active pointer guard
- pointer count, pointer key, and target ETag guardrails
- restore execution runtime and unit tests

## Next

1. Complete P3-11J validation and merge the pull request.
2. Add object-store pointer switch execution.
3. Complete the final P3-11 integration audit and P3-12 handoff.

## Blocked

No repository blocker. Live candidate generation, R2 activation, restore pointer switching, public serving, database migration, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
