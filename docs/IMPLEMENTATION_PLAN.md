# CryptoPayMap implementation plan

This plan tracks repository work with stable implementation item IDs. Pull request numbers are recorded after a pull request is opened and may differ from item IDs.

## Status values

- `Planned`
- `In progress`
- `Completed`
- `Deferred`
- `Cancelled`

## Phase 0 — Public specifications and development control

| ID | Deliverable | Status | Depends on | Completion criteria | Pull request |
|---|---|---|---|---|---|
| P0-01 | Development control: `AGENTS.md`, this plan, project status, and PR template | In progress | Repository bootstrap | The repository has a usable plan, current-status file, contributor guidance, and PR checklist without internal-only information | TBD |
| P0-02 | `docs/PRODUCT_SPEC.md`, `docs/MVP_SCOPE.md` | Planned | P0-01 | Product purpose, scope, exclusions, MVP-A, MVP-B, and post-MVP boundaries are public and consistent | — |
| P0-03 | `docs/INFORMATION_ARCHITECTURE.md` | Planned | P0-02 | Public routes, navigation, contribution routes, roadmap, changelog, and redirects are fixed | — |
| P0-04 | `docs/DATA_MODEL.md` | Planned | P0-02 | Entity, location, acceptance claim, evidence, submission, media, registries, and public/private boundaries are defined | — |
| P0-05 | `docs/VERIFICATION_POLICY.md`, `docs/SOURCE_AND_LICENSE_POLICY.md` | Planned | P0-04 | Confirmation, stale, ended, evidence, recheck, source, attribution, and licensing rules are defined | — |
| P0-06 | `docs/SUBMISSION_WORKFLOW.md`, `docs/MEDIA_POLICY.md` | Planned | P0-04, P0-05 | Submission review, partial approval, holds, status links, media quarantine, rights, and retention are defined | — |
| P0-07 | `docs/TECH_ARCHITECTURE.md`, `docs/SECURITY_AND_PRIVACY.md` | Planned | P0-03, P0-04, P0-06 | Web architecture, mobile application behavior, infrastructure, security, privacy, accessibility, and performance are defined | — |
| P0-08 | `docs/OPERATIONS.md`, `docs/MIGRATION_AND_CUTOVER.md`, `docs/LAUNCH_CRITERIA.md`, `docs/ROADMAP.md` | Planned | P0-02 through P0-07 | Operations, migration, cutover, launch criteria, and public roadmap rules are consistent and cross-linked | — |

## Phase 1 — Foundation

| ID | Deliverable | Status | Depends on |
|---|---|---|---|
| P1-01 | Astro, React, TypeScript repository foundation | Planned | Phase 0 |
| P1-02 | Tailwind, design tokens, and responsive application shell | Planned | P1-01 |
| P1-03 | Reusable UI primitives and motion tokens | Planned | P1-02 |
| P1-04 | Zustand, TanStack Query, URL-state boundaries | Planned | P1-01 |
| P1-05 | Zod, Drizzle, and migration foundation | Planned | P1-01 |
| P1-06 | CI for lint, typecheck, unit tests, and build | Planned | P1-01 |
| P1-07 | Cloudflare staging foundation | Planned | P1-01, P1-06 |
| P1-08 | PWA manifest and accessibility baseline | Planned | P1-02, P1-03 |
| P1-09 | Public roadmap and changelog content loaders | Planned | P1-01 |

## Later phases

Later phases cover the data core, review administration, public discovery experience, public submissions, launch, and stabilization. Their item-level breakdown will be added before each phase begins, after the preceding public specifications and implementation results are reviewed.

## Unplanned work IDs

Use stable prefixes without renumbering planned work:

- `FIX-Px-NNN` for corrective work
- `SEC-Px-NNN` for security work
- `DATA-Px-NNN` for data integrity or migration work

## Update rules

At pull request start:

1. Mark the item `In progress`.
2. Update `docs/PROJECT_STATUS.md`.
3. Add the implementation item ID to the pull request body.

Before merge:

1. Verify the completion criteria.
2. Mark the item `Completed`.
3. Record the pull request number.
4. Move `docs/PROJECT_STATUS.md` to the next item.
5. Check public changelog and public roadmap impact.
