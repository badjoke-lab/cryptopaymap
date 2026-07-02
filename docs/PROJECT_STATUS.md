# CryptoPayMap project status

**Last verified:** 2026-07-03

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-09 — Status transitions and reconfirmation queue

## Active work

- P3-09A — reconfirmation queue policy and overdue review-window transition contract.
- Branch: `work/p309a`.
- Pull request: #64.
- Status: final CI validation after formatting.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- P3-03 completed through pull request #43.
- P3-04 completed through pull request #44.
- P3-05 completed through pull request #45.
- P3-06 completed through pull requests #46 and #47.
- P3-07 completed through pull request #58.
- P3-08 completed through pull request #63.
- Closed draft pull request #61 was superseded by merged pull request #62 without losing implementation.

## P3-09A in final validation

- classify overdue, missing-deadline, stale, and due-soon Claims without mutation
- exclude Claims outside the reconfirmation queue boundary
- keep queue recommendations separate from status mutation
- require a system actor and exact Claim version, status, visibility, and deadline
- transition only confirmed Claims with expired review windows to stale
- preserve visibility and the expired review date
- prove replay, conflict, early-execution rejection, and rollback behavior
- add a machine-executed contract check

## Deferred within P3-09

- durable expiration receipt and database transaction
- bounded database reconfirmation queue
- scheduled execution
- protected reconfirmation workspace
- live scheduler, Access, and database verification

## Next

1. Complete P3-09A CI and merge pull request #64.
2. Add durable persistence and the database queue in P3-09B.
3. Add the protected reconfirmation workspace.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
