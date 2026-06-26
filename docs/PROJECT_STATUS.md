# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 2 — Data core

## Current implementation items

`P2-01 — Asset registry`  
`P2-02 — Network registry`

## Active pull request

[#24 — P2-01/P2-02: Add asset and network registries](https://github.com/badjoke-lab/cryptopaymap/pull/24)

## Latest completed work

- Phase 0 public specifications completed.
- P1-01 through P1-11 completed through pull requests #11 through #21.
- P1-12 repository integration audit completed through pull request #22.

## P2-01 and P2-02 in progress

- canonical asset and network lifecycle values
- PostgreSQL asset and network tables with reviewable migrations
- initial ten-asset and fourteen-network registries
- stable slugs, canonical names, aliases, and runtime validation
- XBT, LN, Bitcoin mainnet, TRC20, ERC20, and BSC normalization
- explicit rule that an asset never implies a network
- migration drift validation in GitHub Actions

## Cloudflare status

Live Cloudflare staging verification remains deferred because external access is unavailable. Draft pull request #23 preserves the verification record. This external task does not block Phase 2 repository and data-model work.

## Next

1. Complete CI and merge pull request #24.
2. Start P2-03 payment method and route registries.
3. Continue Phase 2 work that requires only GitHub and repository CI.
4. Return to pull request #23 when Cloudflare access becomes available.

## Blocked

No repository blocker. Only live staging verification is deferred.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
