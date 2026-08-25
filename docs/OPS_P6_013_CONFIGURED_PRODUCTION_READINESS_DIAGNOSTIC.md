# OPS-P6-013 — Configured production runtime readiness diagnostic

## Purpose

This slice provides the read-only production runtime readiness diagnostic required before any configured production authorization or go-live attempt under Issue #293 and the P6-08 contract.

The diagnostic determines whether the production control-plane and runtime prerequisites are present for one exact current `main` commit. It does not authorize production and it does not execute production.

Production mutation: none.

## Read-only boundary

The diagnostic may perform only observations:

- read the retained configured-staging P6-05 receipt;
- inspect the GitHub `production` environment and its protection-rule count;
- check whether required production-specific runtime inputs are configured, without retaining their values;
- read the Cloudflare account, zone, Pages-project, custom-domain, and DNS state;
- fetch the candidate Pages release marker over HTTPS;
- verify the unauthenticated Admin boundary and owner-session login entry point over HTTPS.

It does not create the production Pages project or deploy an artifact. It does not attach the production domain. It does not change DNS. It does not synchronize Pages secrets, mutate Neon, mutate R2, alter canonical data, or execute cutover.

## Dedicated production target

The intended new deployment target is the dedicated Pages project:

`cryptopaymap-production`

It must be distinct from the configured-staging project:

`cryptopaymap-staging`

Readiness cannot pass if the production project is missing or inaccessible.

## GitHub production environment guard

A GitHub `production` environment must already exist and must have at least one protection rule before protected readiness evaluation can run.

P6-013 uses two stages so the diagnostic never creates a missing environment merely by referring to it:

1. an **unbound probe job** performs a GET-only inspection of the repository `production` environment and its protection-rule count. This job does not bind `environment: production`;
2. only when that probe reports the environment as present with at least one protection rule does the **protected diagnostic job** run. That job binds `environment: production`, which is the only job allowed to read the production Environment secrets.

If the environment is missing or unprotected, a separate blocked-environment diagnostic path records a bounded blocked readiness receipt without binding `environment: production`. It therefore cannot implicitly create the missing environment and cannot read the protected production Environment secrets.

This preserves both requirements: missing/unprotected environment state remains an explicit fail-closed blocker, while correctly scoped Environment secrets become available once the guard has proven that the protected environment already exists.

## Production-specific runtime inputs

The protected diagnostic job checks whether the following production-specific runtime inputs are non-empty Environment secrets:

- `P6_08_PRODUCTION_DATABASE_URL`;
- `P6_08_PRODUCTION_REVIEW_SECRET_SEED_BASE64URL`;
- `P6_08_PRODUCTION_TURNSTILE_SECRET_KEY`;
- `P6_08_PRODUCTION_TURNSTILE_SITE_KEY`;
- `P6_08_PRODUCTION_ADMIN_OWNER_SECRET_BASE64URL`;
- `P6_08_PRODUCTION_ADMIN_OWNER_SUBJECT`;
- `P6_08_PRODUCTION_CREDENTIAL_GENERATION_ID`.

Their raw values are never written to the diagnostic receipt. Missing input names may be retained as bounded blockers. The production values belong in the protected GitHub `production` Environment rather than being duplicated into repository-scoped secrets merely to make the diagnostic see them.

The blocked-environment path does not inspect those protected values. Because the environment gate has already failed, readiness remains blocked before any protected runtime evaluation can become authoritative.

Staging/test Turnstile keys or staging-derived identities are not treated as production readiness.

Production Admin must be configured in `owner_session` mode with the protected owner secret and stable owner subject. This path does not require Cloudflare Access, an Access team domain, an Access audience, Zero Trust enrollment, or an Access service token. Staging Cloudflare Access and derived staging-service paths remain unchanged.

Readiness performs two unauthenticated Admin observations. `/admin/` must return exactly 403 with private/no-store/noindex/nosniff security headers. `/admin/login` must return exactly 200 with the same cache and indexing protections, proving that the application-native owner-session login path is present while the protected Admin workspace remains closed. A 503 configuration-unavailable response, a missing login route, or an unprotected Admin page is not launch-ready. Turnstile remains required at the owner-session login boundary.

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
- missing production-specific runtime input once protected evaluation is allowed;
- production/staging Pages-project collision;
- missing or inaccessible production Pages project;
- missing or ambiguous Cloudflare zone;
- missing current production-host DNS observation;
- candidate Pages release marker missing or not matching the P6-05 candidate release;
- production Admin `/admin/` not enforcing unauthenticated 403 with the required security headers;
- owner-session `/admin/login` not returning protected 200 with the required security headers.

A blocked result is evidence of a failed readiness condition, not authorization to provision or mutate anything outside the separately authorized operational step.

## Next boundary

A `ready` diagnostic is not authorization. Production still requires the separate explicit configured-production authorization gate and, after that, a separately bounded go-live execution that revalidates all evidence immediately before mutation.

Parent: #293. Original implementation: #415. Protected Environment secret-scope correction: #440.

## Production credential generation binding

The protected `P6_08_PRODUCTION_CREDENTIAL_GENERATION_ID` is an opaque generation marker for the complete configured-production credential and security-configuration set. Raw marker and credential values are never retained or logged; only a SHA-256 digest is retained as evidence.

Any rotation or material change to production database credentials, review-secret seed, Turnstile credentials, owner-session secret/subject, or other bound production credentials requires a new generation marker. Candidate bootstrap, readiness, configured-production authorization, and go-live must all bind the same credential-generation digest. A changed generation fails closed and requires a new readiness and authorization chain before any production mutation.
