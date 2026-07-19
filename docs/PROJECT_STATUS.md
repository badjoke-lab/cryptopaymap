# CryptoPayMap project status

**Last verified:** 2026-07-18

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07D5 — Claim Asset set replacement preview

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
- P5-07D5 is active on `p5-07d5-claim-asset-set-preview`.

## Latest verified main

```text
36238aaf18cc327b2f40cb426b08e7d321adc0f1
```

The final P5-07D4 implementation head passed:

- Foundation validation;
- Migration drift;
- Staging review validation;
- representative review screenshots.

Foundation validation included formatting, lint, Astro and TypeScript checks, the D4 runtime audit, migration-history checks, all unit and component tests, static build, accessibility checks, and generated staging-artifact checks.

## Active pull request

```text
p5-07d5-claim-asset-set-preview — Claim Asset set replacement preview
```

## Current boundary

P5-07D5 is a protected read-only planning boundary for exact approved `wrong_asset` and `wrong_network` handoffs.

It may add:

- strict application, Submission, decision-event, projection, Claim, and Claim Asset set validation;
- exact active Asset, Network, and Payment Method registry projection;
- reuse of existing Claim Asset publication prerequisites;
- stable complete-set hashes;
- deterministic single-row replacement proposal;
- explicit `needs_selection` for multi-row Claims;
- exact-subject read authorization and private/no-store GET API;
- focused tests, runtime audit, and boundary documentation.

It must not:

- mutate Claim Assets or any canonical row;
- guess a target row in a multi-row Claim;
- accept a client-selected replacement tuple;
- create Source Records, provenance, Verification Events, or application receipts;
- transition common application state;
- add a database migration;
- activate export or release;
- execute retention deletion;
- claim configured deployment.

## Next

Implement P5-07D6 as the durable row-selection and complete replacement-plan boundary.

D6 must preserve the exact current set hash, selected current row, deterministic replacement row, complete proposed set hash, registry identities, payment method, optional contract, primary flag, notes, Claim version, application version, and source decision event. It must support the automatic single-row plan and an explicitly reviewed multi-row selection without allowing arbitrary client-selected tuples.

Canonical Claim Asset set replacement remains deferred until the durable plan is fixed. Location country/coordinate identity correction and generic-other classification remain separate later boundaries.

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
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
