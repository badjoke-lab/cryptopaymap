# CryptoPayMap project status

**Last verified:** 2026-06-28

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-05 — Candidate detail and provenance review

## Active pull request

None. P3-04 closes with pull request #44.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- P3-03 completed through pull request #43.
- P3-04 completed through pull request #44.
- Exact verified Access subjects map to the read-only `candidate:read` capability independently from dashboard access.
- The protected Candidate queue supports bounded status, type, source, priority, and duplicate-signal filters.
- Queue ordering is fixed by priority, last-seen time, and Candidate UUID, with validated cursor pagination and a maximum page size of 50.
- Queue responses expose summary fields only and exclude raw source payloads, source URLs, contacts, internal notes, canonical identifiers, Evidence content, media keys, and write controls.
- Loading, valid results, empty, denied, unavailable, invalid-query, invalid-response, retry, filter reset, and load-more states are implemented.
- Browser responses are schema-validated before display, and stale requests cannot overwrite a newer filter result.
- Candidate detail, duplicate decisions, canonical promotion, and publication remain disabled.

## P3-05 next

- define a protected Candidate detail contract with explicit Candidate read authorization
- expose one Candidate summary with bounded source and provenance records
- separate original source values from normalized review values without returning unrestricted raw payloads
- show source type, source license, import origin, observation times, duplicate signals, and existing canonical-link state
- add not-found behavior that does not leak Candidate existence to unauthorized identities
- keep duplicate resolution, Candidate mutation, canonical promotion, Evidence decisions, and publication outside P3-05
- add authorization, query, endpoint, rendering, accessibility, and artifact tests

## Cloudflare status

Live staging, Access browser verification, and live database results remain deferred. The repository-level P3-04 queue contract is complete and does not block P3-05 work.

## Next

1. Start P3-05 from the P3-04 completion main.
2. Add a bounded Candidate detail and provenance inspection contract.
3. Keep duplicate decisions, writes, promotion, and publication outside P3-05.

## Blocked

No repository blocker. Only live deployment and database verification are deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
