# OPS-P6-001I — Configured staging P6-05 public export and release evidence

## Purpose

Execute the repository-defined P6-05 public projection and release contract against an isolated Cloudflare Pages staging production target without touching CryptoPayMap production, custom domains, DNS, canonical data, or private material.

## Exact-main boundary

Execution requires:

- exact current `main` commit;
- current accepted P6-01 through P6-04 receipts on the same commit;
- one matching release/data/configuration/environment binding;
- the exact confirmation `EXECUTE_CONFIGURED_STAGING_P6_05`;
- a bounded release owner identity;
- successful repository contract validation.

Any changed main commit, stale predecessor, mismatched binding, missing credential, or unexpected Pages topology fails closed.

## Isolated target

The configured target is the existing `cryptopaymap-staging` Pages project.

Required topology:

- production branch: `staging-review`;
- exact project platform hostname: `cryptopaymap-staging.pages.dev`;
- no non-platform custom domain;
- no CryptoPayMap production hostname;
- no DNS mutation;
- no production project mutation.

The exact project-owned `.pages.dev` hostname is a Cloudflare platform domain, not a custom domain. It must be present in the project domain inventory and must match the project subdomain. Every other hostname remains disallowed and fails closed.

The existing `review` deployment remains a preview deployment. It is not treated as a rollback target. P6-05 creates and verifies production-style deployments only inside the isolated staging project.

## Artifact generation

The executor runs the complete staging-review build twice from one exact commit. Both builds must pass the existing schema, provenance, license, privacy, accessibility, route, Media, and staging-artifact validators and must produce the same public tree digest.

The static artifact must contain a top-level `404.html` generated from `src/pages/404.astro`. Without that file, Cloudflare Pages applies single-page-application fallback behavior and returns the home document with HTTP 200 for unknown navigation routes. P6-05 requires an unknown route to return HTTP 404 with an HTML error page.

The baseline and candidate deployment trees contain the same validated public projection. They differ only by `/p6-05-release.json`, a bounded configured-staging release marker used to distinguish active deployment identity externally. The marker contains no credential, private payload, canonical record, contact, object key, or unrestricted provider identifier.

## Release inventory and authentication

Every successful production-style deployment in the isolated staging project must expose a P6-05 release marker. The executor authenticates that marker by requiring the configured-staging environment, P6-05 evidence identity, a valid source commit and public tree digest, a baseline or candidate kind, and a release ID that exactly matches the value recomputed from those fields.

An authenticated marker matching the current exact commit and public tree digest is an exact-current release. An authenticated marker for an earlier commit or tree is an authenticated historical release. Historical releases are never reused as the current baseline or candidate; they are retained only as prior immutable release history and summarized by a bounded count in the receipt.

A missing, malformed, forged, wrong-environment, wrong-evidence, or incorrectly fingerprinted marker remains unrecognized and fails closed.

## Release sequence

1. Detect existing successful production deployments in the staging project.
2. Authenticate their P6-05 release markers and separate exact-current, historical, and unrecognized deployments.
3. Reject any unrecognized production deployment.
4. Reuse only a matching exact-current immutable baseline or candidate deployment when present.
5. Create only a missing exact-current baseline or candidate deployment.
6. Activate the exact candidate and verify its release marker at the Pages production hostname.
7. Verify representative pages, detail routes, public JSON, manifest, robots policy, public Media, and 404 behavior.
8. Roll back to the exact baseline deployment and verify the baseline marker externally.
9. Restore the exact candidate deployment and verify the candidate marker externally.
10. Leave the exact candidate active for the P6-06 handoff.

Cloudflare Pages rollback is used only with successful production deployments. Preview deployments are never rollback targets.

## Replay and failure behavior

The repository export-release contract remains authoritative for:

- validation failure before publication;
- immutable object conflict;
- active-pointer conflict;
- deterministic replay;
- changed-content conflict;
- concurrent activation conflict;
- partial staging failure;
- activation failure;
- rollback precondition failure.

The configured executor additionally handles repeated operational runs by discovering the exact baseline and candidate through their release markers and reusing them instead of creating an unrelated release chain.

## Evidence retained

The retained receipt may include only:

- exact source commit;
- timestamps and expiry;
- bounded owner hash;
- predecessor states and shared binding;
- public tree digest hashes;
- dataset and schema versions;
- platform-domain presence and exact subdomain-match booleans;
- non-platform custom-domain count;
- authenticated historical release count;
- hashed exact-current Pages deployment identifiers and URLs;
- representative route status/content-type/body digests;
- activation, rollback, restore, and final-state summaries;
- bounded exception classes.

It must not retain API tokens, account IDs, raw deployment IDs, database URLs, private records, private Media, signed URLs, unrestricted logs, or contact information.

## Receipt

Successful execution publishes:

`config/staging-authorization/p6-05-public-export-release-receipt.json`

The receipt is `accepted` only when deterministic generation, artifact validation, safe topology, release inventory authentication, candidate activation, external checks, baseline rollback, candidate restoration, and final exact-candidate state all pass.

## Completion

P6-05 is complete only when:

- the retained receipt is `accepted` on exact current main;
- P6-01 through P6-05 are current in the configured authorization inventory;
- P6-06 and P6-07 remain the only missing configured predecessors;
- production CryptoPayMap, non-platform custom domains, DNS, canonical data, and private material remain unchanged.
