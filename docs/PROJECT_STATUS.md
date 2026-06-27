# CryptoPayMap project status

**Last verified:** 2026-06-27

## Current phase

Phase 2 — Data core

## Current implementation item

P2-12 — Export allowlist and leakage validator

## Active pull request

[#38 — P2-12: Add fail-closed export validation](https://github.com/badjoke-lab/cryptopaymap/pull/38)

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
- P2-11 completed through pull request #36.

## P2-12 in progress

- exact allowlist for all 12 public artifact paths
- strict schema parsing before release eligibility
- recursive rejection of fields and URI schemes outside the public contract
- deterministic canonical JSON and SHA-256 hashing
- complete release-set validation rather than file-by-file publication
- manifest path, media-type, schema-version, record-count, license, and digest checks
- dataset-version and generation-time consistency checks
- immutable validated release sets with no publication side effects
- positive and negative automated checks
- no database migration or Cloudflare dependency

## Cloudflare status

Live staging verification remains deferred in draft pull request #23 and does not block repository-only Phase 2 work.

## Next

1. Complete CI and merge pull request #38.
2. Start P2-13 physical-place candidate importer.
3. Keep live publication disabled until import and integration checks are complete.

## Blocked

No repository blocker. Only live staging verification is deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
