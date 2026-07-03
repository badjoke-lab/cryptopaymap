# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-07-03

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
| P3-09 | Status transitions and reconfirmation queue | Final validation | P3-07, P3-08 | #64–#67 active |
| P3-10 | Media review | Planned | P3-02, P2-10 | — |
| P3-11 | Export controls and release workflow | Planned | P3-07 through P3-10 | — |
| P3-12 | Audit history and Phase 3 integration audit | Planned | P3-01 through P3-11 | — |

### Completed P3-07 deliveries

P3-07A through P3-07C established isolated promotion authorization, durable atomic new-target persistence, protected workspace reads, eligibility checks, and the hidden new-canonical-target editor.

P3-07D through P3-07F established version-pinned existing-target linking, durable atomic persistence, protected target search, comparison, explicit selection, exact canonical-path checks, and exact existing Claim-set checks.

P3-07G through P3-07I established the field-level provenance contract and reviewer controls for both paths, including origin and attribution role separation, stable draft identities, missing-source blocking, and protected request validation.

P3-07J completed the cross-path integration and handoff audit. P3-07 is repository-complete; live Access, database, and production verification remain deferred.

### Completed P3-08 deliveries

P3-08A established the isolated `evidence:review` authorization and strict decision contract, including Evidence disposition, finding, explicit Claim action, exact version and accepted-set guards, deterministic replay, threshold enforcement, and atomic reference behavior.

P3-08B added durable `evidence_review_decisions` persistence, the rejected verification event, migration `0015_bored_lyja.sql`, transaction guards, atomic Drizzle and Neon persistence, and replayable audit receipts.

P3-08C added the protected bounded Evidence queue, version-pinned detail workspace, accepted Evidence set and threshold display, protected GET and POST endpoints, reviewer decision UI, API and component tests, runtime checks, and protected artifact validation. Closed draft pull request #61 was superseded by merged pull request #62 without losing implementation.

P3-08D completed the final cross-layer repository integration and handoff audit in pull request #63. Live Access, database, and production verification remain deferred.

### Completed P3-09 deliveries

P3-09A established the bounded overdue, missing-deadline, stale, and due-soon queue contract; exact Claim version, status, visibility, and deadline expectations; system-only expiration capability; and replay, conflict, early-execution, and rollback behavior.

P3-09B added durable `reconfirmation_expirations` receipts, migration `0016_high_pixie.sql`, atomic Claim and `marked_stale` event persistence, database guards, deterministic replay, and the bounded database queue.

P3-09C added Rechecks-specific authorization, protected queue and detail APIs, version-pinned Claim context, the controlled expiration POST endpoint, `/admin/rechecks`, `/admin/rechecks/detail`, reviewer UI, and API, component, runtime, and artifact validation.

### Current delivery

P3-09D adds the repository-side scheduled execution boundary and final P3-09 handoff. It derives stable run and per-Claim request IDs from the scheduled occurrence, loads only bounded overdue confirmed Claims, reuses the durable expiration backend, records per-Claim committed, replayed, conflict, not-found, and failed outcomes, rejects invalid or premature batches, and keeps the live Cloudflare cron trigger explicitly deferred.

### Remaining P3-09 delivery

- complete pull request #67 validation and merge it
- hand Phase 3 implementation to P3-10 Media review

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
