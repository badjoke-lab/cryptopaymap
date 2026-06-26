# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 1 — Foundation

## Current implementation item

`P1-10 — Accessibility baseline`

## Active pull request

[#20 — P1-10: Add accessibility baseline and automated checks](https://github.com/badjoke-lab/cryptopaymap/pull/20)

## Latest completed work

- Phase 0 public specifications completed.
- P1-01 through P1-05 completed through pull requests #11 through #15.
- P1-06 schema and migration foundation completed through pull request #16.
- P1-07 CI and test foundation completed through pull request #17.
- P1-08 Cloudflare staging foundation completed through pull request #18.
- P1-09 PWA manifest and installability baseline completed through pull request #19.

## P1-10 in progress

- focusable main landmark for skip-link navigation
- build-time document and landmark validation
- duplicate ID, focus-order, accessible-name, and form-label checks
- field, dialog, and sheet accessibility tests
- accessibility quality command integrated into preview, deployment, and CI
- accessibility validation logs
- keyboard, motion, status, form, map-alternative, and manual-review contract

## Next

1. Complete all repository checks for pull request #20.
2. Merge P1-10 after the accessibility artifact and component checks are green.
3. Start P1-11 public Roadmap and Changelog content loaders.
4. Keep Cloudflare unconnected through P1-11.
5. Provision and verify the external staging project before closing P1-12.

## Blocked

No repository blocker. A live staging URL remains intentionally unprovisioned until the Phase 1 staging verification gate.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
