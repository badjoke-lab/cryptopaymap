# CryptoPayMap project status

**Last verified:** 2026-07-08

## Current phase

Phase 4 — Public core / MVP-A closure

## Current implementation item

P4-18B1 — Source and Candidate practical-profile contract

## Current repository state

- Phase 3 administration and review repository work is complete through P3-12.
- Phase 4 public MVP-A surfaces are implemented.
- P4-17A through P4-17F Places recovery is completed, validated, and merged through pull request #122.
- Review deployment now follows `main` and updates the fixed review URL after merge through #123.
- Deployment receipts record the deployed `main` commit through #124.
- Representative desktop/mobile and interactive-state screenshot capture is merged through #125.
- Selected Place focus, marker presentation, and desktop selected-panel containment corrections are merged through #126.
- P4-18A tracking correction and closure inventory is completed through #127.
- P4-18B1 is active.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

Latest verified deployment receipt before P4-18B1 implementation:

`49d68be44cf453d5fa50315c0bd933352ad05fbf`

Later P4-18 work must verify the current receipt rather than assume that the URL is current.

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
2. P4-18B1 — source and Candidate practical-profile contract — In progress
3. P4-18B2 — promotion editor and field provenance parity — Planned
4. P4-18B3 — canonical persistence and public projection integration — Planned
5. P4-18B4 — existing-record practical-profile correction path audit and completion — Planned
6. P4-18C — bounded UI residual closure — Planned
7. P4-18D — administration workflow integration audit — Planned
8. P4-18E — live review and Phase 5 handoff audit — Planned

The authoritative scope and completion criteria are in `docs/PHASE4_CLOSURE_PLAN.md`.

## P4-18B1 current audit finding

The practical Place profile schema and persistence layer support reviewed fields including description, opening hours, amenities, and structured social links, but the legacy physical-place import and Candidate source snapshot contract currently omit several of those practical source values.

P4-18B1 must close the private source-to-review path without crossing into Promotion or canonical mutation work:

```text
legacy or supported source value
    ↓
strict source-row validation
    ↓
normalized immutable source record
    ↓
private Candidate review data
    ↓
allowlisted Candidate source snapshot
    ↓
protected Admin source review
```

Required P4-18B1 properties:

- preserve raw source material separately from normalized review values;
- normalize supported legacy aliases without treating them as canonical truth;
- define deterministic amenity duplicate behavior;
- define review-safe structured social-link behavior;
- preserve handle-only legacy social values without inventing public URLs;
- reject malformed practical-profile values safely;
- keep private or unknown source payload fields out of Candidate detail responses;
- preserve effective source/license metadata behavior;
- retain existing duplicate Candidate and replay behavior.

Promotion editor inputs, field provenance assignment, canonical persistence, and existing-record correction remain P4-18B2 through P4-18B4.

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

Complete P4-18B1 source/import, normalized review data, Candidate safe snapshot, Admin source presentation, and regression coverage. Then move to P4-18B2 only after B1 is merged and tracking is updated.

## Blocked

No known repository blocker.

P4-18D and P4-18E must replace broad deferred-verification language with a precise inventory of environment-specific checks that were completed, could not be completed, or remain assigned to launch work.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active closure or phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected.
