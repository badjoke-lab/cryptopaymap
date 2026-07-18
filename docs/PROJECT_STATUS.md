# CryptoPayMap project status

**Last verified:** 2026-07-18

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07D3 — Remaining Problem Report correction owner audit

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
- P5-07D3 is active on `p5-07d3-correction-owner-audit`.

## Latest verified main

```text
1fbda9429bea8c69000927b35491136fc60902e4
```

The final P5-07D2 implementation head passed:

- Foundation validation;
- Migration drift;
- Staging review validation;
- representative review screenshots.

Foundation validation included formatting, lint, Astro and TypeScript checks, runtime-schema checks, migration-history checks, all unit and component tests, static build, accessibility checks, and generated staging-artifact checks.

## Active pull request

```text
p5-07d3-correction-owner-audit — remaining correction owner audit
```

## Current boundary

P5-07D3 is an executable ownership audit. It fixes separate canonical boundaries for correction classes excluded from P5-07D1 without adding a mutation.

It may add:

- an explicit owner matrix for instructions, Claim Asset sets, Location identity, and generic-other handoffs;
- executable checks that prevent unsupported Problem application writes;
- a fixed P5-07D4 handoff for guarded Acceptance Claim `howToPay` correction;
- project-status and boundary documentation.

It must not:

- update Acceptance Claims, Claim Assets, Entities, Locations, Evidence, or Media;
- create a generic canonical patch mechanism;
- reuse the Business Claim field-application receipt for Problem Reports;
- add a database migration;
- transition common application state;
- activate export or release;
- execute retention deletion;
- claim configured deployment.

## Next

Implement P5-07D4 as a separately authorized, exact-state, replay-safe Acceptance Claim instruction correction transaction for approved `wrong_instructions` handoffs.

P5-07D4 must derive `howToPay` only from the retained approved Submission decision chain, create private user-submission source provenance, update only the exact Claim instruction field, bind a durable receipt to the common application lifecycle, and leave publication pending.

Asset/network set replacement, Location country/coordinate identity correction, and generic-other classification remain separate later owners.

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
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
