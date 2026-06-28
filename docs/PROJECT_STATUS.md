# CryptoPayMap project status

**Last verified:** 2026-06-29

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-06 — Duplicate review and identity resolution

## Active pull request

None. P3-05 closes with pull request #45.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- P3-03 completed through pull request #43.
- P3-04 completed through pull request #44.
- P3-05 completed through pull request #45.
- The protected Candidate queue links to a read-only Candidate detail and provenance workspace.
- Exact verified Access subjects use the existing `candidate:read` capability; unauthorized requests are rejected before Candidate lookup.
- Candidate detail responses expose bounded Candidate state, import origin, effective licenses, and at most 100 source relationships.
- Known physical-place and online import payloads are revalidated against their import schemas before an allowlisted snapshot is created.
- Unknown, malformed, or Candidate-type-mismatched payloads return metadata only; unrestricted raw JSON is never serialized to the response.
- Canonical entity and location identifiers, import actor identities, source external IDs, content hashes, internal notes, private Evidence, contacts, media keys, and write controls remain excluded.
- The interface implements loading, ready, missing-ID, denied, not-found, unavailable, invalid-response, retry, zero-source, and truncated-source states.
- Runtime checks, service tests, endpoint tests, component tests, static build, accessibility checks, and staging artifact leakage checks pass.
- Duplicate decisions, Candidate mutation, canonical promotion, Evidence decisions, media decisions, and publication remain disabled.

## P3-06 next

- define explicit duplicate-group review and identity-resolution contracts
- show bounded group members, duplicate signals, and provenance comparisons without generic private-row serialization
- require an authorized mutation context and explicit reviewer decision; do not auto-merge Candidates
- persist duplicate, dismissal, and identity-link decisions transactionally while preserving original Candidate provenance
- prevent duplicate resolution from performing canonical promotion or publication
- add authorization, transaction, conflict, rollback, rendering, accessibility, runtime, and artifact tests

## Cloudflare status

Live staging, Access browser verification, and live database results remain deferred. The repository-level P3-05 detail and provenance contract is complete and does not block P3-06 work.

## Next

1. Start P3-06 from the P3-05 completion main.
2. Add explicit duplicate review and identity-resolution decisions with no automatic merge.
3. Keep claim editing, canonical promotion, Evidence decisions, and publication outside P3-06.

## Blocked

No repository blocker. Only live deployment and database verification are deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
