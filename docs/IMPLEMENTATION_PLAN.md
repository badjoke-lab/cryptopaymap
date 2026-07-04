# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-07-04

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

**Status:** In progress

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
| P3-12 | Audit history and Phase 3 integration audit | In progress | P3-01 through P3-11 | P3-12A active |

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

### Current P3-12 delivery

P3-12A defines the protected normalized audit-history read contract across candidate, Evidence, reconfirmation, Media, and export administration. It adds bounded filters, stable cursor semantics, deterministic ordering, source-domain validation, target metadata, and privacy leakage boundaries without duplicating authoritative domain writes.

### Remaining P3-12 deliveries

- bounded aggregation over authoritative durable Phase 3 decision and event sources
- protected audit history API and administration surface
- final cross-domain Phase 3 integration audit and Phase 4 handoff

## Phase 4 — Public core / MVP-A

**Status:** Planned

Place details, coordinated map and list discovery, filters, URL restoration, mobile sheets, online-service discovery, Home, Stats, Updates, trust pages, and administrator-managed media.

## Phase 5 — Public submissions / MVP-B

**Status:** Planned

Suggestions, payment reports, problem reports, owner claims, photos, private status links, quarantine uploads, review diffs, information requests, holds, partial approval, canonical transactions, and retention jobs.

## Phase 6 — Launch and cutover

**Status:** Planned

Data, license, privacy, mobile, accessibility, performance, security, redirect, sitemap, migration, backup, monitoring, and rollback checks before production cutover.

## Phase 7 — Stabilization

**Status:** Planned

Verify production errors, redirects, indexing, submissions, exports, mobile behavior, and migration completeness before retiring the legacy implementation.
