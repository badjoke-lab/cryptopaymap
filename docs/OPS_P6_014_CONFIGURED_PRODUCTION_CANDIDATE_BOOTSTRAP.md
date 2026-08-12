# OPS-P6-014 — Configured production candidate bootstrap

## Purpose

This slice creates the guarded production candidate required before final configured-production readiness, authorization, and live cutover under Issue #293.

The candidate is deployed only to the dedicated Cloudflare Pages project `cryptopaymap-production`. It is not attached to the live domain and is not itself a production launch.

## Explicit execution boundary

The workflow is explicit-dispatch only and requires the exact confirmation:

`BOOTSTRAP_CONFIGURED_PRODUCTION_CANDIDATE`

It also requires the exact current `main` commit and a bounded bootstrap owner.

No mutation job may start unless a protected GitHub `production` environment already exists with at least one protection rule. The preflight observes that environment before the workflow references `environment: production`; the workflow must not silently create a missing production environment.

## Release authority and candidate artifact

The current accepted configured-staging P6-05 candidate release remains the release authority. The bootstrap does not invent a second release identity.

The deployed `p6-05-release.json` marker therefore retains the exact P6-05 candidate `releaseId` as both `releaseId` and `authorityReleaseId`.

The production candidate has a separate candidate artifact digest. `candidateArtifactId` binds:

- exact source commit;
- P6-05 candidate release authority;
- deterministic production-candidate public tree digest;
- dedicated Pages project name.

This keeps the approval/release authority separate from the bytes of the pre-live production candidate while preserving an exact cryptographic binding between them.

## Production candidate data boundary

Synthetic staging review data is not materialized for this candidate. The bootstrap runs the normal exact-main static build and derives machine-readable metadata from the committed reviewed public data files present in that build.

It requires and fingerprints:

- `/data/places.json`;
- `/data/place-pins.json`;
- `/data/online-services.json`;
- `/data/stats.json`;
- `/data/updates.json`.

It materializes candidate `version.json` and `data/manifest.json`, preserving `canonicalOnly: true`, then builds twice and requires the public tree digest to be identical before the release-authority marker is written.

The candidate marker itself is excluded from the public tree digest so the marker can describe that exact tree without a circular hash.

## Dedicated Pages target

The only permitted candidate target is:

`cryptopaymap-production.pages.dev`

The project must be distinct from `cryptopaymap-staging`.

If the project is absent, the guarded mutation job may create only `cryptopaymap-production` with production branch `main`. If it already exists, the workflow must fail closed unless its topology matches the expected project name, platform subdomain, production branch, and zero custom domains.

An existing unknown project, wrong branch, wrong platform subdomain, or any custom-domain attachment is a no-go condition.

## Protected runtime inputs

The mutation job runs under the protected GitHub `production` environment and requires these production-specific protected inputs:

- `P6_08_PRODUCTION_DATABASE_URL`;
- `P6_08_PRODUCTION_REVIEW_SECRET_SEED_BASE64URL`;
- `P6_08_PRODUCTION_TURNSTILE_SECRET_KEY`;
- `P6_08_PRODUCTION_TURNSTILE_SITE_KEY`;
- `P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN`;
- `P6_08_PRODUCTION_CF_ACCESS_AUD`.

Raw values are never written to the repository, retained receipt, summary, or artifact.

Production Admin uses `CPM_ADMIN_AUTH_MODE=cloudflare_access` with the protected Cloudflare Access team domain and audience. Staging-derived Admin HMAC keys are deliberately not installed as production Admin credentials.

The production seed is used only to derive the existing bounded runtime secrets before a protected Pages secret bulk update. Production Turnstile values are mapped to the runtime names used by the application. The intended Turnstile hostname remains `cryptopaymap.com`; the candidate pages.dev hostname is not treated as the canonical live hostname.

## External verification

After deployment the workflow verifies the candidate through `https://cryptopaymap-production.pages.dev` and requires:

- root HTML;
- `version.json`;
- `data/manifest.json`;
- `robots.txt`;
- exact P6-05 release authority in `p6-05-release.json`;
- exact `candidateArtifactId` and public tree digest;
- exact dataset/schema identity and `canonicalOnly: true` in machine-readable metadata;
- safe Pages topology with no custom domains;
- unauthenticated `/admin/` returns exactly 403, not 200/redirect/503, with `private, no-store`, `noindex, nofollow, noarchive`, and `nosniff` security headers.

HTTP success without the expected marker and candidate artifact identity is not sufficient.

## Hard non-goals

This slice does not attach `cryptopaymap.com`.

It does not change DNS.

It does not switch the canonical host, create redirects for the live hostname, alter certificates, or purge live caches. It does not execute cutover.

It does not authorize configured production and does not close P6-08 launch evidence.

The existing live service remains untouched.

## Retained evidence

A successful run writes a bounded receipt to:

`config/production-authorization/production-candidate-bootstrap-receipt.json`

The receipt may retain:

- exact commit;
- timestamps and expiry;
- digests of owner, P6-05 receipt, release authority, provider project ID, routes, and candidate artifact;
- dataset/schema versions;
- safe topology counts and statuses.

It must not retain credentials, raw database URLs, raw seed material, Turnstile keys, unrestricted provider responses, private data, or private submission material.

## Next boundary

After this implementation and any remaining pre-live executor work are merged, regenerate P6-01 through P6-07 on the final exact `main`, re-authorize configured staging, bootstrap the candidate under the protected production environment, run the read-only production readiness diagnostic, and only then issue a separate configured-production authorization.

Production authorization is still not go-live execution. Live-domain mutation remains a later separately bounded operation.

Parent: #293. Implementation: #417.
