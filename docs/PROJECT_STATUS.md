# CryptoPayMap project status

**Last verified:** 2026-06-27

## Current phase

Phase 2 — Data core

## Current implementation item

P2-13 — Physical-place candidate importer

## Active pull request

[#39 — P2-13: Add physical-place candidate importer](https://github.com/badjoke-lab/cryptopaymap/pull/39)

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
- P2-10 database guard follow-up completed through pull request #37.
- P2-11 completed through pull request #36.
- P2-12 completed through pull request #38.

## P2-13 in progress

- strict validation for untrusted legacy physical-place rows
- deterministic candidate, source-record, and legacy-mapping identities
- immutable raw payload and SHA-256 content provenance
- candidate-only output with pending legacy mappings
- exact replay collapse and conflicting legacy-ID rejection
- OSM-identity and same-name/same-coordinate review signals without automatic merge
- preservation of source payment tags without asset, network, method, or Confirmed inference
- ten-record runtime proof and positive/negative unit tests
- no database write, live legacy access, public export, or Cloudflare dependency

## Cloudflare status

Live staging verification remains deferred in draft pull request #23 and does not block repository-only Phase 2 work.

## Next

1. Complete CI and merge pull request #39.
2. Start P2-14 online-service importer and Phase 2 integration audit.
3. Keep imported candidates private until Phase 3 administrative review and promotion.

## Blocked

No repository blocker. Only live staging verification is deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
