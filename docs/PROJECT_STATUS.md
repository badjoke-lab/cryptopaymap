# CryptoPayMap project status

**Last verified:** 2026-06-28

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-02 — Protected admin shell and access contract

## Active pull request

[#42 — P3-02: Add protected admin shell and access contract](https://github.com/badjoke-lab/cryptopaymap/pull/42)

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- Migration `0012_marvelous_iron_fist.sql` adds the private import-batch audit table and constraints.
- Candidate-plan persistence requires the `candidate:write` capability.
- Source records, Candidates, origin links, and pending legacy mappings commit in one batch transaction.
- Exact deterministic replays are idempotent; conflicting identities roll back.
- No canonical entity, location, claim, verification event, or public artifact is created by P3-01.

## P3-02 work in progress

- protect `/admin` and descendant routes through nested Pages Function middleware
- validate Cloudflare Access team-domain and application-audience configuration
- verify assertion signature, issuer, audience, expiration, and not-before values server-side
- derive administration identity only from verified assertion claims
- apply private, no-store, noindex, and no-referrer response behavior
- provide a responsive administration shell and protected placeholder routes
- keep Candidate records, counts, contacts, Evidence payloads, and write controls out of static HTML
- test configuration, verification, identity propagation, fail-closed behavior, accessibility, build, and staging artifacts

## Cloudflare status

Live staging and Cloudflare Access verification remain deferred. Repository-level verification, route protection, shell behavior, and fail-closed contracts are covered in pull request #42 without live credentials.

## Next

1. Complete pull request #42 CI and final boundary audit.
2. Merge P3-02 after all repository checks pass.
3. Advance to P3-03 — Dashboard and operational queue summaries.
4. Keep Candidate-to-canonical promotion disabled until the reviewed promotion item.

## Blocked

No repository blocker. Only live Cloudflare deployment verification is deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
