# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 2 — Data core

## Current implementation item

`P2-03 — Payment method and route registries`

## Active pull request

[#25 — P2-03: Add payment route and method registries](https://github.com/badjoke-lab/cryptopaymap/pull/25)

## Latest completed work

- Phase 0 public specifications completed.
- P1-01 through P1-11 completed through pull requests #11 through #21.
- P1-12 repository integration audit completed through pull request #22.
- P2-01 and P2-02 asset and network registries completed through pull request #24.

## P2-03 in progress

- separate canonical registries for payment routes and payment methods
- direct-wallet and processor-checkout route records
- eight initial payment method records
- PostgreSQL tables, lifecycle values, migration, snapshot, and journal
- alias normalization and candidate lookup
- validation that route identifiers are not payment methods
- migration drift validation in GitHub Actions

## Cloudflare status

Live Cloudflare staging verification remains deferred because external access is unavailable. Draft pull request #23 preserves the verification record. This external task does not block Phase 2 repository and data-model work.

## Next

1. Complete CI and merge pull request #25.
2. Start P2-04 entity and location schema.
3. Continue Phase 2 work that requires only GitHub and repository CI.
4. Return to pull request #23 when Cloudflare access becomes available.

## Blocked

No repository blocker. Only live staging verification is deferred.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
