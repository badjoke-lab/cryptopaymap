# CryptoPayMap project status

**Last verified:** 2026-07-02

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-08 — Evidence review and verification decisions

## Active work

- P3-08A — Evidence review authorization and atomic decision contract.
- Branch: work/p308-tests.
- Pull request: #59.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- P3-03 completed through pull request #43.
- P3-04 completed through pull request #44.
- P3-05 completed through pull request #45.
- P3-06 completed through pull requests #46 and #47.
- P3-07 completed through pull request #58.
- Both Candidate promotion choices are hidden, source-pinned, atomic, and separated from verification and publication.

## P3-08A in progress

- define a separate `evidence:review` capability and subject allowlist
- fix Evidence, Claim, and accepted-Evidence-set expectations in every decision
- separate Evidence disposition, review finding, and explicit Claim action
- require the existing Evidence threshold for confirmation
- require accepted contradicting Evidence for stale, end, and reject actions
- preserve Claim visibility during review decisions
- provide deterministic request fingerprints and replay behavior
- prove confirmation, hold, stale, conflict, invalid transition, and rollback behavior
- add a machine-executed runtime contract check

## Deferred within P3-08

- durable Evidence review decision table and migration
- Drizzle and Neon atomic decision backend
- rejected verification-event persistence representation
- protected Evidence queue and reviewer workspace
- live Cloudflare Access and database verification

## Next

1. Complete P3-08A CI and merge pull request #59.
2. Add durable Evidence review persistence and migration in P3-08B.
3. Add the protected Evidence review workspace.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
