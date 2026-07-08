# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-07-08

This file tracks repository implementation work. GitHub main, merged pull requests, and CI are authoritative when this file differs from repository reality.

## Rules

- Implementation item IDs are independent of pull request numbers.
- Candidate, canonical, and public-export layers remain separate.
- Each pull request has one primary responsibility and explicit completion checks.
- Live environment verification may be deferred only when the exact deferred check is recorded.
- Public product Roadmap and repository implementation status are separate documents.
- Phase 4 closure work must read `docs/PHASE4_CLOSURE_PLAN.md`.
- Places work must read `docs/PLACES_UX_ACCEPTANCE.md`, `docs/PLACES_RECOVERY_PLAN.md`, and `docs/PLACES_UX_FINAL_AUDIT.md` before implementation or review.
- Practical Place profile work must also read `docs/PLACE_PUBLIC_PROFILE.md` and trace the complete operational path defined by P4-18B.
- A narrow pull-request description does not supersede the complete Places acceptance or active closure contract.
- Phase 5 implementation does not begin before the P4-18E handoff gate is complete.

## Phase 0 — Public specifications and development control

**Status:** Completed

| ID | Item | Pull request |
|---|---|---|
| P0-01 | Development control | #1 |
| P0-02 | Product constitution | #3 |
| P0-03 | Information architecture | #4 |
| P0-04 | Data architecture | #5 |
| P0-05 | Verification, sources, and licenses | #6 |
| P0-06 | Submission and media policies | #7 |
| P0-07 | Technical, UX, security, and privacy architecture | #8 |
| P0-08 | Operations, migration, launch, and public roadmap | #9 |

## Phase 1 — Foundation

**Status:** Repository work completed; remaining live checks are tracked by later integration and launch items

| ID | Item | Status | Pull request |
|---|---|---|---|
| P1-01 | Repository and application foundation | Completed | #11 |
| P1-02 | Design tokens and responsive application shell | Completed | #12 |
| P1-03 | Reusable UI primitives and interaction states | Completed | #13 |
| P1-04 | Motion and reduced-motion behavior | Completed | #14 |
| P1-05 | Query, UI, and URL-state boundaries | Completed | #15 |
| P1-06 | Runtime schemas and migration foundation | Completed | #16 |
| P1-07 | CI and test foundation | Completed | #17 |
| P1-08 | Cloudflare staging contract | Completed | #18 |
| P1-09 | PWA manifest and installability baseline | Completed | #19 |
| P1-10 | Accessibility baseline | Completed | #20 |
| P1-11 | Public Roadmap and Changelog loaders | Completed | #21 |
| P1-12 | Integration and quality audit | Repository completed | #22, #23 |

## Phase 2 — Data core

**Status:** Completed

| ID | Item | Pull request |
|---|---|---|
| P2-01 / P2-02 | Asset and network registries | #24 |
| P2-03 | Payment method and route registries | #25 |
| P2-04 | Entity and location schema | #26 |
| P2-05 | Acceptance claim schema and status rules | #29 |
| P2-06 | Claim asset and network combinations | #30 |
| P2-07 | Evidence schema and source capture | #31 |
| P2-08 | Verification event history | #32 |
| P2-09 | Source candidates, provenance, and duplicate boundaries | #34 |
| P2-10 | Media metadata and legacy identifiers | #35, #37 |
| P2-11 | Public export schemas | #36 |
| P2-12 | Export allowlist and leakage validator | #38 |
| P2-13 | Physical-place candidate importer | #39 |
| P2-14 | Online-service importer and Phase 2 audit | #40 |

Phase 2 keeps imported records private, preserves source and license provenance, produces no automatic Confirmed records, and only allows reviewed eligible data into validated public artifacts.

## Phase 3 — Administration and review

**Status:** Repository completed; P4-18D/E will reconcile remaining integration and environment checks

| ID | Item | Status | Depends on | Pull request |
|---|---|---|---|---|
| P3-01 | Admin data-access and transaction foundation | Completed | Phase 2 | #41 |
| P3-02 | Protected admin shell and access contract | Completed | P3-01 | #42 |
| P3-03 | Dashboard and operational queue summaries | Completed | P3-01, P3-02 | #43 |
| P3-04 | Candidate queue | Completed | P3-01, P3-02 | #44 |
| P3-05 | Candidate detail and provenance review | Completed | P3-04 | #45 |
| P3-06 | Duplicate review and identity resolution | Completed | P3-05 | #46, #47 |
| P3-07 | Claim editor and canonical promotion | Completed | P3-05, P3-06 | #48, #49, #51–#58 |
| P3-08 | Evidence review and verification decisions | Completed | P3-07 | #59, #60, #62, #63 |
| P3-09 | Status transitions and reconfirmation queue | Completed | P3-07, P3-08 | #64–#67 |
| P3-10 | Media review | Completed | P3-02, P2-10 | #69–#74 |
| P3-11 | Export controls and release workflow | Repository completed | P3-07 through P3-10 | #75–#87 |
| P3-12 | Audit history and Phase 3 integration audit | Completed | P3-01 through P3-11 | #88, #89, #92–#95 |

### Phase 3 result

Phase 3 established protected Candidate review, duplicate resolution, new-target promotion, existing-target linking, field-level provenance, Evidence decisions, Claim transitions, reconfirmation queues, Media review, export release decisions, publication activation, release history, restore boundaries, and cross-domain Audit history.

Repository-complete components remain subject to the P4-18D operator-journey audit and the P4-18E environment-specific handoff checks. A repository test result must not be described as a live environment verification result.

## Phase 4 — Public core / MVP-A and closure

**Status:** MVP-A public surfaces are merged; P4-18 closure is active

| ID | Item | Status | Depends on | Pull request |
|---|---|---|---|---|
| P4-01 | Place detail | Completed | Phase 3 | #96 |
| P4-02 | PlacesApp shell | Completed | P4-01 | #97 |
| P4-03 | MapLibre map | Completed | P4-02 | #98, #100 |
| P4-04 | Result list | Completed | P4-02 | #101 |
| P4-05 | Pin and list synchronization | Completed | P4-03, P4-04 | #102 |
| P4-06 | Filters and bounded result updates | Completed | P4-02 | #103, #104 |
| P4-07 | URL state and back restoration | Completed | P4-05, P4-06 | #105 |
| P4-08 | Mobile bottom sheet | Completed; recovery completed by P4-17D/F | P4-05 | #106, #122 |
| P4-09 | Online Services discovery and detail | Completed | public data layer | #107 |
| P4-10 | Home | Completed | public discovery surfaces | #108 |
| P4-11 | Stats | Completed | public stats export | #109 |
| P4-12 | Updates | Completed | public updates export | #115 |
| P4-13 | Public Roadmap and Changelog release surfaces | Completed | content loaders | #116 |
| P4-14 | Trust, data, legal, and sustainability pages | Completed | public specifications | #117, #118 |
| P4-15 | Public media integration | Completed; selected-surface recovery completed by P4-17E/F | P3-10, P4-01 | #119, #122 |
| P4-16 | MVP-A integration and quality audit | Completed | P4-01 through P4-15 | #120, #121, #122 |
| P4-17A | Places contract and tracking correction | Completed | P4-16 findings | #122 |
| P4-17B | Map presentation foundation recovery | Completed | P4-17A | #122 |
| P4-17C | Place information and public projection recovery | Completed | P4-17A | #122 |
| P4-17D | Desktop selected panel and mobile sheet recovery | Completed | P4-17B, P4-17C | #122 |
| P4-17E | Gallery, image enlargement, and external navigation | Completed | P4-17C, P4-17D | #122 |
| P4-17F | State, responsive, accessibility, and final 17-point acceptance audit | Completed | P4-17B through P4-17E | #122 |
| P4-18A | Tracking correction and closure inventory | Completed | P4-17, closure findings | #127 |
| P4-18B1 | Source and Candidate practical-profile contract | In progress | P4-18A | — |
| P4-18B2 | Promotion editor and field provenance parity | Planned | P4-18B1 | — |
| P4-18B3 | Canonical persistence and public projection integration | Planned | P4-18B2 | — |
| P4-18B4 | Existing-record practical-profile correction path audit and completion | Planned | P4-18B3 | — |
| P4-18C | Bounded UI residual closure | Planned | P4-18A, representative screenshot capture | — |
| P4-18D | Administration workflow integration audit | Planned | P4-18B | — |
| P4-18E | Live review and Phase 5 handoff audit | Planned | P4-18B, P4-18C, P4-18D | — |

### P4-17 Places recovery result

The MVP-A integration review found that repository-complete foundations did not yet provide a complete map-service interaction contract. P4-17 fixed the 17-point recovery set documented in:

- `docs/PLACES_UX_ACCEPTANCE.md`;
- `docs/PLACES_RECOVERY_PLAN.md`;
- `docs/PLACES_UX_FINAL_AUDIT.md`.

P4-17A through P4-17F are implemented, validated, and merged through pull request #122. The final audit matrix remains the durable interaction boundary for future Places changes.

### P4-18 closure groundwork already merged

Before the formal closure sequence was added, the following groundwork landed:

- #123 — review deployment follows `main` and updates the fixed review URL;
- #124 — observable deployment receipt records the deployed `main` commit;
- #125 — representative desktop/mobile screenshot capture, interactive-state capture, legacy Place field parity baseline, and practical profile staging fixture coverage;
- #126 — selected Place focus and marker correction plus desktop selected-panel containment.

These changes improve observability and baseline UI behavior. They do not complete P4-18B operational parity, P4-18C residual UI closure, P4-18D administration integration, or P4-18E handoff.

### P4-18 execution order

The authoritative closure details and completion criteria are in `docs/PHASE4_CLOSURE_PLAN.md`.

Execution order:

1. P4-18A — tracking correction and closure inventory;
2. P4-18B1 — source and Candidate practical-profile contract;
3. P4-18B2 — promotion editor and field provenance parity;
4. P4-18B3 — canonical persistence and public projection integration;
5. P4-18B4 — existing-record correction path audit and completion;
6. P4-18C — bounded UI residual closure;
7. P4-18D — administration workflow integration audit;
8. P4-18E — live review and Phase 5 handoff audit.

P4-18 is a bounded closure term. P4-18C must not become an unlimited redesign cycle. P4-18B is a prerequisite for public submission work because external corrections must not arrive before the operator can safely review, provenance, apply, and publish the same field classes.

## Phase 5 — Public submissions / MVP-B

**Status:** Planned; blocked on P4-18E handoff

| ID | Item | Status | Depends on |
|---|---|---|---|
| P5-01 | Shared submission foundation | Planned | P4-18E |
| P5-02 | Suggest Place and Online Service | Planned | P5-01 |
| P5-03 | Payment and problem reports | Planned | P5-01, P5-02 target conventions |
| P5-04 | Business and service claims | Planned | P5-01, practical-profile correction path |
| P5-05 | Photo and Media submission intake | Planned | P5-01, P3-10 Media review boundary |
| P5-06 | Review workflow extensions | Planned | P5-02 through P5-05 |
| P5-07 | Canonical application transactions and retention | Planned | P5-06, P4-18B correction boundary |
| P5-08 | MVP-B integration audit | Planned | P5-01 through P5-07 |

### P5-01 — Shared submission foundation

Provide the common submission envelope, opaque public reference, private follow-up secret handling, workflow status, contact privacy boundary, abuse controls, safe parsing, idempotency, and audit foundation used by later submission types.

### P5-02 — Suggest Place and Online Service

Add public suggestion intake and protected review entry without direct canonical or public mutation. Useful but insufficient submissions may become private Candidates.

### P5-03 — Payment and problem reports

Add target-aware positive and negative payment reports plus factual, privacy, rights, duplicate, and other problem reports. Reports create review material and may trigger recheck priority; they do not automatically change Claim state.

### P5-04 — Business and service claims

Add claimant intake and ownership-verification workflow boundaries. Ownership verification does not bypass payment Evidence review or publication validation.

### P5-05 — Photo and Media submission intake

Add upload intake, quarantine, file validation, privacy and rights acknowledgements, and handoff to the existing protected Media review boundary. Original submissions remain non-public.

### P5-06 — Review workflow extensions

Add reviewer diffs, information requests, time-bounded holds, partial approval, duplicate/no-change handling, and private status communication required by real submission review.

### P5-07 — Canonical application transactions and retention

Apply approved field decisions through explicit guarded canonical transactions, preserve correction provenance and audit history, run normal export/publication validation, and enforce private submission retention and deletion rules.

### P5-08 — MVP-B integration audit

Verify each submission type from public intake through private status, protected review, decision, canonical application where approved, public export, publication state, privacy boundaries, failure handling, and retention behavior.

Detailed submission behavior remains governed by `docs/SUBMISSION_WORKFLOW.md` and related data, Media, verification, privacy, and publication specifications.

## Phase 6 — Launch and cutover

**Status:** Planned

Data, license, privacy, mobile, accessibility, performance, security, redirect, sitemap, migration, backup, monitoring, and rollback checks before production cutover.

## Phase 7 — Stabilization

**Status:** Planned

Verify production errors, redirects, indexing, submissions, exports, mobile behavior, and migration completeness before retiring the legacy implementation.
