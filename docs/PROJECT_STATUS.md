# CryptoPayMap project status

**Last verified:** 2026-07-09

## Current phase

Phase 4 — Public core / MVP-A closure

## Current implementation item

P4-18E — Live review and Phase 5 handoff audit

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
- P4-18D administration workflow integration audit is repository-complete through D1 #143, D2 #144, D3 #145, D4 #146, and D5 closure inventory in the current handoff change.
- P4-18E is the active handoff gate before Phase 5.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

The deployment receipt must be checked whenever review-environment state matters. Do not assume that a repository merge is visible at the fixed URL until the receipt records the intended `main` commit.

## Required current references

Before starting or reviewing P4-18E work, read:

1. `docs/IMPLEMENTATION_PLAN.md`;
2. `docs/PHASE4_CLOSURE_PLAN.md`;
3. `docs/P4_18_D_ADMIN_INTEGRATION_AUDIT.md`;
4. `docs/P4_18_D4_PUBLICATION_RESTORE_AUDIT.md`;
5. `docs/P4_18_D5_CLOSURE_AND_ENVIRONMENT_INVENTORY.md`;
6. the public specification documents relevant to the live path under review.

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
7. P4-18D — administration workflow integration audit — Completed through #143, #144, #145, #146, and the D5 handoff change
8. P4-18E — live review and Phase 5 handoff audit — In progress

The authoritative scope and completion criteria are in `docs/PHASE4_CLOSURE_PLAN.md`. The environment-specific assignment matrix is in `docs/P4_18_D5_CLOSURE_AND_ENVIRONMENT_INVENTORY.md`.

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

Live migration application, Access allowlist configuration, representative live correction, live protected Audit appearance, and configured corrected-value release flow remain P4-18E verification items. Repository tests do not prove those live conditions.

## P4-18C completed boundary

P4-18C closed the fixed UI residual scope through C1, C2, and direct C3 final-artifact reconciliation:

- Mobile Places List cards were compacted while retaining status, category, locality, payment assets, networks, routes, freshness, map selection, and payment-detail access;
- the Mobile Menu moved from a sparse full-height drawer to a bounded two-column navigation panel while preserving focus, Escape, overlay, body-scroll, and active-page behavior;
- expanded mobile Place information now presents Location and Navigate followed immediately by `How to pay` and core payment metadata before long practical-profile content;
- Mobile Filters now include an explicit sticky completion action with live result count while retaining immediate application, Clear, zero-result recovery, Widen area, Include Stale, and existing desktop behavior;
- representative Methodology long-form mobile output was directly inspected with no material overflow, hidden interaction, or broken density/layout defect found;
- final direct review of the same latest artifact set found no material horizontal overflow or hidden primary interaction across the fixed five-item scope.

Screenshot workflow success was not used as a substitute for image inspection. The closure record is `docs/P4_18_C_UI_AUDIT.md`.

## P4-18D completed boundary

P4-18D closed the repository administration integration audit across:

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

D1 through D4 resolved or classified repository findings. D5 assigns every remaining environment-dependent check to P4-18E or explicit Launch work. Publication activation and release history are explicit non-UI protected boundaries. Restore contracts and workflow exist in the repository, but production restore persistence, invocation, R2 adapter wiring, durable restore Audit source, reconciliation runbook, and drills remain explicit Launch work and are not described as production-operational.

## P4-18E handoff

P4-18E is the active gate. It must use `docs/P4_18_D5_CLOSURE_AND_ENVIRONMENT_INVENTORY.md` and:

- verify the fixed review deployment receipt against intended `main`;
- verify or precisely mark unavailable the configured Access, allowlist, Functions environment, Neon migration, representative Admin path, candidate generation/upload/review, publication activation, release history, and Audit checks;
- run staging artifact validation;
- run representative screenshot capture and inspect the relevant images directly;
- classify every unavailable environment check precisely;
- keep Launch work assignments visible rather than treating them as repository-complete;
- confirm Phase 5 prerequisites before moving to P5-01.

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

Execute P4-18E live review and Phase 5 handoff audit. Do not move to P5-01 until the D5-assigned live-review checks are verified or precisely classified and the Phase 5 handoff gate is explicitly completed.

## Blocked

No known repository blocker.

Phase 5 remains blocked on P4-18E completion.

Production restore persistence, protected invocation, concrete R2 restore adapter wiring, durable restore Audit source, post-switch reconciliation runbook, and production restore drills remain explicit Launch work. They must not be represented as complete by repository tests.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active closure or phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected.
