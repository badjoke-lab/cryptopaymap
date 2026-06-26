# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 2 — Data core

## Current implementation item

`P2-01 — Asset registry`

## Active pull request

[#24 — P2-01: Add asset registry](https://github.com/badjoke-lab/cryptopaymap/pull/24)

## Latest completed work

- Phase 0 public specifications completed.
- P1-01 through P1-11 completed through pull requests #11 through #21.
- P1-12 repository integration audit completed through pull request #22.

## P2-01 in progress

- canonical asset lifecycle and type values
- PostgreSQL asset table and reviewable migration
- initial ten-asset registry
- stable slug, symbol, name, alias, stablecoin, wrapped-asset, and decimal metadata
- runtime validation and alias resolution
- explicit rule that an asset never implies a network

## Cloudflare status

Live Cloudflare staging verification remains deferred because external access is unavailable. Draft pull request #23 preserves the verification record. This external task does not block Phase 2 repository and data-model work.

## Next

1. Complete and merge P2-01.
2. Start P2-02 network registry.
3. Continue Phase 2 work that requires only GitHub and repository CI.
4. Return to pull request #23 when Cloudflare access becomes available.

## Blocked

No repository blocker. Only live staging verification is deferred.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
