# CryptoPayMap project status

**Last verified:** 2026-07-01

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-07 — Claim editor and canonical promotion

## Active work

- P3-07D — existing canonical target link contract and atomic test backend.
- Branch: `work/p307d`.
- Pull request: preparing.

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
- Candidate promotion now has protected new-target editing, an isolated mutation allowlist, durable audit persistence, exact provenance guards, and an atomic Drizzle/Neon backend.

## P3-07D in progress

- define an explicit existing-target link request
- pin Candidate, Entity, optional Location, canonical path, source set, and existing Claim set
- support physical-place and online-service target shapes
- create only a hidden candidate Claim and Claim Assets
- preserve existing Entity and Location records unchanged
- use attribution provenance for reused identity targets and origin provenance for new Claim records
- update Candidate links and pending legacy mappings atomically
- prove replay, conflict, target drift, and rollback behavior

## Deferred within P3-07

- Drizzle/Neon existing-target link backend
- protected target search and comparison workspace
- existing-target editor controls
- field-level provenance editing
- live Cloudflare Access and live database verification

## Next

1. Complete P3-07D contract CI and merge it.
2. Add the durable existing-target backend and protected target selection workspace.
3. Add field-level provenance controls and complete the P3-07 integration audit.
4. Advance to P3-08 Evidence review.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
