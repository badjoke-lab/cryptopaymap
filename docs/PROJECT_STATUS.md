# CryptoPayMap project status

**Last verified:** 2026-07-02

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-07 — Claim editor and canonical promotion

## Active work

- P3-07H — reviewer-facing field source controls for new canonical targets.
- Branch: `work/p307h`.
- Pull request: #56.

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
- Both promotion paths accept explicit field-level provenance plans and persist field paths atomically.

## P3-07H in progress

- display supported Entity, Location, Claim, and Claim Asset fields
- allow reviewers to assign exact Candidate sources to each factual field
- select the reviewed Candidate source set by default for newly displayed fields
- keep stable draft and Claim Asset identities while editing
- reject submission when a non-empty factual field has no source assignment
- include normalized field provenance assignments in the protected promotion request
- validate the controls with builder, component payload, runtime, type, test, and build checks

## Deferred within P3-07

- existing-target reviewer field source controls
- final P3-07 integration and handoff audit
- live Cloudflare Access and live database verification

## Next

1. Complete P3-07H CI and merge pull request #56.
2. Add existing-target field source controls.
3. Complete the P3-07 integration and handoff audit.
4. Advance to P3-08 Evidence review.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
