# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-06-26

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

**Status:** Completed

| ID | Item | Status | Depends on | Pull request |
|---|---|---|---|---|
| P0-01 | Development control | Completed | Repository bootstrap | [#1](https://github.com/badjoke-lab/cryptopaymap/pull/1) |
| P0-02 | Product constitution | Completed | P0-01 | [#3](https://github.com/badjoke-lab/cryptopaymap/pull/3) |
| P0-03 | Information architecture | Completed | P0-02 | [#4](https://github.com/badjoke-lab/cryptopaymap/pull/4) |
| P0-04 | Data architecture | Completed | P0-02 | [#5](https://github.com/badjoke-lab/cryptopaymap/pull/5) |
| P0-05 | Verification, sources, and licenses | Completed | P0-04 | [#6](https://github.com/badjoke-lab/cryptopaymap/pull/6) |
| P0-06 | Submission and media policies | Completed | P0-04, P0-05 | [#7](https://github.com/badjoke-lab/cryptopaymap/pull/7) |
| P0-07 | Technical, UX, security, and privacy architecture | Completed | P0-03, P0-04 | [#8](https://github.com/badjoke-lab/cryptopaymap/pull/8) |
| P0-08 | Operations, migration, launch, and public roadmap | Completed | P0-03 through P0-07 | [#9](https://github.com/badjoke-lab/cryptopaymap/pull/9) |

### Phase 0 completion criteria

- The public product scope and MVP boundary are defined.
- Public routes and legacy redirects are defined.
- Candidate, canonical, claim, evidence, submission, media, and public-export boundaries are defined.
- Verification, source, attribution, and license policies are defined.
- Submission and media review policies are defined.
- Technical, mobile UX, security, privacy, accessibility, and performance architecture are defined.
- Operations, migration, cutover, launch, public Roadmap, and product Changelog responsibilities are defined.
- Repository development controls and public specification links are present.
- No private planning documents are stored in the public repository.

## Phase 1 — Foundation

**Status:** In progress

| ID | Item | Status | Depends on | Pull request |
|---|---|---|---|---|
| P1-01 | Repository and application foundation | Completed | Phase 0 | [#11](https://github.com/badjoke-lab/cryptopaymap/pull/11) |
| P1-02 | Tailwind, design tokens, and responsive application shell | Completed | P1-01 | [#12](https://github.com/badjoke-lab/cryptopaymap/pull/12) |
| P1-03 | Reusable UI primitives and interaction states | In progress | P1-02 | — |
| P1-04 | Motion tokens and reduced-motion behavior | Planned | P1-02, P1-03 | — |
| P1-05 | Client, server, and URL-state boundaries | Planned | P1-01 | — |
| P1-06 | Zod, Drizzle, and migration foundation | Planned | P1-01 | — |
| P1-07 | CI and test foundation | Planned | P1-01 | — |
| P1-08 | Cloudflare staging foundation | Planned | P1-01, P1-07 | — |
| P1-09 | PWA manifest and installability baseline | Planned | P1-02 | — |
| P1-10 | Accessibility baseline | Planned | P1-03, P1-04 | — |
| P1-11 | Public Roadmap and Changelog content loaders | Planned | P1-01 | — |
| P1-12 | Phase 1 integration and quality audit | Planned | P1-02 through P1-11 | — |

### P1-01 — Repository and application foundation

**Deliverables**

- Astro project foundation
- React integration
- TypeScript strict configuration
- package scripts and npm lockfile
- source and public directory structure
- development and production build commands
- initial application entry and static page shell
- environment-variable example without secrets
- read-only foundation validation workflow

**Completion criteria**

- a clean checkout installs locked dependencies;
- Astro and TypeScript checks pass;
- the repository produces a static production build;
- React is available only where interactive application behavior requires it;
- TypeScript strict mode is enabled;
- no secret or private configuration is committed;
- the foundation follows the published technical architecture.

### P1-02 — Tailwind, design tokens, and responsive application shell

**Deliverables**

- Tailwind CSS 4 Vite-plugin integration
- semantic CSS and Tailwind theme tokens
- typography, spacing, radius, status, and surface foundations
- responsive header, main-content, and footer shell
- mobile safe-area utilities and viewport coverage
- visible focus, skip-link, touch-target, and reduced-motion baseline
- design-system foundation documentation

**Completion criteria**

- locked dependency installation, Astro check, and static build pass;
- tokens support the documented visual system without hard-coding product states throughout components;
- the shell works at the 640 / 768 / 1024 / 1280 breakpoints;
- mobile controls can meet the documented touch-target requirements;
- status is not communicated by color alone in the example surface;
- future dark-mode support is not blocked, but dark mode is not implemented.

### P1-03 — Reusable UI primitives and interaction states

**Deliverables**

- buttons
- inputs and selects
- chips and badges
- cards
- dialog and sheet foundations
- toast
- skeleton
- empty, loading, success, and error states

**Completion criteria**

- primitives are keyboard accessible;
- status is not communicated by color alone;
- components expose consistent focus behavior;
- primitives are reusable by Places, submissions, and administration.

### P1-04 — Motion tokens and reduced-motion behavior

**Deliverables**

- motion duration and easing tokens
- reduced-motion utilities
- base transitions for buttons, cards, sheets, and page changes

**Completion criteria**

- motion supports orientation and feedback rather than decoration;
- reduced-motion users receive equivalent usable states;
- map interaction is not blocked by animation.

### P1-05 — Client, server, and URL-state boundaries

**Deliverables**

- TanStack Query foundation
- Zustand foundation
- URL search-parameter conventions
- local-state guidance
- serialization and restoration rules

**Completion criteria**

- server data, application UI state, shareable URL state, and local component state have distinct responsibilities;
- future map/list/filter state can be restored through browser navigation;
- private state is not placed in public URLs.

### P1-06 — Zod, Drizzle, and migration foundation

**Deliverables**

- schema-validation foundation
- Drizzle configuration
- migration directory and scripts
- database environment contract without credentials

**Completion criteria**

- migrations are reviewable as SQL;
- runtime input validation can be shared by APIs and build tools;
- public request paths are not forced to query the database directly;
- no production database dependency is required for a static public build.

### P1-07 — CI and test foundation

**Deliverables**

- formatting or linting
- type checking
- unit-test runner
- production build validation
- dependency-cache configuration

**Completion criteria**

- pull requests receive deterministic quality checks;
- checks fail closed;
- no check is reported as passed unless it ran successfully;
- future component, end-to-end, accessibility, and data checks have defined extension points.

### P1-08 — Cloudflare staging foundation

**Deliverables**

- Cloudflare-compatible build configuration
- staging deployment contract
- environment separation
- cache and security-header baseline where applicable

**Completion criteria**

- staging can be deployed without production secrets;
- production and preview configuration remain distinct;
- deployment does not expose private administration or candidate data.

### P1-09 — PWA manifest and installability baseline

**Deliverables**

- web app manifest
- application name and theme metadata
- icon placeholders or approved icons
- standalone display and start URL

**Completion criteria**

- installability metadata validates;
- the baseline does not cache stale payment data as a permanent offline truth;
- advanced offline behavior remains outside this item.

### P1-10 — Accessibility baseline

**Deliverables**

- semantic page shell
- visible focus rules
- keyboard-navigation baseline
- reduced-motion integration
- automated accessibility check foundation

**Completion criteria**

- the foundation supports WCAG 2.2 AA-oriented implementation;
- map-only interaction is not assumed;
- sheets and dialogs have an accessible focus strategy.

### P1-11 — Public Roadmap and Changelog content loaders

**Deliverables**

- versioned Roadmap content source
- Changelog content source
- schema validation
- static rendering contract

**Completion criteria**

- Roadmap and Changelog remain separate content types;
- Roadmap content uses capability milestones rather than private numeric targets;
- Changelog entries represent released product changes, not every pull request.

### P1-12 — Phase 1 integration and quality audit

**Deliverables**

- integrated foundation review
- build and CI verification
- accessibility baseline review
- publication-boundary audit
- Phase 2 readiness record

**Completion criteria**

- a staging build is available or the documented staging path is proven;
- linting, type checking, unit tests, and builds run in CI;
- the responsive application shell and sheet foundation exist;
- state, schema, deployment, and content foundations agree with the public architecture;
- no secrets or private planning documents are committed.

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
