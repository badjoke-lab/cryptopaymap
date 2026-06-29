# CryptoPayMap project status

**Last verified:** 2026-06-30

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-07 — Claim editor and canonical promotion

## Active work

- P3-07A — canonical promotion service contract and atomic test backend.
- Branch: `work/p307a`.
- Pull request: not opened yet.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- P3-03 completed through pull request #43.
- P3-04 completed through pull request #44.
- P3-05 completed through pull request #45.
- P3-06A completed through pull request #46.
- P3-06B completed through pull request #47.
- Duplicate review now has protected group queries, explicit reviewer controls, conflict handling, bounded private responses, and complete repository CI coverage.

## P3-07A in progress

- define the separate `candidate:promote` authorization boundary
- accept explicit normalized Entity, Location, Claim, and Claim Asset drafts
- support physical-place and online-service promotion only
- require exact Candidate type, update time, and source provenance
- create hidden canonical records and a hidden candidate claim
- update Candidate canonical links and legacy mappings atomically
- prove replay, conflict, and rollback behavior with an in-memory backend
- prevent verification, Evidence decisions, public visibility, and export

## Deferred within P3-07

- durable promotion audit schema and migration
- Drizzle and Neon transaction backend
- protected promotion editor and endpoint
- existing canonical target linking
- field-level provenance editing
- live Cloudflare Access and live database verification

## Next

1. Complete P3-07A CI and merge its contract foundation.
2. Add durable promotion audit persistence and the Drizzle backend.
3. Add the protected canonical promotion editor.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
