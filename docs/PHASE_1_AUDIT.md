# Phase 1 integration audit

**Status:** In progress  
**Item:** `P1-12`

## Repository results

P1-01 through P1-11 are merged. Their application shell, UI primitives, motion, state boundaries, database foundation, CI, staging contract, PWA metadata, accessibility baseline, and public content loaders are present.

The automated audit checks required files, dependencies, commands, manifest settings, shared layout contracts, public content sources, staging workflow boundaries, public-build artifacts, and tracked-file publication boundaries.

## External staging gate

Create the Cloudflare Pages project `cryptopaymap-staging` and a GitHub environment named `staging`. Add environment values named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then manually run the `Deploy staging` workflow from merged `main`.

Record the deployment URL and commit SHA. Verify Home, Roadmap, Changelog, manifest, icons, response headers, keyboard focus, skip-link behavior, reduced motion, mobile viewport behavior, and the absence of private configuration in public files.

## Completion rule

P1-12 completes only after repository CI is green and the live staging deployment is recorded and checked. Until then, Phase 1 remains in progress and no live staging URL is claimed.
