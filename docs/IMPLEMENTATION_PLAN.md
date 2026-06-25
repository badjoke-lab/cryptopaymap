# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-06-26

This document tracks public, repository-level implementation work. It is not the user-facing product roadmap and does not contain private operational planning.

## Tracking rules

- Stable implementation item IDs are independent of pull request numbers.
- Repository reality, merged pull requests, and CI results take precedence if this file disagrees.
- Each item records dependencies, deliverables, completion criteria, and the pull request when known.
- Unplanned work uses `FIX-`, `SEC-`, or `DATA-` prefixes without renumbering planned items.

Status values: `Planned`, `In progress`, `Completed`, `Deferred`, `Revised`.

## Phase 0 — Public specifications and development control

**Status:** Completed

| ID | Item | Status | Pull request |
|---|---|---|---|
| P0-01 | Development control | Completed | [#1](https://github.com/badjoke-lab/cryptopaymap/pull/1) |
| P0-02 | Product constitution | Completed | [#3](https://github.com/badjoke-lab/cryptopaymap/pull/3) |
| P0-03 | Information architecture | Completed | [#4](https://github.com/badjoke-lab/cryptopaymap/pull/4) |
| P0-04 | Data architecture | Completed | [#5](https://github.com/badjoke-lab/cryptopaymap/pull/5) |
| P0-05 | Verification, sources, and licenses | Completed | [#6](https://github.com/badjoke-lab/cryptopaymap/pull/6) |
| P0-06 | Submission and media policies | Completed | [#7](https://github.com/badjoke-lab/cryptopaymap/pull/7) |
| P0-07 | Technical, UX, security, and privacy architecture | Completed | [#8](https://github.com/badjoke-lab/cryptopaymap/pull/8) |
| P0-08 | Operations, migration, launch, and public roadmap | Completed | [#9](https://github.com/badjoke-lab/cryptopaymap/pull/9) |

Phase 0 established the public product, route, data, verification, submission, media, technical, security, privacy, migration, launch, and roadmap contracts. Internal-only planning documents remain outside the public repository.

## Phase 1 — Foundation

**Status:** In progress

| ID | Item | Status | Depends on | Pull request |
|---|---|---|---|---|
| P1-01 | Repository and application foundation | Completed | Phase 0 | [#11](https://github.com/badjoke-lab/cryptopaymap/pull/11) |
| P1-02 | Tailwind, design tokens, and responsive application shell | Completed | P1-01 | [#12](https://github.com/badjoke-lab/cryptopaymap/pull/12) |
| P1-03 | Reusable UI primitives and interaction states | Completed | P1-02 | [#13](https://github.com/badjoke-lab/cryptopaymap/pull/13) |
| P1-04 | Motion tokens and reduced-motion behavior | Completed | P1-02, P1-03 | [#14](https://github.com/badjoke-lab/cryptopaymap/pull/14) |
| P1-05 | Client, server, and URL-state boundaries | Completed | P1-01 | [#15](https://github.com/badjoke-lab/cryptopaymap/pull/15) |
| P1-06 | Zod, Drizzle, and migration foundation | In progress | P1-01 | [#16](https://github.com/badjoke-lab/cryptopaymap/pull/16) |
| P1-07 | CI and test foundation | Planned | P1-01 | — |
| P1-08 | Cloudflare staging foundation | Planned | P1-01, P1-07 | — |
| P1-09 | PWA manifest and installability baseline | Planned | P1-02 | — |
| P1-10 | Accessibility baseline | Planned | P1-03, P1-04 | — |
| P1-11 | Public Roadmap and Changelog content loaders | Planned | P1-01 | — |
| P1-12 | Phase 1 integration and quality audit | Planned | P1-02 through P1-11 | — |

### P1-01 — Repository and application foundation

**Deliverables**

- Astro, React, and strict TypeScript foundation
- package scripts, npm lockfile, and environment contract
- static application entry and base layout
- read-only validation workflow

**Completion criteria**

- locked install, Astro check, and static build pass;
- React is used only for interactive application areas;
- no secret or private configuration is committed.

### P1-02 — Design tokens and responsive shell

**Deliverables**

- Tailwind CSS 4 integration
- semantic brand, state, surface, radius, shadow, and breakpoint tokens
- responsive header, main, and footer shell
- safe-area, focus, touch-target, skip-link, and reduced-motion baseline
- design-system foundation documentation

**Completion criteria**

- locked install, check, and build pass;
- shell works at 640 / 768 / 1024 / 1280 breakpoints;
- public status is never communicated by color alone;
- dark mode remains deferred without being structurally blocked.

### P1-03 — Reusable UI primitives and interaction states

**Deliverables**

- Button, TextField, SelectField, Badge, and Card
- modal Dialog and bottom/right Sheet
- Toast provider and notice
- Skeleton and empty/loading/success/warning/error StatePanel
- integrated demonstration and public component contract
- Radix and Lucide dependency foundation

**Completion criteria**

- locked install, Astro check, and static build pass;
- fields connect labels, hints, errors, and ARIA state;
- modal surfaces provide managed focus, Escape behavior, and visible close controls;
- controls expose consistent focus and touch targets;
- primitives are reusable by discovery, submissions, and administration;
- no private data or automatic canonical mutation is introduced.

### P1-04 — Motion tokens and reduced-motion behavior

**Deliverables**

- Motion for React dependency and locked graph
- `instant`, `fast`, `normal`, and `slow` duration tokens
- shared standard, enter, and exit easing tokens
- MotionConfig reduced-motion policy and animated state replacement
- CSS `data-state` motion for Dialog, Sheet, Select, and Toast
- Astro ClientRouter page-transition boundary
- documented map and bottom-sheet motion constraints

**Completion criteria**

- locked install, Astro check, and static build pass;
- motion improves orientation or feedback rather than decoration;
- reduced-motion users receive equivalent usable states;
- controls remain immediately responsive;
- route, React state, and portal motion have separate ownership;
- map interaction is not blocked by animation.

### P1-05 — Client, server, and URL-state boundaries

**Deliverables**

- TanStack Query server-state foundation
- per-island Zustand application-state foundation
- deterministic URL parsing and serialization
- browser-history restoration and push/replace rules
- public/private state boundary documentation
- integrated state-ownership demonstration

**Completion criteria**

- locked install, Astro check, and static build pass;
- server data, application UI state, shareable URL state, and local state have distinct ownership;
- map, list, filter, selection, and browser-back state can be restored;
- private workflow state never enters public URLs or public query keys.

### P1-06 — Zod, Drizzle, and migration foundation

**Deliverables**

- pinned Zod, Drizzle ORM, Drizzle Kit, Neon serverless driver, and tsx dependencies
- shared runtime validation schemas
- foundational PostgreSQL enums
- explicit Neon HTTP database factory
- Drizzle PostgreSQL configuration
- reviewable generated SQL migration and metadata
- schema and migration commands
- database environment contract without committed connection values
- database foundation documentation
- CI checks for runtime schemas and migration history

**Completion criteria**

- locked install, Astro and TypeScript check, runtime-schema check, migration-history check, and static build pass;
- runtime validation reuses the structural values used by the database schema;
- public static builds do not require database configuration or database access;
- migrations remain reviewable SQL and are generated separately from application;
- Phase 2 domain tables are not introduced prematurely.

### P1-07 — CI and test foundation

**Deliverables**

- formatting or linting
- deterministic type checking and build validation
- unit-test runner
- dependency caching
- extension points for component, end-to-end, accessibility, and data checks

**Completion criteria**

- pull requests receive fail-closed checks;
- no check is reported as passed unless it ran successfully;
- validation logs remain inspectable.

### P1-08 — Cloudflare staging foundation

**Deliverables**

- Cloudflare-compatible build and staging contract
- preview/production environment separation
- cache and security-header baseline

**Completion criteria**

- staging deploys without production secrets;
- preview and production remain distinct;
- no candidate, submission, or administration data is exposed.

### P1-09 — PWA manifest and installability baseline

**Deliverables**

- web app manifest, names, icons, theme metadata, standalone display, and start URL

**Completion criteria**

- installability metadata validates;
- stale payment data is not cached as permanent offline truth;
- advanced offline behavior remains deferred.

### P1-10 — Accessibility baseline

**Deliverables**

- semantic shell, keyboard baseline, focus rules, reduced-motion integration, and automated accessibility checks

**Completion criteria**

- foundation supports WCAG 2.2 AA-oriented implementation;
- map-only interaction is never assumed;
- sheets and dialogs have verified focus behavior.

### P1-11 — Public Roadmap and Changelog content loaders

**Deliverables**

- separate validated Roadmap and Changelog content sources and static rendering contracts

**Completion criteria**

- Roadmap uses capability milestones, not private numeric targets;
- Changelog records released product changes rather than every pull request.

### P1-12 — Phase 1 integration and quality audit

**Deliverables**

- integrated foundation review
- staging/build/CI verification
- accessibility and publication-boundary audits
- Phase 2 readiness record

**Completion criteria**

- the responsive shell and sheet foundation exist;
- linting, type checking, unit tests, and builds run in CI;
- state, schema, deployment, and content foundations match the public architecture;
- no secrets or private planning documents are committed.

## Phase 2 — Data core

Planned work covers registries, entities, locations, acceptance claims, evidence, verification events, source candidates, media metadata, legacy identifiers, imports, and validated public exports.

Completion requires Candidate/canonical separation, auditable verification states, allowlisted public exports, and traceable source/license metadata.

## Phase 3 — Administration and review

Planned work covers the protected administration shell, candidate review, claim editing, evidence review, state transitions, reconfirmation, media review, export control, and audit history.

Completion requires a full candidate-to-confirmed-to-validated-export path and auditable stale/reconfirmed/ended transitions.

## Phase 4 — Public core / MVP-A

Planned work covers place details, Places, Online Services, Home, Stats, Updates, public Roadmap, Changelog, trust pages, and administrator-managed media.

Completion requires mobile and desktop discovery with asset, network, route, instructions, evidence, freshness, and restorable map/list state.

## Phase 5 — Public submissions / MVP-B

Planned work covers suggestions, payment reports, problem reports, claims, photos, private status links, quarantine uploads, review queues, partial approval, requests for information, time-bounded holds, canonical transactions, and retention jobs.

Completion requires review-gated, auditable, atomic contribution handling. MVP-B completion defines the formal MVP.

## Phase 6 — Launch and cutover

Planned work covers migration audits, data quality, licensing, privacy, mobile, accessibility, performance, security, redirects, sitemap/robots, production cutover, monitoring, and rollback.

## Phase 7 — Stabilization

After cutover, the project verifies errors, redirects, search indexing, submissions, exports, mobile behavior, and migration completeness before retiring the legacy implementation.
