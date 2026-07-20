# CryptoPayMap project status

**Last verified:** 2026-07-20

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07E2 — Protected Business Claim payment-draft preview

## Current repository state

- Phase 0 through Phase 4 are complete for the Phase 5 handoff.
- P5-01 through P5-06 are repository-complete.
- P5-07A canonical application and retention inventory completed in #243.
- P5-07B common application registration and lifecycle completed in #245–#246.
- P5-07C Suggest Candidate receipt binding completed in #247.
- P5-07D1 practical Location correction application completed in #248.
- P5-07D2 durable negative recheck application completed in #249.
- P5-07D3 remaining correction owner audit completed in #250.
- P5-07D4 Claim instruction correction application completed in #251.
- P5-07D5 Claim Asset set replacement preview completed in #252.
- P5-07D6 durable Claim Asset replacement plan completed in #253.
- P5-07D7 atomic complete Claim Asset replacement completed in #254.
- P5-07E1 Business Claim application-order correction completed in #255.
- P5-07E2 is active in PR #256 on `p5-07e2-business-claim-payment-preview`.

## Latest verified main

```text
482a99252019be34e11f1fb2ef6a0499d481cb4e
```

The final P5-07E1 head passed all four normal workflow groups.

## Active pull request

```text
#256 — P5-07E2 Business Claim payment preview
```

## Current boundary

P5-07E2 may read only the exact pending Business Claim application, durable accepted payment drafts, canonical target, active registries, processor candidates, and compatible Claim/Claim Asset state.

It classifies each accepted draft without guessing and returns a deterministic `draftSetHash`. It must not mutate canonical or lifecycle state.

## Next

Implement P5-07E3 as a durable exact payment application plan bound to the E2 preview and explicit reviewer selection. Canonical payment application and Entity/Location provenance remain later separate atomic owners.

## Blocked

No repository blocker is known.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. If this file differs from GitHub reality, GitHub is authoritative and this file must be corrected in the next bounded pull request.

## Current references

- `docs/P5_07A_CANONICAL_APPLICATION_RETENTION_INVENTORY.md`
- `docs/P5_07D3_REMAINING_CORRECTION_OWNER_AUDIT.md`
- `docs/P5_07D4_PROBLEM_CLAIM_INSTRUCTION_CORRECTION.md`
- `docs/P5_07D7_CLAIM_ASSET_REPLACEMENT_APPLICATION.md`
- `docs/P5_07E1_BUSINESS_CLAIM_APPLICATION_ORDER.md`
- `docs/P5_07E2_BUSINESS_CLAIM_PAYMENT_PREVIEW.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
