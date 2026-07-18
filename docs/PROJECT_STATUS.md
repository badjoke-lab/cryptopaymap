# CryptoPayMap project status

**Last verified:** 2026-07-18

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07D2 — Durable negative recheck application projection

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
- P5-07D2 is active in #249.

## Latest verified main

```text
ab43802ad14eea140ca3b3acf3ba42cf945ffd2e
```

The final P5-07D1 implementation head passed:

- Foundation validation;
- Migration drift;
- Staging review validation;
- representative review screenshots.

Foundation validation included formatting, lint, Astro and TypeScript checks, runtime-schema checks, migration-history checks, all unit and component tests, static build, accessibility checks, and generated staging-artifact checks.

## Active pull request

```text
#249 — P5-07D2: project durable negative recheck application signals
```

## Current boundary

P5-07D2 verifies the existing durable priority-recheck chain rather than creating a duplicate work-item table.

It may add:

- exact application, Submission event, Evidence, Claim, and resolving Verification Event validation;
- active or resolved priority-signal projection;
- reuse of protected reconfirmation queue priority semantics;
- bounded protected read authorization and API;
- focused tests, runtime checks, and documentation.

It must not:

- create a second recheck task or queue table;
- update Claim status, visibility, or `nextReviewAt`;
- mutate Evidence or Submission state;
- transition common application state;
- expose private Evidence, reviewer notes, contacts, or Submission payloads;
- activate export or release;
- execute retention deletion;
- claim configured deployment.

## Next

After P5-07D2, continue P5-07D with separately owned correction classes only where a safe canonical transaction exists. Asset, network, payment-instruction, country, coordinate, and generic-other corrections must not be forced through the practical Location correction owner.

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
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
