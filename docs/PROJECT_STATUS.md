# CryptoPayMap project status

**Last verified:** 2026-06-26  
**Repository:** `badjoke-lab/cryptopaymap`

## Current phase

Phase 1 — Foundation

## Current implementation item

`P1-06 — Zod, Drizzle, and migration foundation`

## Active pull request

[#16 — P1-06: Add Zod Drizzle and migration foundation](https://github.com/badjoke-lab/cryptopaymap/pull/16) — Draft

## Latest completed work

- Repository created and default branch established as `main`.
- Phase 0 public specifications completed through pull requests #1 and #3 through #10.
- `P1-01 — Repository and application foundation` completed through [pull request #11](https://github.com/badjoke-lab/cryptopaymap/pull/11), merged as `1dd3232`.
- `P1-02 — Tailwind, design tokens, and responsive application shell` completed through [pull request #12](https://github.com/badjoke-lab/cryptopaymap/pull/12), merged as `2cc56dc`.
- `P1-03 — Reusable UI primitives and interaction states` completed through [pull request #13](https://github.com/badjoke-lab/cryptopaymap/pull/13), merged as `75f75a4`.
- `P1-04 — Motion tokens and reduced-motion behavior` completed through [pull request #14](https://github.com/badjoke-lab/cryptopaymap/pull/14), merged as `4952647`.
- `P1-05 — Client, server, and URL-state boundaries` completed through [pull request #15](https://github.com/badjoke-lab/cryptopaymap/pull/15), merged as `0228e0a`.

## P1-06 current deliverables

- pinned Zod, Drizzle ORM, Drizzle Kit, Neon serverless driver, and tsx dependencies
- shared runtime schemas
- foundational PostgreSQL enums
- explicit Neon database factory
- Drizzle configuration and migration commands
- generated initial SQL migration and metadata
- database foundation documentation
- CI checks for runtime schemas and migration history

## Next

1. Run the final locked dependency installation.
2. Run Astro and TypeScript checks.
3. Run runtime schema checks.
4. Run migration history checks.
5. Run the static build without database configuration.
6. Correct any integration errors before advancing to P1-07.

## Blocked

P1-06 remains a draft until all final-head checks pass.

## Verification rule

The actual `main` branch, merged pull requests, and available CI results are authoritative. When this file disagrees with repository reality, update this file to match the repository.
