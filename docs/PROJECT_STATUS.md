# CryptoPayMap project status

**Last verified:** 2026-06-27

## Current phase

Phase 2 — Data core

## Current implementation item

P2-11 — Public export schemas

## Active pull request

[#36 — P2-11: Add explicit public export schemas](https://github.com/badjoke-lab/cryptopaymap/pull/36)

## Latest completed work

- P2-01 and P2-02 completed through pull request #24.
- P2-03 completed through pull request #25.
- P2-04 completed through pull request #26.
- P2-05 completed through pull request #29.
- P2-06 completed through pull request #30.
- P2-07 completed through pull request #31.
- P2-08 completed through pull request #32.
- P2-09 completed through pull request #34.
- P2-10 completed through pull request #35.

## P2-11 in progress

- strict schemas for all 12 planned public JSON and GeoJSON files
- canonical-only acceptance-claim projections
- explicit place, map-pin, online-service, registry, stats, update, manifest, and version contracts
- public media and evidence summaries without private storage or review fields
- cross-field rules for location scope, processor routes, ended claims, and payment combinations
- public identifiers that reject internal UUID-shaped values
- runtime examples that reject candidate states, private fields, unknown keys, and invalid coordinates
- no database migration or Cloudflare dependency

## Cloudflare status

Live staging verification remains deferred in draft pull request #23 and does not block repository-only Phase 2 work.

## Next

1. Complete CI and merge pull request #36.
2. Start P2-12 export allowlist and leakage validation.
3. Keep live data generation and publication disabled until the fail-closed boundary is complete.

## Blocked

No repository blocker. Only live staging verification is deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
