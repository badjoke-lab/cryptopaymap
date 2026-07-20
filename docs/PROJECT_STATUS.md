# CryptoPayMap project status

**Last verified:** 2026-07-20

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07E1 — Business Claim application-order correction

## Current repository state

- Phase 0 through Phase 4 are complete for the Phase 5 handoff.
- P5-01 through P5-06 are repository-complete.
- P5-07A canonical application and retention inventory completed in #243.
- P5-07B common application registration and lifecycle completed in #245–#246.
- P5-07C Suggest Candidate receipt binding completed in #247.
- P5-07D report correction and Claim Asset work completed through #248–#254.
- P5-07D7 atomic complete Claim Asset replacement completed in #254.
- P5-07E1 is active on `p5-07e1-business-claim-application-order`.

## Latest verified main

```text
3d4e68ae2280807b7c0c9083f041425ebc42c19e
```

The final P5-07D7 head passed all four normal workflow groups.

## Active pull request

```text
p5-07e1-business-claim-application-order — Business Claim application ordering
```

## Current boundary

P5-07E1 prevents a Business Claim field-application event from completing the common application while accepted private payment drafts remain unconsumed.

It may parse the exact field event, derive pending payment work, preserve no-payment completion, and add focused tests and audit documentation.

It must not create or mutate Claims, Claim Assets, registries, provenance, Entity, Location, export, release, retention, schema, or deployment state.

## Next

Implement P5-07E2 as the protected exact payment-draft and canonical-target preview. Provenance completion and canonical payment application remain separate atomic owners after the preview.

## Blocked

No repository blocker is known.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. If this file differs from GitHub reality, GitHub is authoritative and this file must be corrected in the next bounded pull request.

## Current references

- `docs/P5_07A_CANONICAL_APPLICATION_RETENTION_INVENTORY.md`
- `docs/P5_07D7_CLAIM_ASSET_REPLACEMENT_APPLICATION.md`
- `docs/P5_07E1_BUSINESS_CLAIM_APPLICATION_ORDER.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
