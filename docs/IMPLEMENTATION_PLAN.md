# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-07-05

This file tracks repository implementation work. GitHub main, merged pull requests, and CI are authoritative when this file differs from repository reality.

## Rules

- Implementation item IDs are independent of pull request numbers.
- Candidate, canonical, and public-export layers remain separate.
- Each pull request has one primary responsibility and explicit completion checks.
- Live Cloudflare and database verification may be deferred without blocking repository-only work.
- Public product Roadmap and repository implementation status are separate documents.

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

**Status:** Repository work completed; live staging verification deferred

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
| P1-12 | Integration and quality audit | Repository completed; live verification deferred | #22, #23 |

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

**Status:** Repository completed; live verification deferred

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
| P3-11 | Export controls and release workflow | Repository completed; live verification deferred | P3-07 through P3-10 | #75–#87 |
| P3-12 | Audit history and Phase 3 integration audit | Completed | P3-01 through P3-11 | #88, #89, #92–#95 |

### Completed P3-07 deliveries

P3-07 established isolated promotion authorization, durable atomic promotion and existing-target linking, protected workspaces, exact candidate and Claim-set guards, target search and selection, field-level provenance, reviewer controls, and cross-path integration. P3-07 is repository-complete; live Access, database, and production verification remain deferred.

### Completed P3-08 deliveries

P3-08 established Evidence review authorization, strict decision contracts, durable decision persistence, Claim transitions and verification events, protected queue and detail workspaces, reviewer UI, API behavior, threshold enforcement, replay and conflict handling, and a final cross-layer audit. Live Access, database, and production verification remain deferred.

### Completed P3-09 deliveries

P3-09 established bounded reconfirmation queues, exact Claim guards, durable expiration receipts, atomic stale transitions, protected Rechecks APIs and UI, scheduled-run identity and replay behavior, and the final handoff audit. Live scheduler configuration remains deferred.

### Completed P3-10 deliveries

P3-10 established isolated Media review authorization, strict Media decision contracts, durable receipts, exact file-set guards, deterministic private and public storage plans, R2 adapter boundaries, protected queue, detail and preview routes, reviewer UI, publication and revocation behavior, replay safety, and the final Media integration audit. Live Access, R2, database, and production verification remain deferred.

### Completed P3-11 deliveries

P3-11A through P3-11D established release-decision authorization, exact candidate and snapshot guards, durable release decisions, protected release queue and detail workspaces, reviewer actions, and private candidate revalidation.

P3-11E through P3-11H established separate publication authorization, immutable release-object staging, exact metadata checks, conditional active-pointer activation, durable activation history, request replay and conflicts, bounded release-history reads, and the protected history API.

P3-11I through P3-11L established restore preparation, pointer inventory and execution-record contracts, target-object preflight, conditional pointer switching, switch-receipt validation, replay-safe workflow composition, and explicit post-switch persistence failure handling.

P3-11M aligned restore readiness with the implemented execution workflow, added readiness-to-execution runtime verification, completed the repository integration audit, documented deferred live verification, and handed off to P3-12 in pull request #87.

### Completed P3-12 deliveries

P3-12A defined the protected normalized audit-history read contract across candidate, Evidence, reconfirmation, Media, and export administration. It added bounded filters, stable cursor semantics, deterministic ordering, source-domain validation, target metadata, and privacy leakage boundaries in pull request #88.

P3-12B added metadata-only source normalizers, bounded concurrent aggregation, source-domain validation, duplicate identity rejection, defensive filtering, deterministic cross-source ordering, and fail-closed source handling in pull request #89.

P3-12C connected bounded audit history sources to the existing durable Phase 3 tables in pull request #92. It pushes actor, time-range, target, and stable cursor filters into source queries, preserves source ordering compatible with the global cursor, and excludes restore execution from the Drizzle registry until a corresponding table exists.

P3-12D added the protected audit history API, isolated audit read authorization, fail-closed environment handling, bounded response mapping, runtime checks, and API tests in pull request #93.

P3-12E added the protected `/admin/audit` administration surface, metadata-only history cards, domain, actor, target, and time filters, stable cursor loading, explicit loading and failure states, component tests, and built-artifact leakage checks in pull request #94.

P3-12F completed the final repository-level Phase 3 cross-domain integration audit in pull request #95. It verified deterministic history ordering, bounded pagination, domain and target filtering, stable cursor continuation, isolated audit-read authorization, rejection of source items carrying non-contract fields, explicit deferred live-verification boundaries, and the Phase 4 handoff.

## Phase 4 — Public core / MVP-A

**Status:** In progress

| ID | Item | Status | Depends on | Pull request |
|---|---|---|---|---|
| P4-01 | Place detail | Completed | Phase 3 | #96 |
| P4-02 | PlacesApp shell | Completed | P4-01 | #97 |
| P4-03 | MapLibre map | Completed | P4-02 | #98, #100 |
| P4-04 | Result list | Completed | P4-02 | #101 |
| P4-05 | Pin and list synchronization | Completed | P4-03, P4-04 | #102 |
| P4-06 | Filters and bounded result updates | Completed | P4-02 | #103, #104 |
| P4-07 | URL state and back restoration | Completed | P4-05, P4-06 | #105 |
| P4-08 | Mobile bottom sheet | Completed | P4-05 | #106 |
| P4-09 | Online Services discovery and detail | Completed | public data layer | #107 |
| P4-10 | Home | Completed | public discovery surfaces | #108 |
| P4-11 | Stats | Completed | public stats export | #109 |
| P4-12 | Updates | Completed | public updates export | #115 |
| P4-13 | Public Roadmap and Changelog release surfaces | Completed | content loaders | #116 |
| P4-14 | Trust, data, legal, and sustainability pages | Completed | public specifications | #117, #118 |
| P4-15 | Public media integration | Completed | P3-10, P4-01 | #119 |
| P4-16 | MVP-A integration and quality audit | In progress | P4-01 through P4-15 | #120 |

### Completed P4-01 delivery

P4-01A established the first public Place detail boundary in pull request #96. It reads only validated published `places.json` records through the build-time content layer, generates canonical `/place/{slug}` paths from those public records, derives a status-aware detail view model, renders payment assets, networks, routes, methods, instructions, restrictions, freshness, Evidence, and approved public Media, and covers the model and privacy boundary with tests.

### Completed P4-02 delivery

P4-02A established the coordinated PlacesApp public shell in pull request #97. It loads only validated public Place pins, connects existing Discovery URL state and isolated Zustand UI state, coordinates map/list mode, public result selection, selected-place detail navigation, search and status filtering, and explicit empty states that never substitute Candidate records.

### P4-03 deliveries

P4-03A established deterministic public Place point-feature conversion, stable feature identity and selection state, and normalized camera contracts aligned with the public URL boundary in pull request #98.

P4-03B added the MapLibre renderer to the coordinated PlacesApp shell in pull request #100. It registers the public GeoJSON source, clustered and point layers, marker selection and cluster expansion behavior, camera and pending viewport coordination, Search this area behavior, resize handling, fallback states, and renderer component tests.

## Phase 5 — Public submissions / MVP-B

**Status:** Planned

Suggestions, payment reports, problem reports, owner claims, photos, private status links, quarantine uploads, review diffs, information requests, holds, partial approval, canonical transactions, and retention jobs.

## Phase 6 — Launch and cutover

**Status:** Planned

Data, license, privacy, mobile, accessibility, performance, security, redirect, sitemap, migration, backup, monitoring, and rollback checks before production cutover.

## Phase 7 — Stabilization

**Status:** Planned

Verify production errors, redirects, indexing, submissions, exports, mobile behavior, and migration completeness before retiring the legacy implementation.
