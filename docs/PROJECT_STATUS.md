# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 1 — Foundation

## Current implementation item

`P1-08 — Cloudflare staging foundation`

## Active pull request

[#18 — P1-08: Add Cloudflare Pages staging foundation](https://github.com/badjoke-lab/cryptopaymap/pull/18)

## Latest completed work

- Phase 0 public specifications completed.
- P1-01 through P1-05 completed through pull requests #11 through #15.
- P1-06 schema and migration foundation completed through pull request #16.
- P1-07 CI and test foundation completed through pull request #17.

## P1-08 in progress

- pinned Wrangler and a static Cloudflare Pages staging contract
- manual deployment workflow scoped to the GitHub `staging` environment
- baseline security and cache headers
- deployable `dist` artifact validation and upload
- local Pages preview commands
- Node-only staging validation separated from browser application type checking

## Next

1. Complete all repository checks for pull request #18.
2. Merge P1-08 without requiring Cloudflare credentials or a live Pages project.
3. Start P1-09 PWA manifest and installability baseline.
4. Provision and connect the external Cloudflare staging project after P1-09 through P1-11 are merged and before the P1-12 integration audit is closed.

## Blocked

No repository blocker. A live staging URL remains intentionally unprovisioned until the Phase 1 staging verification gate.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
