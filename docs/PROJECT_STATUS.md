# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 1 — Foundation

## Current implementation item

`P1-06 — Zod, Drizzle, and migration foundation`

## Active pull request

None after pull request #15 is merged.

## Latest completed work

- Repository created and default branch established as `main`.
- Phase 0 public specifications completed through pull requests #1 and #3 through #10.
- `P1-01 — Repository and application foundation` completed through [pull request #11](https://github.com/badjoke-lab/cryptopaymap/pull/11), merged as `1dd3232`.
- `P1-02 — Tailwind, design tokens, and responsive application shell` completed through [pull request #12](https://github.com/badjoke-lab/cryptopaymap/pull/12), merged as `2cc56dc`.
- `P1-03 — Reusable UI primitives and interaction states` completed through [pull request #13](https://github.com/badjoke-lab/cryptopaymap/pull/13), merged as `75f75a4`.
- `P1-04 — Motion tokens and reduced-motion behavior` completed through [pull request #14](https://github.com/badjoke-lab/cryptopaymap/pull/14), merged as `4952647`.
- `P1-05 — Client, server, and URL-state boundaries` completed through [pull request #15](https://github.com/badjoke-lab/cryptopaymap/pull/15), with locked dependency installation, Astro check, and static build validated in GitHub Actions.

## P1-05 delivered

- TanStack Query server-state foundation
- per-island Zustand application-state foundation
- deterministic discovery URL parsing and serialization
- Candidate-safe public status filtering
- browser Back and Forward restoration
- separate `history.state` storage for sheet, scroll, and filter-panel state
- public/private URL boundary documentation
- integrated state-ownership demonstration

## Next

1. Create the P1-06 branch from the merged P1-05 main.
2. Add Zod schemas for shared runtime validation.
3. Add Drizzle PostgreSQL configuration and initial schema foundation.
4. Add reviewable SQL migration generation and execution scripts.
5. Define database environment variables without committing credentials.
6. Prove that the public static build does not require database access.

## Blocked

None.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
