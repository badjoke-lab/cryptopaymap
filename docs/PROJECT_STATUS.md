# CryptoPayMap project status

**Last verified:** 2026-06-30

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-06 — Duplicate review and identity resolution

## Active pull request

- Pull request #47 — P3-06B duplicate-group review interface and explicit decision controls.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- P3-03 completed through pull request #43.
- P3-04 completed through pull request #44.
- P3-05 completed through pull request #45.
- P3-06A completed through pull request #46.
- Importer duplicate signals are persisted with deterministic group and signal identities.
- Duplicate decisions require the separate `candidate:resolve` capability and an explicit reviewer action.
- Confirm-duplicate and dismiss-signal decisions are transactional, idempotent, conflict-checked, and audit-preserving.
- Duplicate decisions do not merge Candidate rows, move source records, create canonical records, or publish data.

## P3-06B in progress

- expose a protected, bounded duplicate-group comparison response
- link Candidate detail pages to duplicate-group review
- show group members, persisted signals, provenance summaries, and closed-group states
- provide explicit confirm-duplicate and dismiss-signal controls
- require an authorized mutation context and optimistic group-version checks
- return bounded denial, not-found, conflict, and unavailable states without private-detail leakage
- add route, service, component, runtime, accessibility, and staging-artifact checks
- keep canonical promotion, Evidence decisions, media decisions, and publication outside P3-06

## Cloudflare status

Live staging, Access browser verification, and live database results remain deferred. Repository-level access, transaction, rendering, runtime, and artifact contracts continue to be verified in CI and do not block repository-only Phase 3 work.

## Next

1. Complete pull request #47 and close P3-06.
2. Start P3-07 — Claim editor and canonical promotion.
3. Keep Evidence decisions, publication, and public routes outside the first P3-07 delivery.

## Blocked

No repository blocker. Only live deployment and database verification are deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
