# OPS-P6-013 — Configured production runtime readiness diagnostic

## Purpose

This slice adds the read-only production runtime readiness diagnostic required before any configured production authorization or go-live attempt under Issue #293 and the P6-08 contract.

The diagnostic determines whether the production control-plane and runtime prerequisites are present for one exact current `main` commit. It does not authorize production and it does not execute production.

Production mutation: none.

## Read-only boundary

The diagnostic may perform only observations:

- read the retained configured-staging P6-05 receipt;
- inspect the GitHub `production` environment and its protection-rule count;
- check whether required production-specific runtime inputs are configured, without retaining their values;
- read the Cloudflare account, zone, Pages-project, custom-domain, and DNS state;
- fetch the candidate Pages release marker over HTTPS.

It does not create the production Pages project or deploy an artifact. It does not attach the production domain. It does not change DNS. It does not synchronize Pages secrets, mutate Neon, mutate R2, alter canonical data, or execute cutover.

## Dedicated production target

The intended new deployment target is the dedicated Pages project:

`cryptopaymap-production`

It must be distinct from the configured-staging project:

`cryptopaymap-staging`

Readiness cannot pass if the production project is missing or inaccessible.

## GitHub production environment

A GitHub `production` environment must already exist and must have at least one protection rule before readiness can pass.

The diagnostic deliberately does not reference `environment: production` in its workflow job because GitHub can create a missing environment implicitly. A missing production environment must remain an explicit blocker rather than being silently created by a diagnostic run.

## Production-specific runtime inputs

The workflow checks only whether the following production-specific runtime inputs are non-empty:

- `P6_08_PRODUCTION_DATABASE_URL`;
- `P6_08_PRODUCTION_REVIEW_SECRET_SEED_BASE64URL`;
- `P6_08_PRODUCTION_TURNSTILE_SECRET_KEY`;
- `P6_08_PRODUCTION_TURNSTILE_SITE_KEY`;
- `P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN`;
- `P6_08_PRODUCTION_CF_ACCESS_AUD`.

Their raw values are never written to the diagnostic receipt. Missing input names may be retained as bounded blockers.

Staging/test Turnstile keys or staging-derived identities are not treated as production readiness.

Production Admin must be configured in `cloudflare_access` mode with the protected Cloudflare Access team domain and audience. Readiness performs an unauthenticated request to `/admin/` and requires exactly 403 with private/no-store/noindex/nosniff security headers. A 503 configuration-unavailable response is not launch-ready.

## Release authority

The diagnostic requires the current accepted P6-05 candidate release on the same exact commit. It reads the candidate release ID from the retained P6-05 receipt and then observes:

`https://cryptopaymap-production.pages.dev/p6-05-release.json`

The response must contain the exact P6-05 candidate release ID. HTTP 200 alone is not sufficient. The receipt retains only digests of expected and observed release identities.

## Cloudflare observations

The diagnostic uses GET-only Cloudflare API access to observe:

- the dedicated production Pages project;
- the active `cryptopaymap.com` zone;
- current DNS records for `cryptopaymap.com`;
- custom domains currently associated with `cryptopaymap-production`.

Raw zone IDs, Pages project IDs, DNS record IDs, and record targets are not retained. Their bounded digests may be retained.

An attached production custom domain is observed but is not itself a requirement for the pre-cutover readiness decision. Domain attachment remains a later bounded go-live mutation.

## Decision

The diagnostic writes `P6-08-READINESS` with `state: diagnosed` and either:

- `decision: ready`; or
- `decision: blocked`.

Readiness fails closed on any of the following:

- wrong confirmation;
- invalid or changed exact main;
- failed repository contract;
- stale, failed, or wrong-commit P6-05 evidence;
- missing GitHub `production` environment;
- missing production-environment protection rule;
- missing production-specific runtime input;
- production/staging Pages-project collision;
- missing or inaccessible production Pages project;
- missing or ambiguous Cloudflare zone;
- missing current production-host DNS observation;
- candidate Pages release marker missing or not matching the P6-05 candidate release;
- production Admin `/admin/` not enforcing unauthenticated 403 with the required security headers.

## Next boundary

A `ready` diagnostic is not authorization. Production still requires the separate explicit configured-production authorization gate and, after that, a separately bounded go-live execution that revalidates all evidence immediately before mutation.

Parent: #293. Implementation: #415.

## Production credential generation binding

The protected `P6_08_PRODUCTION_CREDENTIAL_GENERATION_ID` is an opaque generation marker for the complete configured-production credential and security-configuration set. Raw marker and credential values are never retained or logged; only a SHA-256 digest is retained as evidence.

Any rotation or material change to production database credentials, review-secret seed, Turnstile credentials, Cloudflare Access configuration, or other bound production credentials requires a new generation marker. Candidate bootstrap, readiness, configured-production authorization, and go-live must all bind the same credential-generation digest. A changed generation fails closed and requires a new readiness and authorization chain before any production mutation.
