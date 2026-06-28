# CryptoPayMap project status

**Last verified:** 2026-06-28

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-01 — Admin data-access and transaction foundation

## Active pull request

[#41 — P3-01: Add admin persistence and transaction foundation](https://github.com/badjoke-lab/cryptopaymap/pull/41)

## Latest completed work

- Phase 2 completed through pull request #40.
- The Phase 2 completion audit and database rollback contract are on `main`.

## P3-01 in progress

- private import-batch schema with source, checksum, counts, actor, request, and timing metadata
- administration mutation context with explicit `candidate:write` capability
- fail-closed validation before any backend call
- idempotent source-record, Candidate, origin-link, and pending legacy-mapping persistence
- Neon HTTP / Drizzle batch transaction adapter
- exact-record SQL guards that roll back conflicting deterministic identities
- in-memory copy-on-write backend for transaction contract tests
- positive, replay, authorization, canonical-boundary, conflict, all-rejected, and rollback tests
- runtime persistence check in the shared schema pipeline
- no canonical entity, location, claim, verification event, or public artifact creation

## Cloudflare status

Live staging and Cloudflare Access verification remain deferred. P3-01 uses an explicit authorization context and remains repository-only.

## Next

1. Complete CI and generate the reviewed import-batch migration.
2. Finalize the transaction and rollback audit for pull request #41.
3. Merge P3-01 and start P3-02 protected admin shell and access contract.

## Blocked

No repository blocker. Only live Cloudflare verification is deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
