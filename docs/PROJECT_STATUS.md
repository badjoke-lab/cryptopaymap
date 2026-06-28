# CryptoPayMap project status

**Last verified:** 2026-06-28

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-04 — Candidate queue

## Active pull request

None. P3-03 closes with pull request #43.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- P3-03 completed through pull request #43.
- `/admin` and descendant routes use a fail-closed Pages Function boundary.
- Cloudflare Access assertions are checked for signature, issuer, audience, expiration, and not-before values.
- Exact verified Access subjects map to the read-only `dashboard:read` capability without email-based authorization.
- The protected dashboard exposes bounded Candidate, duplicate, Evidence, recheck, media, import, and recent-event summaries.
- Dashboard responses exclude record identifiers, source payloads, contacts, Evidence content, media keys, and write controls.
- Loading, ready, zero-work, denied, unavailable, invalid-response, and retry states are implemented.
- Publication remains unavailable until the dedicated P3-11 release workflow.
- Candidate-to-canonical promotion remains disabled.

## P3-04 next

- define a bounded Candidate queue contract with explicit `candidate:read` capability
- query private Candidate rows without returning raw source payloads, contacts, internal notes, or canonical write controls
- add stable sorting, status, type, source, priority, and duplicate-signal filters
- add cursor-based pagination with bounded page size
- expose protected queue loading, empty, denied, unavailable, invalid-response, and retry states
- keep Candidate detail and provenance expansion outside the queue item
- add authorization, query, endpoint, rendering, accessibility, and artifact tests

## Cloudflare status

Live staging, Access browser verification, and live database aggregation remain deferred. The repository-level P3-03 dashboard contract is complete and does not block P3-04 work.

## Next

1. Start P3-04 from the P3-03 completion main.
2. Add a bounded read-only Candidate queue and protected filtering contract.
3. Keep Candidate detail, duplicate resolution, promotion, and publication outside P3-04.

## Blocked

No repository blocker. Only live deployment and database verification are deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
