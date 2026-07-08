# CryptoPayMap project status

**Last verified:** 2026-07-08

## Current phase

Phase 4 — Public core / MVP-A closure

## Current implementation item

P4-18B3 — Canonical persistence and public projection integration

## Current repository state

- Phase 3 administration and review repository work is complete through P3-12.
- Phase 4 public MVP-A surfaces are implemented.
- P4-17A through P4-17F Places recovery is completed, validated, and merged through pull request #122.
- Review deployment now follows `main` and updates the fixed review URL after merge through #123.
- Deployment receipts record the deployed `main` commit through #124.
- Representative desktop/mobile and interactive-state screenshot capture is merged through #125.
- Selected Place focus, marker presentation, and desktop selected-panel containment corrections are merged through #126.
- P4-18A tracking correction and closure inventory is completed through #127.
- P4-18B1 source and Candidate practical-profile contract is completed through #128.
- P4-18B2 Promotion editor and field provenance parity is completed through #130.
- P4-18B3 is active.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

The deployment receipt must be checked whenever review-environment state matters. Do not assume that a repository merge is visible at the fixed URL until the receipt records the intended `main` commit.

## Required current references

Before starting or reviewing P4-18 work, read:

1. `docs/IMPLEMENTATION_PLAN.md`;
2. `docs/PHASE4_CLOSURE_PLAN.md`;
3. the public specification documents relevant to the active item.

For P4-18B practical Place profile work also read:

1. `docs/PLACE_PUBLIC_PROFILE.md`;
2. `docs/PRACTICAL_PROFILE_DATA_MODEL_EXTENSION.md`;
3. `docs/DATA_MODEL.md`;
4. `docs/SOURCE_AND_LICENSE_POLICY.md`.

For Places UI work also read:

1. `docs/PLACES_UX_ACCEPTANCE.md`;
2. `docs/PLACES_RECOVERY_PLAN.md`;
3. `docs/PLACES_UX_FINAL_AUDIT.md`.

For Phase 5 preparation and submission work also read:

1. `docs/SUBMISSION_WORKFLOW.md`;
2. `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`;
3. `docs/DATA_MODEL.md`;
4. `docs/MEDIA_POLICY.md` when Media intake or review is affected.

## Active closure sequence

1. P4-18A — tracking correction and closure inventory — Completed through #127
2. P4-18B1 — source and Candidate practical-profile contract — Completed through #128
3. P4-18B2 — promotion editor and field provenance parity — Completed through #130
4. P4-18B3 — canonical persistence and public projection integration — In progress
5. P4-18B4 — existing-record practical-profile correction path audit and completion — Planned
6. P4-18C — bounded UI residual closure — Planned
7. P4-18D — administration workflow integration audit — Planned
8. P4-18E — live review and Phase 5 handoff audit — Planned

The authoritative scope and completion criteria are in `docs/PHASE4_CLOSURE_PLAN.md`.

## P4-18B1 completed boundary

P4-18B1 closed the private source-to-review path for supported practical Place fields:

```text
legacy or supported source value
    ↓
strict source-row validation
    ↓
raw and normalized source separation
    ↓
private Candidate review data
    ↓
allowlisted Candidate source snapshot
    ↓
protected Admin source review
```

The completed contract includes:

- supported legacy alias normalization without treating source values as canonical truth;
- phone, description, opening-hours text, amenities, and review-safe social links in private review data;
- deterministic exact-duplicate behavior for amenities and social-link review values;
- handle-only legacy social values preserved without fabricated URLs;
- malformed practical source values rejected fail closed;
- unknown/private source payload values excluded from Candidate detail responses;
- existing Candidate replay, duplicate-signal, source metadata, and effective-license boundaries preserved.

## P4-18B2 completed boundary

P4-18B2 connected the B1 practical profile review data to the protected new-target Promotion workspace and explicit field-level provenance:

- phone, description, opening-hours text, amenities, and official social-link controls are reviewer-visible;
- supported source values are prefilled without treating source data as canonical truth;
- handle-only and non-HTTPS social values remain visible as source-only review information rather than fabricated canonical URLs;
- amenities and social-link form values use deterministic parsing and normalization;
- malformed or duplicate canonical social-link values fail closed;
- non-empty practical Location values require explicit source assignments;
- assignments outside the exact Candidate source set are rejected;
- omitted or empty editor provenance plans are rejected before commit;
- Candidate version and complete source-set guards remain in force;
- Promotion continues to create hidden records without automatic verification or publication;
- existing-target linking remains bounded and does not become a practical-profile correction operation.

## P4-18B3 active boundary

P4-18B3 must audit and complete the end-to-end new-target path from approved Promotion values through canonical persistence and validated public projection.

At minimum verify and, where required, extend:

- canonical Location persistence for phone, description, opening hours, amenities, and structured social links;
- transaction replay and rollback behavior for the practical profile fields;
- field-level provenance persistence and audit history for those canonical writes;
- canonical-to-public projection allowlists and schemas;
- approved public Place detail, selected desktop panel, and expanded mobile sheet consumption of projected values;
- public/private leakage boundaries;
- malformed or noncanonical structured values failing closed before publication;
- regression coverage proving source review → Promotion → canonical write → public projection without bypassing verification or publication activation controls.

B3 must not broaden into the B4 existing-record correction transaction path.

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

Complete P4-18B3 canonical persistence and public projection integration. Move to P4-18B4 only after B3 is merged and tracking is updated.

## Blocked

No known repository blocker.

P4-18D and P4-18E must replace broad deferred-verification language with a precise inventory of environment-specific checks that were completed, could not be completed, or remain assigned to launch work.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active closure or phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected.
