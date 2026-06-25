# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 1 — Foundation

## Current implementation item

`P1-05 — Client, server, and URL-state boundaries`

## Active pull request

None after pull request #14 is merged.

## Latest completed work

- Repository created and default branch established as `main`.
- Phase 0 public specifications completed through pull requests #1 and #3 through #10.
- `P1-01 — Repository and application foundation` completed through [pull request #11](https://github.com/badjoke-lab/cryptopaymap/pull/11), merged as `1dd3232`.
- `P1-02 — Tailwind, design tokens, and responsive application shell` completed through [pull request #12](https://github.com/badjoke-lab/cryptopaymap/pull/12), merged as `2cc56dc`.
- `P1-03 — Reusable UI primitives and interaction states` completed through [pull request #13](https://github.com/badjoke-lab/cryptopaymap/pull/13), merged as `75f75a4`.
- `P1-04 — Motion tokens and reduced-motion behavior` completed through [pull request #14](https://github.com/badjoke-lab/cryptopaymap/pull/14), with locked dependency installation, Astro check, and static build validated in GitHub Actions.

## P1-04 delivered

- Motion for React foundation
- 80 / 140 / 220 / 320ms duration tokens
- standard, enter, and exit easing tokens
- operating-system-aware reduced-motion policy
- Astro ClientRouter page-transition boundary
- CSS state motion for Dialog, Sheet, Select, and Toast
- reduced-motion-aware content replacement
- map and bottom-sheet motion constraints
- public motion-system documentation

## Next

1. Create the P1-05 branch from the merged P1-04 main.
2. Add TanStack Query and Zustand foundations.
3. Define the public URL parameter schema for viewport, filters, selection, and map/list mode.
4. Separate server state, application UI state, shareable URL state, and local component state.
5. Prove serialization and browser-navigation restoration without placing private state in URLs.

## Blocked

None.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
