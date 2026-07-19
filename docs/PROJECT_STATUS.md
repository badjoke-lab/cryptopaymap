# CryptoPayMap project status

**Last verified:** 2026-07-19

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07D6 — Durable Claim Asset row-selection and complete replacement plan

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
- P5-07D6 is active on `p5-07d6-claim-asset-replacement-plan`.

## Latest verified main

```text
4a109b9013eae05b3b26aba2df82b3f4176bc402
```

The final P5-07D5 implementation head passed:

- Foundation validation;
- Migration drift;
- Staging review validation;
- representative review screenshots.

Foundation validation included formatting, lint, Astro and TypeScript checks, the D5 runtime audit, migration-history checks, all unit and component tests, static build, accessibility checks, and generated staging-artifact checks.

## Active pull request

```text
p5-07d6-claim-asset-replacement-plan — Durable Claim Asset replacement plan
```

## Current boundary

P5-07D6 records one private, replayable complete-set replacement plan for an exact approved `wrong_asset` or `wrong_network` application.

It may add:

- strict automatic-single-row and reviewed-multi-row selection requests;
- exact application, Claim, decision-event, and current-set expectations;
- server-derived deterministic replacement rows;
- complete private current and proposed sets with stable hashes;
- an application-scoped advisory transaction guard;
- one durable private Submission plan event;
- exact replay and changed-content conflict handling;
- separately authorized private/no-store POST API;
- focused tests, runtime audit, and boundary documentation.

It must not:

- mutate Claim Assets or any canonical row;
- accept a client-selected replacement tuple or deletion;
- create Source Records, provenance, Verification Events, or application receipts;
- transition common application state;
- add a database migration;
- activate export or release;
- execute retention deletion;
- claim configured deployment.

## Next

Implement P5-07D7 as the exact atomic complete Claim Asset set replacement owner for one durable D6 plan.

D7 must guard the application, plan event, Claim version, complete current set, registries, replacement row, and proposed hash; create private source and row-level provenance; replace the set atomically; add one corrected Verification Event and durable application receipt; and support exact replay plus post-canonical lifecycle recovery. Publication remains pending.

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
- `docs/P5_07D5_CLAIM_ASSET_SET_PREVIEW.md`
- `docs/P5_07D6_CLAIM_ASSET_REPLACEMENT_PLAN.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
