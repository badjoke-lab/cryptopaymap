# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-06-25

This document tracks public, repository-level implementation work. It is not the user-facing product roadmap and does not contain private operational planning.

## Status values

- `Planned`
- `In progress`
- `Completed`
- `Deferred`
- `Revised`

## Tracking rules

- Implementation item IDs are stable and independent of pull request numbers.
- Each item records its deliverables, dependencies, completion criteria, and pull request when known.
- Repository reality, merged pull requests, and CI results take precedence over this document if they disagree.
- Unplanned work uses a separate prefix such as `FIX-`, `SEC-`, or `DATA-` and does not renumber existing items.

## Phase 0 — Public specifications and development control

| ID | Item | Status | Depends on | Pull request |
|---|---|---|---|---|
| P0-01 | Development control | In progress | Repository bootstrap | [#1](https://github.com/badjoke-lab/cryptopaymap/pull/1) |
| P0-02 | Product constitution | Planned | P0-01 | — |
| P0-03 | Information architecture | Planned | P0-02 | — |
| P0-04 | Data architecture | Planned | P0-02 | — |
| P0-05 | Verification, sources, and licenses | Planned | P0-04 | — |
| P0-06 | Submission and media policies | Planned | P0-04, P0-05 | — |
| P0-07 | Technical, UX, security, and privacy architecture | Planned | P0-03, P0-04 | — |
| P0-08 | Operations, migration, launch, and public roadmap | Planned | P0-03 through P0-07 | — |

### P0-01 — Development control

**Deliverables**

- `AGENTS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PROJECT_STATUS.md`
- `.github/pull_request_template.md`

**Completion criteria**

- The current phase and item can be identified immediately.
- Pull requests can reference stable implementation item IDs.
- The pull request template checks documentation synchronization and publication boundaries.
- No private planning documents are stored in the public repository.

### P0-02 — Product constitution

**Deliverables**

- `docs/PRODUCT_SPEC.md`
- `docs/MVP_SCOPE.md`

**Completion criteria**

- Product purpose, users, included payment cases, exclusions, and core principles are explicit.
- Candidate records are defined as non-public.
- MVP-A, MVP-B, and post-MVP boundaries are defined.
- Sponsorship and verification are explicitly separated.

### P0-03 — Information architecture

**Deliverable**

- `docs/INFORMATION_ARCHITECTURE.md`

**Completion criteria**

- Public routes and navigation are defined without route conflicts.
- Places, Online Services, Stats, Updates, Roadmap, Changelog, and contribution flows have distinct roles.
- Desktop and mobile discovery paths are documented.
- Legacy redirects are defined.

### P0-04 — Data architecture

**Deliverable**

- `docs/DATA_MODEL.md`

**Completion criteria**

- Source candidates, canonical records, claims, evidence, verification events, submissions, media, and legacy IDs are separated.
- Claim status and submission workflow status are not conflated.
- Payment route and payment method are separate fields.
- Public and private visibility can be enforced by the model.

### P0-05 — Verification, sources, and licenses

**Deliverables**

- `docs/VERIFICATION_POLICY.md`
- `docs/SOURCE_AND_LICENSE_POLICY.md`

**Completion criteria**

- Evidence classes and confirmation requirements are explicit.
- Direct payments without a known network cannot be confirmed.
- Reconfirmation, stale, and ended behavior is defined.
- OpenStreetMap and project-originated data can be attributed and licensed separately.

### P0-06 — Submission and media policies

**Deliverables**

- `docs/SUBMISSION_WORKFLOW.md`
- `docs/MEDIA_POLICY.md`

**Completion criteria**

- Submissions never update canonical public records automatically.
- Partial approval, requests for information, and time-bounded holds are defined.
- Evidence media, owner-verification material, and public gallery candidates are separated.
- Rights, privacy review, retention, and deletion behavior are defined.

### P0-07 — Technical, UX, security, and privacy architecture

**Deliverables**

- `docs/TECH_ARCHITECTURE.md`
- `docs/SECURITY_AND_PRIVACY.md`

**Completion criteria**

- Static and interactive application responsibilities are separated.
- Places is defined as one coordinated React application area.
- Mobile app-shell, bottom-sheet, URL-state, browser-back, motion, and accessibility requirements are explicit.
- Public exports cannot include private review or submission fields.

### P0-08 — Operations, migration, launch, and public roadmap

**Deliverables**

- `docs/OPERATIONS.md`
- `docs/MIGRATION_AND_CUTOVER.md`
- `docs/LAUNCH_CRITERIA.md`
- `docs/ROADMAP.md`

**Completion criteria**

- Review, reconfirmation, publishing, backup, migration, redirect, cutover, and rollback procedures are documented.
- The public roadmap uses capability milestones rather than private numeric targets.
- Product changelog and record updates have separate operating rules.
- All Phase 0 documents cross-reference consistently.

## Phase 1 — Foundation

Planned work includes:

- Astro, React, and TypeScript foundation;
- Tailwind and design tokens;
- reusable UI primitives and motion tokens;
- client-state and server-state boundaries;
- schema, database, and validation foundations;
- staging deployment and CI;
- PWA manifest and accessibility baseline;
- roadmap and changelog content loaders.

**Phase completion criteria**

- A staging build is available.
- Linting, type checking, tests, and builds run in CI as applicable.
- The responsive application shell and bottom-sheet foundation exist.
- No secrets or private planning documents are committed.

## Phase 2 — Data core

Planned work includes registries, entities, locations, acceptance claims, evidence, verification events, source candidates, media metadata, legacy identifiers, imports, and validated public exports.

**Phase completion criteria**

- Candidate and canonical data remain separate.
- Reviewed records can move through the documented verification states.
- Only eligible public records enter validated exports.
- Source and license metadata remain traceable.

## Phase 3 — Administration and review

Planned work includes the protected administration shell, candidate review, claim editing, evidence review, state transitions, reconfirmation, media review, export control, and audit history.

**Phase completion criteria**

- An operator can review a candidate, attach evidence, write payment instructions, confirm it, and publish a validated export.
- Stale, reconfirmed, and ended transitions are auditable.
- Failed publication does not produce a false published state.

## Phase 4 — Public core / MVP-A

Planned work includes place details, the Places application, online-service discovery, Home, basic Stats, Updates, the public Roadmap, the product Changelog, trust pages, and administrator-managed media.

**Phase completion criteria**

- Confirmed physical and online payment options are discoverable on mobile and desktop.
- Asset, network, route, instructions, evidence, and confirmation date are visible.
- Map and list state remain coordinated and restorable.
- The core public experience passes the applicable accessibility and end-to-end checks.

## Phase 5 — Public submissions / MVP-B

Planned work includes suggestions, payment reports, problem reports, owner claims, photos, secret status links, quarantine uploads, review queues, partial approval, requests for information, time-bounded holds, canonical transactions, and privacy retention jobs.

**Phase completion criteria**

- Public submissions cannot bypass review.
- Submitters can follow and respond to a submission without an account.
- Evidence and public-media decisions remain separate.
- Approved changes are applied atomically and auditable.

MVP-B completion defines the formal MVP.

## Phase 6 — Launch and cutover

Planned work includes migration audits, data-quality checks, licensing and privacy review, mobile and accessibility QA, performance and security checks, redirects, sitemap and robots configuration, production cutover, monitoring, and rollback preparation.

**Phase completion criteria**

- Every published record meets the public verification contract.
- Candidate records remain private and stale records are excluded by default.
- Legal, attribution, backup, monitoring, redirect, and rollback requirements are satisfied.

## Phase 7 — Stabilization

After production cutover, the project verifies errors, redirects, search indexing, submissions, exports, mobile behavior, and migration completeness before retiring the legacy implementation.
