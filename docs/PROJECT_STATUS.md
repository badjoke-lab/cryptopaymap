# CryptoPayMap project status

**Last verified:** 2026-07-04

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-11 — Export controls and release workflow

## Active work

- P3-11F — durable activation history and request-level replay records
- Branch: `work/p311f`
- Pull request: #80

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

## P3-11F in progress

- durable `export_activation_records` table
- generated migration `0019_overrated_rumiko_fujikawa.sql`
- generated snapshot materialization from verified encoded chunks
- request-level activation fingerprint
- successful-activation-only durable history write
- same-request replay and different-content conflict handling
- snapshot and dataset double-record protection
- activation writer integration
- activation history runtime and unit tests

## Next

1. Complete P3-11F validation and merge pull request #80.
2. Add rollback operations and release history reads.
3. Complete the final P3-11 integration audit and P3-12 handoff.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database migration, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
