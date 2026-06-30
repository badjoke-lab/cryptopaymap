# CryptoPayMap project status

**Last verified:** 2026-07-01

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-07 — Claim editor and canonical promotion

## Active work

- P3-07C — protected Candidate promotion endpoint and hidden canonical editor.
- Branch: `work/p307c`.
- Pull request: #51.

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
- Candidate promotion now has a separate authorization contract, durable audit record, exact provenance guards, an atomic Drizzle/Neon backend, and a reviewed migration set.

## P3-07C in progress

- add the separate Candidate promotion subject allowlist
- load a bounded promotion workspace from the current Candidate and active registries
- block unsupported types, stale status, existing links, incomplete provenance, and open duplicate review
- expose protected GET and POST promotion endpoints
- require exact Idempotency-Key UUIDs for mutation
- provide explicit Entity, optional Location, Claim, and Claim Asset controls
- keep all generated canonical records hidden with a candidate claim
- add contract, API, component, runtime, accessibility, and staging-artifact checks

## Deferred within P3-07

- existing canonical-target linking
- field-level provenance editing
- live Cloudflare Access and live database verification

## Next

1. Complete P3-07C CI and merge the protected editor.
2. Add existing canonical-target linking.
3. Add field-level provenance controls and complete the P3-07 integration audit.
4. Advance to P3-08 Evidence review.

## Blocked

No repository blocker. Live deployment and database verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
