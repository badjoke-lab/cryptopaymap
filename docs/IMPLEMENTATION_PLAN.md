# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-06-26

This document tracks public, repository-level implementation work. It is not the user-facing product roadmap and does not contain private operational planning.

## Tracking rules

- Stable implementation item IDs are independent of pull request numbers.
- Repository reality, merged pull requests, and CI results take precedence if this file disagrees.
- Each active or planned item records dependencies, deliverables, and completion criteria.
- Completed items remain linked to their pull requests.
- Unplanned work uses `FIX-`, `SEC-`, or `DATA-` prefixes without renumbering planned items.

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

**Status:** In progress

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
| P1-12 | Phase 1 integration and quality audit | In progress | [#22](https://github.com/badjoke-lab/cryptopaymap/pull/22) |

### P1-12 — Phase 1 integration and quality audit

**Deliverables**

- integrated required-file, dependency, workflow, and generated-artifact audit;
- public and internal publication-boundary checks;
- CI and pre-deployment audit integration;
- live Cloudflare staging checklist;
- Phase 2 implementation breakdown.

**Repository completion criteria**

- formatting, linting, type checking, runtime schemas, migrations, tests, and build pass;
- accessibility, integrated foundation, and staging artifact checks pass;
- deployable artifact upload succeeds;
- no internal-only project documents are present in tracked public content.

**External staging gate**

After P1-11, provision the `cryptopaymap-staging` Cloudflare Pages project and GitHub `staging` environment. Run the manual staging workflow from merged `main`. P1-12 completes only after the live URL, commit, response headers, PWA files, public content pages, keyboard behavior, reduced motion, and mobile behavior are recorded and checked.

## Phase 2 — Data core

**Status:** Planned

Phase 2 establishes the Candidate-to-canonical-to-public-export path. It does not add public submission forms or the full administration interface.

| ID | Item | Depends on |
|---|---|---|
| P2-01 | Asset registry | P1-12 |
| P2-02 | Network registry | P2-01 |
| P2-03 | Payment method and route registries | P2-01, P2-02 |
| P2-04 | Entity and location schema | P1-12 |
| P2-05 | Acceptance claim schema and status rules | P2-03, P2-04 |
| P2-06 | Claim asset and network combinations | P2-02, P2-03, P2-05 |
| P2-07 | Evidence schema and source capture | P2-05 |
| P2-08 | Verification event history | P2-05, P2-07 |
| P2-09 | Source candidates, provenance, and duplicate boundaries | P2-04, P2-07 |
| P2-10 | Media metadata and legacy identifiers | P2-04, P2-09 |
| P2-11 | Public export schemas | P2-05 through P2-10 |
| P2-12 | Export allowlist and leakage validator | P2-11 |
| P2-13 | Physical-place candidate importer | P2-09, P2-10, P2-12 |
| P2-14 | Online-service importer and Phase 2 integration audit | P2-09, P2-12, P2-13 |

### P2-01 through P2-03 — Registries

Create canonical asset, network, payment-method, and route registries. Preserve original source text while normalizing aliases. Do not infer a network from an asset symbol. Stablecoins and multi-network assets require explicit combinations.

### P2-04 through P2-06 — Canonical acceptance model

Create entities, locations, acceptance claims, and claim-asset combinations with reviewable SQL migrations. Separate brand, location, claim scope, direct-wallet routes, processor-checkout routes, and concrete payment methods.

### P2-07 through P2-10 — Evidence, history, and provenance

Create evidence, verification events, source candidates, provenance, media metadata, and legacy-ID mapping. Candidate records remain private and cannot be returned by public queries or exports.

### P2-11 and P2-12 — Public export boundary

Define compact map pins, physical places, GeoJSON, online services, registries, manifest, and version outputs. Use an allowlist rather than serializing database rows directly. Validation fails on Candidate, private evidence, contact, internal note, or private media leakage.

### P2-13 and P2-14 — Importers and integration

Import physical and online legacy records as source candidates rather than Confirmed records. Preserve provenance and legacy IDs, run duplicate checks, and prove the complete path with at least ten physical and ten online test records.

**Phase 2 completion criteria**

- Candidate and canonical records are structurally separate;
- reviewable migrations are reversible or have documented rollback;
- verification states and history are auditable;
- only eligible public records enter validated exports;
- source and license metadata remain traceable;
- test imports produce no automatic Confirmed records.

## Phase 3 — Administration and review

**Status:** Planned

Build the protected administration shell, review queue, candidate detail, claim editor, evidence review, state transitions, reconfirmation queue, media review, export controls, and audit history. Completion requires a full Candidate-to-Confirmed-to-public-export path and auditable stale, reconfirmed, and ended transitions.

## Phase 4 — Public core / MVP-A

**Status:** Planned

Build place detail, the coordinated Places application, MapLibre map, list, filters, URL restoration, mobile bottom sheet, online-service discovery, Home, Stats, Updates, public Roadmap, Changelog, trust pages, and administrator-managed media.

## Phase 5 — Public submissions / MVP-B

**Status:** Planned

Build suggestions, payment reports, problem reports, claims, photos, private status links, quarantine uploads, review diffs, requests for information, time-bounded holds, partial approval, canonical transactions, owner verification, negative-evidence handling, and retention jobs. Completion defines the formal MVP.

## Phase 6 — Launch and cutover

**Status:** Planned

Run data, license, privacy, mobile, accessibility, performance, security, redirect, sitemap, migration, backup, monitoring, and rollback checks before production-domain cutover.

## Phase 7 — Stabilization

**Status:** Planned

After cutover, verify errors, redirects, indexing, submissions, exports, mobile behavior, and migration completeness before retiring the legacy implementation.
