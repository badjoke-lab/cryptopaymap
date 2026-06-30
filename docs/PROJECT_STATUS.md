# CryptoPayMap project status

**Last verified:** 2026-07-01

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-07 — Claim editor and canonical promotion

## Active work

- P3-07E — durable existing-target Drizzle/Neon backend.
- Branch: `work/p307e`.
- Pull request: #53.

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
- Existing-target linking now has an explicit review contract, exact target and Claim-set checks, attribution provenance rules, and atomic replay and rollback semantics.

## P3-07E in progress

- add the Drizzle/Neon existing-target link backend
- recheck Candidate state and exact source provenance inside the transaction
- lock the selected Entity and optional Location versions
- lock and compare the exact existing Claim set
- create only the hidden candidate Claim and Claim Assets
- use attribution provenance for existing identity targets and origin provenance for new records
- update Candidate links and pending legacy mappings atomically
- persist and replay the durable promotion receipt
- map PostgreSQL guard, foreign-key, uniqueness, and check failures to conflicts
- verify formatting, types, runtime checks, tests, build, migration drift, and staging artifacts

## Deferred within P3-07

- protected target search and comparison workspace
- existing-target editor controls
- field-level provenance editing
- live Cloudflare Access and live database verification

## Next

1. Complete P3-07E CI and merge the durable backend.
2. Add the protected target search, comparison, and selection workspace.
3. Add field-level provenance controls and complete the P3-07 integration audit.
4. Advance to P3-08 Evidence review.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
