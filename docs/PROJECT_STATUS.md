# CryptoPayMap project status

**Last verified:** 2026-07-20

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07E4 — Atomic Business Claim payment application

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
- P5-07E2 protected Business Claim payment-draft preview completed in #256.
- P5-07E3 durable Business Claim payment application plan completed in #257.
- P5-07E4 is active in PR #258 on `p5-07e4-business-claim-payment-application`.

## Latest verified main

```text
2cc89ee3db694c768d083ba67de12a056ec8926b
```

The final P5-07E3 head passed all four normal workflow groups.

## Active pull request

```text
#258 — P5-07E4 atomic Business Claim payment application
```

## Current boundary

P5-07E4 may consume only one exact private P5-07E3 plan. It atomically creates planned hidden candidate Claims, inserts planned Claim Asset rows, preserves already-present rows, writes one private Source Record, payment provenance, Verification Events, and one canonical Submission event.

Entity and Location profile fields are not changed. Application lifecycle commit follows the canonical transaction and supports exact replay-safe recovery without a second canonical write.

## Next

Complete Entity and Location field-level provenance for H2-applied Business Claim field changes. Publication, export, and retention remain separate later owners.

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
- `docs/P5_07E3_BUSINESS_CLAIM_PAYMENT_PLAN.md`
- `docs/P5_07E4_BUSINESS_CLAIM_PAYMENT_APPLICATION.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
