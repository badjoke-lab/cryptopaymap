# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-06-28

This document tracks repository implementation work. It is separate from the public product Roadmap and does not contain private operational planning.

## Tracking rules

- Stable implementation item IDs are independent of pull request numbers.
- Repository reality, merged pull requests, and CI results take precedence if this file disagrees.
- Candidate records, canonical records, and public exports remain separate layers.
- Cloudflare-dependent verification may be deferred without blocking repository-only data work.

Status values: `Planned`, `In progress`, `Completed`, `Deferred`, `Revised`.

## Phase 0 — Public specifications and development control

**Status:** Completed

| ID | Item | Pull request |
|---|---|---|
| P0-01 | Development control | [#1](https://github.com/badjoke-lab/cryptopaymap/pull/1) |
| P0-02 | Product constitution | [#3](https://github.com/badjoke-lab/cryptopaymap/pull/3) |
| P0-03 | Information architecture | [#4](https://github.com/badjoke-lab/cryptopaymap/pull/4) |
| P0-04 | Data architecture | [#5](https://github.com/badjoke-lab/cryptopaymap/pull/5) |
| P0-05 | Verification, sources, and licenses | [#6](https://github.com/badjoke-lab/cryptopaymap/pull/6) |
| P0-06 | Submission and media policies | [#7](https://github.com/badjoke-lab/cryptopaymap/pull/7) |
| P0-07 | Technical, UX, security, and privacy architecture | [#8](https://github.com/badjoke-lab/cryptopaymap/pull/8) |
| P0-08 | Operations, migration, launch, and public roadmap | [#9](https://github.com/badjoke-lab/cryptopaymap/pull/9) |

## Phase 1 — Foundation

**Status:** Repository work completed; live staging verification deferred

| ID | Item | Status | Pull request |
|---|---|---|---|
| P1-01 | Repository and application foundation | Completed | [#11](https://github.com/badjoke-lab/cryptopaymap/pull/11) |
| P1-02 | Design tokens and responsive application shell | Completed | [#12](https://github.com/badjoke-lab/cryptopaymap/pull/12) |
| P1-03 | Reusable UI primitives and interaction states | Completed | [#13](https://github.com/badjoke-lab/cryptopaymap/pull/13) |
| P1-04 | Motion and reduced-motion behavior | Completed | [#14](https://github.com/badjoke-lab/cryptopaymap/pull/14) |
| P1-05 | Query, UI, and URL-state boundaries | Completed | [#15](https://github.com/badjoke-lab/cryptopaymap/pull/15) |
| P1-06 | Runtime schemas and migration foundation | Completed | [#16](https://github.com/badjoke-lab/cryptopaymap/pull/16) |
| P1-07 | CI and test foundation | Completed | [#17](https://github.com/badjoke-lab/cryptopaymap/pull/17) |
| P1-08 | Cloudflare staging contract | Completed | [#18](https://github.com/badjoke-lab/cryptopaymap/pull/18) |
| P1-09 | PWA manifest and installability baseline | Completed | [#19](https://github.com/badjoke-lab/cryptopaymap/pull/19) |
| P1-10 | Accessibility baseline | Completed | [#20](https://github.com/badjoke-lab/cryptopaymap/pull/20) |
| P1-11 | Public Roadmap and Changelog content loaders | Completed | [#21](https://github.com/badjoke-lab/cryptopaymap/pull/21) |
| P1-12 | Integration and quality audit | Repository completed; live verification deferred | [#22](https://github.com/badjoke-lab/cryptopaymap/pull/22), [#23](https://github.com/badjoke-lab/cryptopaymap/pull/23) |

The repository audit, generated artifact checks, and deployment contract are complete. Pull request #23 remains a draft record for the first live Cloudflare staging verification. External access is unavailable, so the live verification is deferred and does not block repository-only work.

## Phase 2 — Data core

**Status:** Completed

Phase 2 establishes the Candidate-to-canonical-to-public-export path. It does not add public submission forms or the full administration interface.

| ID | Item | Status | Depends on | Pull request |
|---|---|---|---|---|
| P2-01 | Asset registry | Completed | Phase 1 repository audit | [#24](https://github.com/badjoke-lab/cryptopaymap/pull/24) |
| P2-02 | Network registry | Completed | P2-01 | [#24](https://github.com/badjoke-lab/cryptopaymap/pull/24) |
| P2-03 | Payment method and route registries | Completed | P2-01, P2-02 | [#25](https://github.com/badjoke-lab/cryptopaymap/pull/25) |
| P2-04 | Entity and location schema | Completed | Phase 1 repository audit | [#26](https://github.com/badjoke-lab/cryptopaymap/pull/26) |
| P2-05 | Acceptance claim schema and status rules | Completed | P2-03, P2-04 | [#29](https://github.com/badjoke-lab/cryptopaymap/pull/29) |
| P2-06 | Claim asset and network combinations | Completed | P2-02, P2-03, P2-05 | [#30](https://github.com/badjoke-lab/cryptopaymap/pull/30) |
| P2-07 | Evidence schema and source capture | Completed | P2-05 | [#31](https://github.com/badjoke-lab/cryptopaymap/pull/31) |
| P2-08 | Verification event history | Completed | P2-05, P2-07 | [#32](https://github.com/badjoke-lab/cryptopaymap/pull/32) |
| P2-09 | Source candidates, provenance, and duplicate boundaries | Completed | P2-04, P2-07 | [#34](https://github.com/badjoke-lab/cryptopaymap/pull/34) |
| P2-10 | Media metadata and legacy identifiers | Completed | P2-04, P2-09 | [#35](https://github.com/badjoke-lab/cryptopaymap/pull/35), [#37](https://github.com/badjoke-lab/cryptopaymap/pull/37) |
| P2-11 | Public export schemas | Completed | P2-05 through P2-10 | [#36](https://github.com/badjoke-lab/cryptopaymap/pull/36) |
| P2-12 | Export allowlist and leakage validator | Completed | P2-11 | [#38](https://github.com/badjoke-lab/cryptopaymap/pull/38) |
| P2-13 | Physical-place candidate importer | Completed | P2-09, P2-10, P2-12 | [#39](https://github.com/badjoke-lab/cryptopaymap/pull/39) |
| P2-14 | Online-service importer and Phase 2 integration audit | Completed | P2-09, P2-12, P2-13 | [#40](https://github.com/badjoke-lab/cryptopaymap/pull/40) |

### P2-01 — Asset registry

Create stable asset identities with canonical slugs, symbols, names, aliases, lifecycle state, stablecoin and wrapped-asset flags, and optional descriptive decimal metadata. Symbols are not identifiers and assets never imply networks. Multi-network token precision remains network-specific and is introduced later.

### P2-02 and P2-03 — Network and payment registries

Create canonical network, payment-method, and route registries. Preserve original source text while normalizing aliases. Do not infer a network from an asset symbol. Stablecoins and multi-network assets require explicit combinations.

### P2-04 through P2-06 — Canonical acceptance model

Create entities, locations, acceptance claims, and claim-asset combinations with reviewable SQL migrations. Separate brand, location, claim scope, direct-wallet routes, processor-checkout routes, and concrete payment methods.

### P2-07 through P2-10 — Evidence, history, and provenance

Create evidence, verification events, source candidates, provenance, media metadata, and legacy-ID mapping. Candidate records remain private and cannot be returned by public queries or exports.

### P2-11 and P2-12 — Public export boundary

Define compact map pins, physical places, GeoJSON, online services, registries, manifest, and version outputs. Use an allowlist rather than serializing database rows directly. Validation fails on Candidate, private evidence, contact, internal note, private media, storage, or raw-payload leakage.

### P2-13 and P2-14 — Importers and integration

Import physical and online legacy records as source candidates rather than Confirmed records. Preserve original and normalized values, provenance, licenses, and legacy IDs; produce duplicate review signals without automatic merges; exclude indirect spending categories; and prove the complete path with ten physical and ten online synthetic records.

**Phase 2 completion criteria**

- Candidate and canonical records are structurally separate.
- Reviewable migrations are reversible or have documented rollback.
- Verification states and history are auditable.
- Only eligible public records can enter validated exports.
- Source and license metadata remain traceable.
- Ten physical and ten online test imports succeed.
- Test imports produce no automatic Confirmed records.
- Importer plans fail public artifact validation.

The detailed result is recorded in `docs/PHASE_2_COMPLETION_AUDIT.md`. Database rollback behavior is recorded in `docs/DATABASE_MIGRATION_ROLLBACK.md`.

## Phase 3 — Administration and review

**Status:** Planned

Phase 3 adds protected operational tools that persist, review, resolve, and promote the private data contracts created in Phase 2.

| ID | Item | Status | Depends on |
|---|---|---|---|
| P3-01 | Admin data-access and transaction foundation | Planned | Phase 2 completion audit |
| P3-02 | Protected admin shell and access contract | Planned | P3-01, Phase 1 staging contract |
| P3-03 | Dashboard and operational queue summaries | Planned | P3-01, P3-02 |
| P3-04 | Candidate queue | Planned | P3-01, P3-02 |
| P3-05 | Candidate detail and provenance review | Planned | P3-04 |
| P3-06 | Duplicate review and identity resolution | Planned | P3-05 |
| P3-07 | Claim editor and canonical promotion | Planned | P3-05, P3-06 |
| P3-08 | Evidence review and verification decisions | Planned | P3-07 |
| P3-09 | Status transitions and reconfirmation queue | Planned | P3-07, P3-08 |
| P3-10 | Media review | Planned | P3-02, P2-10 |
| P3-11 | Export controls and release workflow | Planned | P3-07 through P3-10, P2-12 |
| P3-12 | Audit history and Phase 3 integration audit | Planned | P3-01 through P3-11 |

### P3-01 — Admin data-access and transaction foundation

Create repository-only data services for private candidates, source records, legacy mappings, canonical entities, locations, claims, Evidence, verification events, and audit events. Define transaction, idempotency, rollback, and authorization-context boundaries without adding public routes or automatic promotion.

### P3-02 through P3-06 — Protected review workspace

Build the administration shell, access boundary, dashboard, candidate queue, candidate detail, provenance inspection, and explicit duplicate decisions. Live Cloudflare Access verification may remain deferred while repository contracts and route protection are tested.

### P3-07 through P3-10 — Canonical decisions

Add claim editing, field normalization, Candidate-to-canonical promotion, Evidence decisions, status transitions, reconfirmation work, and media review. Confirmed promotion must enforce the verification policy, explicit network and method resolution, How-to-pay, and public/private boundaries.

### P3-11 and P3-12 — Controlled publication and audit

Add explicit export controls, release validation, immutable audit history, and a complete integration proof from private candidate through reviewed canonical state to validated public artifacts.

## Phase 4 — Public core / MVP-A

**Status:** Planned

Build place details, coordinated map/list discovery, filters, URL restoration, mobile sheets, online-service discovery, Home, Stats, Updates, trust pages, and administrator-managed media.

## Phase 5 — Public submissions / MVP-B

**Status:** Planned

Build suggestions, payment reports, problem reports, claims, photos, private status links, quarantine uploads, review diffs, requests for information, holds, partial approval, canonical transactions, ownership verification, negative-evidence handling, and retention jobs.

## Phase 6 — Launch and cutover

**Status:** Planned

Run data, license, privacy, mobile, accessibility, performance, security, redirect, sitemap, migration, backup, monitoring, and rollback checks before production cutover.

## Phase 7 — Stabilization

**Status:** Planned

After cutover, verify errors, redirects, indexing, submissions, exports, mobile behavior, and migration completeness before retiring the legacy implementation.
