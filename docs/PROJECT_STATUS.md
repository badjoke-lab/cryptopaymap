# CryptoPayMap project status

**Last verified:** 2026-07-01

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-07 — Claim editor and canonical promotion

## Active work

- P3-07G — field-level Candidate promotion provenance contract and persistence.
- Branch: `work/p307g`.
- Pull request: #55.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- P3-03 completed through pull request #43.
- P3-04 completed through pull request #44.
- P3-05 completed through pull request #45.
- P3-06 completed through pull requests #46 and #47.
- P3-07A completed through pull request #48.
- P3-07B completed through pull request #49.
- P3-07C completed through pull request #51.
- P3-07D completed through pull request #52.
- P3-07E completed through pull request #53.
- P3-07F completed through pull request #54.
- Candidate reviewers can now choose between a new canonical target and an existing canonical target through protected, version-pinned workspaces.

## P3-07G in progress

- define bounded field provenance assignments for Entity, Location, Claim, and Claim Asset fields
- restrict assignments to the exact Candidate source set
- require origin role for newly created canonical fields
- separate existing identity attribution from new Claim origin
- require complete supported-field coverage whenever an explicit plan is supplied
- normalize assignments for deterministic request fingerprints
- persist `field_path` rows inside the same atomic Drizzle/Neon transaction
- preserve record-level provenance and prior replay fingerprints when no plan is supplied
- add contract, runtime, persistence, formatting, type, test, and migration-drift checks

## Deferred within P3-07

- reviewer-facing field source controls
- final P3-07 integration and handoff audit
- live Cloudflare Access and live database verification

## Next

1. Complete P3-07G CI and merge pull request #55.
2. Add reviewer-facing field source controls.
3. Complete the P3-07 integration and handoff audit.
4. Advance to P3-08 Evidence review.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
