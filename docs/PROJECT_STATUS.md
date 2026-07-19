# CryptoPayMap project status

**Last verified:** 2026-07-19

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07D7 — Atomic complete Claim Asset set replacement application

## Current repository state

- Phase 0 through Phase 4 are complete for the Phase 5 handoff.
- P5-01 shared Submission foundation is complete through #150–#155.
- P5-02 Suggest Place and Online Service is complete through #156–#192.
- P5-03 Payment and problem reports is complete through #194–#202.
- P5-04 Business and service claims is complete through #203–#215.
- P5-05 Photo and Media submission intake is complete through #216–#227.
- P5-06 review workflow extensions are repository-complete through #228–#242.
- P5-07A canonical application and retention inventory completed in #243.
- P5-07B1 common application registration completed in #245.
- P5-07B2 protected application lifecycle read and transition completed in #246.
- P5-07C Suggest Candidate promotion receipt binding completed in #247.
- P5-07D1 approved Problem Report practical Location correction application completed in #248.
- P5-07D2 durable negative recheck application projection completed in #249.
- P5-07D3 remaining correction owner audit completed in #250.
- P5-07D4 Claim instruction correction application completed in #251.
- P5-07D5 Claim Asset set replacement preview completed in #252.
- P5-07D6 durable Claim Asset replacement plan completed in #253.
- P5-07D7 is active in #254.

## Latest verified main

```text
03551cd149e25eaab53faed3cc7f618e86bc83a2
```

The final P5-07D6 implementation head passed:

- Foundation validation;
- Migration drift;
- Staging review validation;
- representative review screenshots.

Foundation validation included formatting, lint, Astro and TypeScript checks, the D6 runtime audit, migration-history checks, all unit and component tests, static build, accessibility checks, and generated staging-artifact checks.

## Active pull request

```text
#254 — P5-07D7 atomic complete Claim Asset set replacement
```

## Current boundary

P5-07D7 consumes one exact durable D6 plan and applies its complete Claim Asset replacement as a guarded canonical transaction.

It may add:

- strict application request and canonical receipt contracts;
- exact D6 plan, source decision, Claim version, registry, and complete-set guards;
- selected-row delete plus deterministic replacement-row insert;
- final complete proposed-set verification inside the transaction;
- private user-submission Source Record;
- record-level Claim Asset correction provenance;
- one corrected Verification Event;
- one durable Submission application receipt event;
- common application lifecycle transition to committed/pending;
- exact replay and post-canonical lifecycle recovery;
- separately authorized private/no-store POST API;
- focused tests, runtime audit, and boundary documentation.

It must not:

- accept a client-selected replacement tuple, arbitrary deletion, or generic patch;
- perform independent in-place `asset_id` or `network_id` updates;
- change Claim status, visibility, route, instructions, confirmation dates, restrictions, or scope;
- mutate registries, Entity, Location, Evidence, or Media;
- activate export or release;
- execute retention deletion;
- add a database migration;
- claim configured deployment.

## Next

Continue with P5-07E Business Claim payment/provenance/order completion after D7 is merged.

Location country/coordinate identity correction and generic-other classification remain separate later boundaries. Public export and release remain controlled by the existing publication lifecycle.

The later sequence remains P5-07E Business Claim payment/provenance/order completion, P5-07F Photos/Media reconciliation, P5-07G retention execution, and P5-07H cross-submission integration audit.

## Blocked

No repository blocker is known.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. If this file differs from GitHub reality, GitHub is authoritative and this file must be corrected in the next bounded pull request.

## Current references

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`
- `docs/P5_07A_CANONICAL_APPLICATION_RETENTION_INVENTORY.md`
- `docs/P5_07D1_PROBLEM_LOCATION_CORRECTION_APPLICATION.md`
- `docs/P5_07D2_NEGATIVE_RECHECK_APPLICATION.md`
- `docs/P5_07D3_REMAINING_CORRECTION_OWNER_AUDIT.md`
- `docs/P5_07D4_PROBLEM_CLAIM_INSTRUCTION_CORRECTION.md`
- `docs/P5_07D5_CLAIM_ASSET_SET_PREVIEW.md`
- `docs/P5_07D6_CLAIM_ASSET_REPLACEMENT_PLAN.md`
- `docs/P5_07D7_CLAIM_ASSET_REPLACEMENT_APPLICATION.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
