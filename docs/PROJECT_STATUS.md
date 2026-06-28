# CryptoPayMap project status

**Last verified:** 2026-06-28

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-02 — Protected admin shell and access contract

## Active pull request

None. P3-01 closes with pull request #41.

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- Migration `0012_marvelous_iron_fist.sql` adds the private import-batch audit table and constraints.
- The private import-batch schema records source, checksum, counts, actor, request, and timing metadata.
- Candidate-plan persistence requires the `candidate:write` capability.
- Source records, Candidates, origin links, and pending legacy mappings commit in one batch transaction.
- Exact deterministic replays are idempotent; conflicting identities roll back.
- Runtime checks and tests cover authorization, replay, conflict, rollback, all-rejected batches, and the canonical boundary.
- No canonical entity, location, claim, verification event, or public artifact is created by P3-01.

## P3-02 next

- define the protected `/admin` route boundary
- define trusted access headers and local test identity handling
- reject missing, malformed, or untrusted administration identity
- add the responsive administration application shell
- add navigation placeholders without exposing private records
- keep live Cloudflare Access verification deferred until credentials are available
- add route, authorization, accessibility, and build tests

## Cloudflare status

Live staging and Cloudflare Access verification remain deferred. Repository-level access contracts and fail-closed route behavior can proceed without live credentials.

## Next

1. Merge pull request #41 after final CI and diff audit.
2. Start P3-02 from the resulting main.
3. Keep Candidate-to-canonical promotion disabled until the reviewed promotion item.

## Blocked

No repository blocker. Only live Cloudflare verification is deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
