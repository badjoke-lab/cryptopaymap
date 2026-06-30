# CryptoPayMap project status

**Last verified:** 2026-07-01

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-07 — Claim editor and canonical promotion

## Active work

- P3-07B — durable promotion audit persistence and Drizzle transaction backend.
- Branch: `work/p307b`.
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
- P3-07A fixed the authorization, validation, hidden-canonical, provenance, replay, and rollback contract for Candidate promotion.

## P3-07B in progress

- add the private `candidate_promotion_decisions` audit schema
- generate and review the next Drizzle migration
- add the Neon HTTP atomic batch backend
- lock and recheck Candidate version and exact source provenance
- insert hidden canonical Entity, optional Location, Claim, and Claim Assets
- persist record-level origin provenance
- resolve pending legacy mappings
- update Candidate status and canonical links
- persist and replay the durable promotion receipt
- verify schema, types, tests, migration drift, build, and staging artifacts

## Deferred within P3-07

- protected promotion editor and endpoint
- existing canonical-target linking
- field-level provenance editing
- live Cloudflare Access and live database verification

## Next

1. Complete P3-07B and merge the durable database backend.
2. Add the protected canonical promotion endpoint and editor.
3. Complete existing-target linking and field-level provenance.
4. Advance to P3-08 Evidence review.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
