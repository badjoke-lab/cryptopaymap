# CryptoPayMap project status

**Last verified:** 2026-07-08

## Current phase

Phase 4 — Public core / MVP-A closure

## Current implementation item

P4-18A — Tracking correction and closure inventory

## Current repository state

- Phase 3 administration and review repository work is complete through P3-12.
- Phase 4 public MVP-A surfaces are implemented.
- P4-17A through P4-17F Places recovery is completed, validated, and merged through pull request #122.
- Review deployment now follows `main` and updates the fixed review URL after merge through #123.
- Deployment receipts record the deployed `main` commit through #124.
- Representative desktop/mobile and interactive-state screenshot capture is merged through #125.
- Selected Place focus, marker presentation, and desktop selected-panel containment corrections are merged through #126.
- P4-18 is the active bounded closure term before Phase 5 public submissions.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

Latest verified deployment receipt at the start of P4-18A:

`49d68be44cf453d5fa50315c0bd933352ad05fbf`

The receipt records that the fixed review URL was deployed from that `main` commit. Later P4-18 work must verify the current receipt rather than assuming the URL is current.

## Required current references

Before starting or reviewing P4-18 work, read:

1. `docs/IMPLEMENTATION_PLAN.md`;
2. `docs/PHASE4_CLOSURE_PLAN.md`;
3. the public specification documents relevant to the active item.

For Places work also read:

1. `docs/PLACES_UX_ACCEPTANCE.md`;
2. `docs/PLACES_RECOVERY_PLAN.md`;
3. `docs/PLACES_UX_FINAL_AUDIT.md`;
4. `docs/PLACE_PUBLIC_PROFILE.md` when practical Place information is affected.

For Phase 5 preparation and submission work also read:

1. `docs/SUBMISSION_WORKFLOW.md`;
2. `docs/DATA_MODEL.md`;
3. `docs/MEDIA_POLICY.md` when Media intake or review is affected.

## Active closure sequence

1. P4-18A — tracking correction and closure inventory — In progress
2. P4-18B1 — source and Candidate practical-profile contract — Planned
3. P4-18B2 — promotion editor and field provenance parity — Planned
4. P4-18B3 — canonical persistence and public projection integration — Planned
5. P4-18B4 — existing-record practical-profile correction path audit and completion — Planned
6. P4-18C — bounded UI residual closure — Planned
7. P4-18D — administration workflow integration audit — Planned
8. P4-18E — live review and Phase 5 handoff audit — Planned

The authoritative scope and completion criteria are in `docs/PHASE4_CLOSURE_PLAN.md`.

## Known P4-18B operational parity gap

The practical Place profile schema and persistence layer support reviewed fields including description, opening hours, amenities, and structured social links. The closure inventory found that the protected promotion form and field-source selection path do not yet provide complete operator handling and provenance coverage for the entire practical profile set.

P4-18B must trace and close the complete path:

```text
source observation or submission
    ↓
safe review projection
    ↓
reviewer-visible field value
    ↓
field provenance
    ↓
canonical create or correction transaction
    ↓
public projection
    ↓
validation and leakage checks
    ↓
staging review
    ↓
public surfaces
```

A schema column or display fixture alone does not complete operational parity.

## P4-18C bounded UI residual scope

The remaining scheduled UI closure scope is limited to:

- Mobile Places List compactness and scanability;
- Mobile Menu density;
- expanded-sheet information order and access to payment-critical information;
- Filters completion, clear, zero-result, and Map/List behavior;
- only material density or layout defects on representative long-form public pages.

Representative screenshot capture is now a standard review instrument. A successful capture job does not replace image inspection.

Small later visual findings may be handled as bounded fixes and do not keep P4-18C open indefinitely.

## Phase 5 handoff

Phase 5 does not begin until P4-18E completes the handoff and this status file moves to P5-01.

Planned Phase 5 order:

1. P5-01 — Shared submission foundation
2. P5-02 — Suggest Place and Online Service
3. P5-03 — Payment and problem reports
4. P5-04 — Business and service claims
5. P5-05 — Photo and Media submission intake
6. P5-06 — Review workflow extensions
7. P5-07 — Canonical application transactions and retention
8. P5-08 — MVP-B integration audit

## Next

Complete P4-18A documentation and tracking synchronization, merge it, then begin P4-18B1 from the updated reference set.

## Blocked

No known repository blocker.

P4-18D and P4-18E must replace broad deferred-verification language with a precise inventory of environment-specific checks that were completed, could not be completed, or remain assigned to launch work.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active closure or phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected.
