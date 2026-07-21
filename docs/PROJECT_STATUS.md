# CryptoPayMap project status

**Last verified:** 2026-07-21

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07E5 — Business Claim field provenance completion

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
- P5-07E4 atomic Business Claim payment application completed in #258.
- P5-07E5 is active in PR #259 on `p5-07e5-business-claim-field-provenance`.

## Latest verified main

```text
6e02124d7501216b1338b03fdb8726dfac1eac04
```

The final P5-07E4 head passed all four normal workflow groups.

## Active pull request

```text
#259 — P5-07E5 Business Claim field provenance completion
```

## Current boundary

P5-07E5 consumes one exact private P5-04H2 `business_claim_fields_applied` event and completes the missing Entity or Location field-level provenance. It does not update the canonical target again.

The operation verifies the current exact target version and every accepted H2 field value, writes one deterministic private Business Claim Source Record, closes the exact prior open non-correction field links at the H2 application time, inserts current `correction` links, and records one private completion event in the same transaction.

## Next

P5-07F reconciles Photos parent resolution, Media application receipts, and publication handoff. Export activation remains a separate later owner.

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
- `docs/P5_07E5_BUSINESS_CLAIM_FIELD_PROVENANCE.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
