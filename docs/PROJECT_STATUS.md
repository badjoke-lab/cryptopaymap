# CryptoPayMap project status

**Last verified:** 2026-07-18

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07D4 — Problem Report Claim instruction correction application

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
- P5-07D4 is active on `p5-07d4-claim-instruction-correction`.

## Latest verified main

```text
4f98ac2352bc54d3431c96ef6bf07aeaa8a3949c
```

The final P5-07D3 implementation head passed:

- Foundation validation;
- Migration drift;
- Staging review validation;
- representative review screenshots.

Foundation validation included formatting, lint, Astro and TypeScript checks, the P5-07D3 runtime ownership audit, migration-history checks, all unit and component tests, static build, accessibility checks, and generated staging-artifact checks.

## Active pull request

```text
p5-07d4-claim-instruction-correction — Claim instruction correction application
```

## Current boundary

P5-07D4 applies only an exact approved `wrong_instructions` handoff to one non-deleted `confirmed` or `stale` Acceptance Claim.

It may add:

- server-derived `howToPay` correction from the retained decision chain;
- deterministic private user-submission Source Record;
- field-level correction provenance for `acceptance_claim / howToPay`;
- one `corrected` Verification Event;
- one strict durable Submission application receipt event;
- exact replay and post-canonical application-lifecycle recovery;
- separately authorized private/no-store API;
- focused tests, runtime checker, and boundary documentation.

It must not:

- accept a client-selected Claim or instruction value;
- change Claim status, visibility, confirmation dates, or review deadline;
- change route, processor, restrictions, or acceptance scope;
- mutate Claim Assets, Entity, Location, Evidence, or Media;
- apply asset, network, country, coordinate, or generic-other corrections;
- activate export or release;
- execute retention deletion;
- claim configured deployment.

## Next

Design the complete Claim Asset set replacement owner for reviewed asset and network correction handoffs.

That later owner must validate full before/after tuples, Asset and Network registries, payment method, optional contract, primary-row uniqueness, exact Claim version, and row-level provenance. It must not perform independent in-place `asset_id` or `network_id` edits.

Location country/coordinate identity correction and generic-other classification remain separate later boundaries.

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
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
