# Phase 4 closure and operational parity plan

**Implementation item:** P4-18  
**Status:** Active  
**Last updated:** 2026-07-08

## Purpose

Phase 4 delivered the public MVP-A surfaces and the Places interaction recovery. Subsequent staging review, representative screenshot capture, and practical profile review exposed remaining work that must be closed before Phase 5 public submissions begin.

P4-18 is a bounded closure term. It does not reopen Phase 4 as an unlimited redesign cycle. Its purpose is to make the existing MVP-A operationally coherent across source review, canonical writes, provenance, public projection, administration, visual review, deployment review, and the Phase 5 handoff.

The required order is:

```text
P4-18A tracking and closure inventory
    ↓
P4-18B practical profile operational parity
    ↓
P4-18C bounded UI residual closure
    ↓
P4-18D administration workflow integration audit
    ↓
P4-18E live review and Phase 5 handoff audit
    ↓
Phase 5 public submissions / MVP-B
```

## Required references

Before P4-18 work, read:

1. `docs/PROJECT_STATUS.md`;
2. `docs/IMPLEMENTATION_PLAN.md`;
3. this document;
4. `docs/PLACE_PUBLIC_PROFILE.md` for practical Place fields;
5. `docs/DATA_MODEL.md` for source, review, canonical, provenance, and submission boundaries;
6. `docs/SUBMISSION_WORKFLOW.md` for the Phase 5 handoff;
7. `docs/PLACES_UX_ACCEPTANCE.md`, `docs/PLACES_RECOVERY_PLAN.md`, and `docs/PLACES_UX_FINAL_AUDIT.md` for Places interaction work.

Media-related work must also read `docs/MEDIA_POLICY.md`.

## Closure groundwork already merged

The following work is treated as P4-18 groundwork rather than as completion of the remaining closure term:

- review deployment follows `main` and updates the fixed review URL after merge;
- deployment receipts record which `main` commit is deployed to the fixed review URL;
- representative GitHub Actions screenshot capture covers desktop and mobile pages plus interactive states;
- staging review data exercises a practical Place profile including address, phone, website, social link, description, hours, amenities, and Gallery Media;
- selected Place focus, selected marker presentation, mobile sheet stacking, horizontal overflow, and desktop selected-panel containment were corrected through the latest merged review cycle.

These foundations make later audits observable. They do not replace the operational parity and integration checks below.

---

## P4-18A — Tracking correction and closure inventory

### Goal

Make repository tracking match current `main`, record the bounded closure term, and establish the documents that later P4-18 work must use.

### Required work

- synchronize `docs/IMPLEMENTATION_PLAN.md` with merged work through the current `main`;
- synchronize `docs/PROJECT_STATUS.md` with the active P4-18 item;
- record P4-18A through P4-18E and their dependencies;
- split Phase 5 into bounded implementation items with explicit ordering;
- record representative screenshot capture as a required visual-review instrument for affected public UI changes;
- record practical Place operational parity as a full-path requirement, not a schema-only requirement;
- correct specification drift discovered during the closure inventory.

### Completion criteria

- current state and next item are unambiguous;
- P4-18 and Phase 5 IDs are stable;
- every later P4-18 PR can identify its required references and completion boundary;
- no private planning material is copied into the public repository.

---

## P4-18B — Practical profile operational parity

### Goal

Make practical Place information operable through the full reviewed data path before public submissions can propose or correct those fields.

The practical profile set is:

- address and locality fields;
- phone;
- website;
- description;
- opening hours;
- amenities;
- structured social links.

Payment Claims, Evidence, and Media remain separate models and must not be collapsed into the practical profile.

### Full-path rule

A practical field is not operationally complete merely because a database column or public schema exists.

Completion requires a traceable path where applicable:

```text
source observation or submission
    ↓
safe normalized review snapshot
    ↓
Candidate or proposed-change review
    ↓
reviewer-visible field value
    ↓
explicit field source or correction provenance
    ↓
atomic canonical create or update operation
    ↓
public projection allowlist
    ↓
runtime schema and leakage validation
    ↓
staging review fixture
    ↓
public Place surfaces
```

No source observation, Candidate value, or submission value may update public canonical fields automatically.

### P4-18B1 — Source and Candidate profile contract

Verify and, where needed, extend:

- physical-place source snapshot schemas;
- Candidate detail safe projection;
- normalization rules for arrays and structured social links;
- source and license attribution boundaries;
- duplicate and malformed-value behavior;
- compatibility with legacy source records without treating legacy values as current truth.

Completion requires representative tests for populated, absent, malformed, duplicate, and private-value cases.

### P4-18B2 — Promotion editor and field provenance

Verify and, where needed, extend both new-target and existing-target review paths so reviewers can intentionally handle the practical profile fields.

Required properties:

- reviewer-visible inputs or explicit review decisions for supported practical fields;
- safe normalization of hours, amenities, and social links;
- field-level source assignment for non-empty reviewed factual values;
- exact Candidate version and source-set guards remain in force;
- promotion remains hidden and does not verify or publish Claims;
- no fallback that silently assigns all sources to fields when field-level review is required.

### P4-18B3 — Canonical persistence and public projection integration

Verify the complete create path from reviewed field input to canonical persistence and then to public projection.

Required checks:

- atomic persistence;
- replay and conflict behavior;
- field provenance rows;
- public allowlisting;
- strict schema validation;
- leakage rejection;
- absence semantics;
- staging artifact coverage;
- desktop selected panel, mobile expanded sheet, and canonical Place detail presentation.

### P4-18B4 — Existing-record correction path audit

Audit how an already canonical Place receives reviewed practical profile corrections.

At minimum consider:

- address correction;
- phone change or removal;
- website change or removal;
- opening-hours change;
- amenities addition, removal, and replacement;
- social-link addition, removal, and replacement;
- description correction.

The audit must determine whether an existing safe canonical update transaction already satisfies the requirements. Missing operations must be implemented before P4-18B is complete.

Required properties:

- exact current-version guards;
- field-level diff;
- correction provenance;
- reviewer decision record;
- idempotent replay;
- conflict on stale review state;
- no publication before the normal public export and release boundary.

---

## P4-18C — Bounded UI residual closure

### Goal

Close the material UI issues already visible in representative screenshots without reopening an unlimited redesign phase.

### Fixed scope

1. Mobile Places List compactness and scanability;
2. Mobile Menu density and use of screen area;
3. mobile expanded-sheet information order and access to payment instructions;
4. Filters completion, clear, zero-result, and Map/List behavior;
5. only material density or layout defects on representative long-form public pages.

Fine-grained visual preference changes discovered later may be handled as bounded follow-up fixes. They do not keep P4-18C open indefinitely.

### Visual review requirement

Affected UI PRs must run and inspect the representative screenshot workflow, including the relevant interactive states. A green capture job proves that screenshots were produced; it does not by itself prove visual acceptance. The PR review must inspect the relevant images and record material findings.

### Completion criteria

- no known material horizontal overflow or hidden interactive surface;
- Mobile List remains useful at realistic result counts;
- Menu and Filters use bounded mobile space coherently;
- expanded Place details make practical and payment-critical information reachable without confusing responsibility overlap;
- representative affected screenshots have been reviewed.

---

## P4-18D — Administration workflow integration audit

### Goal

Verify the protected administration workflow as an operator journey rather than as a collection of isolated repository-complete components.

### Required journey

```text
Candidate queue
    ↓
Candidate detail and source provenance
    ↓
duplicate review when applicable
    ↓
new-target promotion or existing-target linking
    ↓
Evidence review and Claim transition
    ↓
recheck / reconfirmation workflow
    ↓
Media review
    ↓
private export candidate review
    ↓
release decision
    ↓
publication activation
    ↓
release history / restore boundary
    ↓
Audit history
```

### Audit categories

- route reachability and navigation;
- Access capability mapping;
- protected API request and response compatibility;
- current database migration assumptions;
- stale explanatory copy or impossible controls;
- version, source-set, and accepted-Evidence guards;
- replay and conflict behavior;
- failure and retry states;
- publication and restore boundaries;
- audit visibility without private payload leakage.

The known stale Admin Home description must be corrected as part of this audit.

### Completion criteria

- every implemented operation has a reachable and accurate operator path or is explicitly documented as a non-UI boundary;
- stale descriptions do not contradict implemented capability;
- unresolved live-environment dependencies are explicit and assigned to P4-18E or a later launch item;
- no repository-only test result is mislabeled as live verification.

---

## P4-18E — Live review and Phase 5 handoff audit

### Goal

Close Phase 4 only after repository validation, deployed review observability, representative UI review, practical profile parity, and administration integration have been reconciled.

### Required checks

- fixed review URL deployment receipt matches the intended `main` commit;
- staging review artifact validates;
- representative screenshot capture succeeds and relevant images are inspected;
- practical profile create and correction paths satisfy P4-18B;
- public projection and leakage checks pass;
- protected administration flow has been reviewed to the extent supported by the configured environment;
- live-only checks that cannot be performed are enumerated precisely rather than hidden behind a generic deferred-verification label;
- Phase 5 prerequisites are confirmed.

### Phase 5 handoff gate

Phase 5 implementation may begin only when:

1. P4-18B practical profile operational parity is complete;
2. P4-18C material UI residuals are closed;
3. P4-18D administration integration findings are resolved or explicitly assigned;
4. P4-18E records the remaining live-only launch risks;
5. `docs/PROJECT_STATUS.md` moves to P5-01.

---

## Phase 5 handoff sequence

After P4-18E, the implementation order is:

1. P5-01 — Shared submission foundation;
2. P5-02 — Suggest Place and Online Service;
3. P5-03 — Payment and problem reports;
4. P5-04 — Business and service claims;
5. P5-05 — Photo and Media submission intake;
6. P5-06 — Review workflow extensions;
7. P5-07 — Canonical application transactions and retention;
8. P5-08 — MVP-B integration audit.

The detailed public submission behavior remains governed by `docs/SUBMISSION_WORKFLOW.md`. This sequence controls repository implementation order; it does not weaken any privacy, evidence, verification, Media, or publication boundary.
