# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 1 — Foundation

## Current implementation item

`P1-09 — PWA manifest and installability baseline`

## Active pull request

[#19 — P1-09: Add PWA manifest and installability baseline](https://github.com/badjoke-lab/cryptopaymap/pull/19)

## Latest completed work

- Phase 0 public specifications completed.
- P1-01 through P1-05 completed through pull requests #11 through #15.
- P1-06 schema and migration foundation completed through pull request #16.
- P1-07 CI and test foundation completed through pull request #17.
- P1-08 Cloudflare staging foundation completed through pull request #18.

## P1-09 in progress

- scoped standalone web app manifest
- standard and maskable application icons
- shared manifest, icon, theme, and mobile metadata
- staging artifact validation for PWA files
- manifest and icon cache policy
- installability and no-offline-cache tests
- PWA scope and freshness documentation

## Next

1. Complete all repository checks for pull request #19.
2. Merge P1-09 without adding a service worker or offline payment-data cache.
3. Start P1-10 accessibility baseline.
4. Keep Cloudflare unconnected through P1-10 and P1-11.
5. Provision and verify the external staging project before closing P1-12.

## Blocked

No repository blocker. A live staging URL remains intentionally unprovisioned until the Phase 1 staging verification gate.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
