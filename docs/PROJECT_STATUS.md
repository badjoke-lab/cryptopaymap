# CryptoPayMap project status

**Last verified:** 2026-07-08

## Current phase

Phase 4 — Public core / MVP-A closure

## Current implementation item

P4-18D — Administration workflow integration audit

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
- P4-18B3 canonical persistence and public projection integration repository work is completed through #132 and #133, with closure tracking and B4 handoff through #134.
- P4-18B4 existing-record practical-profile correction path is repository-complete through #135, #136, #137, and #138.
- P4-18C bounded UI residual closure is completed through #139, #141, and #142, with direct final-artifact visual review recorded in `docs/P4_18_C_UI_AUDIT.md`.
- P4-18D is active.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

The deployment receipt must be checked whenever review-environment state matters. Do not assume that a repository merge is visible at the fixed URL until the receipt records the intended `main` commit.

## Required current references

Before starting or reviewing P4-18 work, read:

1. `docs/IMPLEMENTATION_PLAN.md`;
2. `docs/PHASE4_CLOSURE_PLAN.md`;
3. the public specification documents relevant to the active item.

For practical Place profile work also read:

1. `docs/PLACE_PUBLIC_PROFILE.md`;
2. `docs/PRACTICAL_PROFILE_DATA_MODEL_EXTENSION.md`;
3. `docs/P4_18_B3_AUDIT.md` for the completed new-target projection boundary;
4. `docs/P4_18_B4_AUDIT.md` for the completed existing-record correction boundary;
5. `docs/DATA_MODEL.md`;
6. `docs/SOURCE_AND_LICENSE_POLICY.md`.

For Places UI work read:

1. `docs/PLACES_UX_ACCEPTANCE.md`;
2. `docs/PLACES_RECOVERY_PLAN.md`;
3. `docs/PLACES_UX_FINAL_AUDIT.md`;
4. `docs/P4_18_C_UI_AUDIT.md` for the completed bounded residual closure.

For Phase 5 preparation and submission work also read:

1. `docs/SUBMISSION_WORKFLOW.md`;
2. `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`;
3. `docs/DATA_MODEL.md`;
4. `docs/MEDIA_POLICY.md` when Media intake or review is affected.

## Active closure sequence

1. P4-18A — tracking correction and closure inventory — Completed through #127
2. P4-18B1 — source and Candidate practical-profile contract — Completed through #128
3. P4-18B2 — promotion editor and field provenance parity — Completed through #130
4. P4-18B3 — canonical persistence and public projection integration — Completed through #132, #133, and #134
5. P4-18B4 — existing-record practical-profile correction path audit and completion — Completed through #135, #136, #137, and #138
6. P4-18C — bounded UI residual closure — Completed through #139, #141, and #142
7. P4-18D — administration workflow integration audit — In progress
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

## P4-18B3 completed boundary

P4-18B3 closed the repository-owned new-target practical Place path through canonical persistence and validated public Place projection.

Repository coverage includes:

- atomic practical-profile persistence and rollback behavior;
- replay and changed-content conflict behavior;
- field-level practical-profile provenance expansion;
- explicit allowlisted canonical Place projection;
- strict canonical and public runtime validation;
- private-extra-field exclusion and leakage checks;
- optional-field absence semantics;
- malformed structured social-link rejection;
- public Place provenance aggregation from resolved source metadata and field-level provenance rows;
- Promotion-preserved practical values through hidden canonical state, hidden projection rejection, explicit public state, public provenance aggregation, public Place projection, and Place artifact validation;
- practical profile presentation on canonical Place detail;
- practical profile consumption by desktop selected panel and mobile expanded sheet;
- built staging Place detail coverage for description, hours, amenities, phone, official social link, and Media.

The repository release-review path begins from an already generated private candidate bundle. The configured canonical query → complete twelve-artifact candidate generation → private upload → release-review path is an environment-specific verification item assigned precisely to P4-18E. Repository tests do not prove that live path.

## P4-18B4 completed boundary

P4-18B4 closed the repository path for reviewed practical-profile corrections on already canonical Places without widening existing-target Candidate linking.

Repository coverage includes:

- bounded scalar and structured correction semantics;
- exact changed-field correction provenance;
- deterministic replay, changed-content conflict, stale-state conflict, no-op rejection, and rollback coverage;
- durable reviewer decisions with exact expected Location version, before/after values, source set, field assignments, reasons, and request fingerprint;
- atomic Location update, current correction provenance maintenance, and durable decision persistence;
- protected Candidate-source-set and canonical-Location workspace binding;
- dedicated correction subject allowlist and UUID idempotency key;
- Candidate-version, Location-version, exact-source-set, and eligibility revalidation immediately before write;
- reviewer controls for scalar set/clear and Amenities/Social Link add/remove/replace/clear operations;
- explicit navigation from selected physical existing-target review to the separate correction workspace;
- metadata-only protected Audit history normalization of durable correction decisions;
- operator reachability, conflict, unavailable, and retry recovery coverage;
- built artifact checks for the correction admin page and server-only marker leakage.

Live migration application, Access allowlist configuration, representative live correction, live protected Audit appearance, and configured corrected-value release flow remain environment-specific P4-18D/E verification items. Repository tests do not prove those live conditions.

## P4-18C completed boundary

P4-18C closed the fixed UI residual scope through C1, C2, and direct C3 final-artifact reconciliation:

- Mobile Places List cards were compacted while retaining status, category, locality, payment assets, networks, routes, freshness, map selection, and payment-detail access;
- the Mobile Menu moved from a sparse full-height drawer to a bounded two-column navigation panel while preserving focus, Escape, overlay, body-scroll, and active-page behavior;
- expanded mobile Place information now presents Location and Navigate followed immediately by `How to pay` and core payment metadata before long practical-profile content;
- Mobile Filters now include an explicit sticky completion action with live result count while retaining immediate application, Clear, zero-result recovery, Widen area, Include Stale, and existing desktop behavior;
- representative Methodology long-form mobile output was directly inspected with no material overflow, hidden interaction, or broken density/layout defect found;
- final direct review of the same latest artifact set found no material horizontal overflow or hidden primary interaction across the fixed five-item scope.

Screenshot workflow success was not used as a substitute for image inspection. The closure record is `docs/P4_18_C_UI_AUDIT.md`.

## P4-18D active scope

P4-18D audits real operator journeys and cross-workspace integration across:

- Candidate queue and detail;
- duplicate review and identity resolution;
- new-target Promotion;
- existing-target linking;
- separate Location correction;
- Evidence review and Claim decisions;
- reconfirmation queue and expiration behavior;
- Media review;
- export candidate, release decision, activation, history, and restore boundaries;
- protected Audit history coverage;
- conflict, retry, replay, rollback, and operator-reachability behavior.

P4-18D must distinguish repository evidence from environment-specific verification. Every live-only check must be classified precisely as completed, unavailable, or assigned to P4-18E/launch work. Broad deferred-verification language is not sufficient.

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

Execute P4-18D administration workflow integration audit. Do not move to P4-18E until operator journeys, cross-workspace boundaries, retry/conflict behavior, Audit coverage, and environment-specific check inventory are reconciled.

## Blocked

No known repository blocker.

P4-18D/E must verify or classify the environment-specific B4 checks recorded in `docs/P4_18_B4_AUDIT.md`.

P4-18E must explicitly verify or classify the configured canonical query, full candidate generation, private candidate upload, and release-review handoff path recorded by the B3 audit. If that path is absent, it must be treated as an explicit launch blocker or assigned launch work rather than hidden by generic deferred-verification language.

P4-18D and P4-18E must replace broad deferred-verification language with a precise inventory of environment-specific checks that were completed, could not be completed, or remain assigned to launch work.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active closure or phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected.
