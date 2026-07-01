# CryptoPayMap project status

**Last verified:** 2026-07-02

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-07 — Claim editor and canonical promotion

## Active work

- P3-07I — reviewer-facing field source controls for existing canonical targets.
- Branch: work/p307i.
- Pull request: #57.

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
- P3-07G completed through pull request #55.
- P3-07H completed through pull request #56.
- New-target promotion now requires reviewer field source assignments and submits normalized origin provenance.

## P3-07I in progress

- display source controls for existing Entity, optional Location, new Claim, and Claim Assets
- assign Candidate sources to existing identity fields with attribution provenance
- assign Candidate sources to new Claim and Claim Asset fields with origin provenance
- require at least one existing identity attribution
- require complete origin coverage for non-empty new-record fields
- keep Claim and Claim Asset identities stable while editing
- include normalized field provenance assignments in the protected existing-target request
- validate the controls with builder, component payload, runtime, type, test, and build checks

## Deferred within P3-07

- final P3-07 integration and handoff audit
- live Cloudflare Access and live database verification

## Next

1. Complete P3-07I CI and merge pull request #57.
2. Complete the P3-07 integration and handoff audit.
3. Advance to P3-08 Evidence review.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
