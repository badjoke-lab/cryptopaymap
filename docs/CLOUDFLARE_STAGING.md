# CryptoPayMap Cloudflare staging

## Purpose

This document defines the staging deployment contract for the static CryptoPayMap application. It separates a reproducible build artifact from the credentials and project provisioning required to publish that artifact.

## Deployment target

```text
Platform: Cloudflare Pages
Project: cryptopaymap-staging
Output directory: dist
Deployment branch: staging
Configuration: wrangler.jsonc
```

The staging Pages project is separate from the eventual production deployment contract. A staging deployment is not a production release and does not update the product Changelog.

## Build contract

```bash
npm ci
npm run quality
```

The quality command produces and verifies `dist` without requiring a database connection or Cloudflare credentials.

The staging artifact must include:

- generated static HTML;
- Astro fingerprinted assets;
- public JSON fixtures or generated data approved for the current phase;
- `_headers` copied from `public/_headers`;
- no server-only configuration markers.

`npm run staging:check` verifies the artifact before upload or deployment.

## Local Pages preview

```bash
npm run pages:dev
```

This builds the site, verifies the artifact, and serves the configured Pages output through Wrangler's local Pages runtime.

## Manual staging deployment

The repository includes `.github/workflows/staging-deploy.yml`.

The workflow:

1. runs only through manual dispatch;
2. uses the GitHub `staging` environment;
3. installs the locked dependency graph;
4. runs the complete quality gate;
5. uploads the exact `dist` directory as a GitHub artifact;
6. deploys that directory to the `staging` branch of `cryptopaymap-staging`.

Ordinary pull requests do not deploy to Cloudflare.

## Required GitHub environment configuration

Create a GitHub environment named:

```text
staging
```

Configure these environment secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Only the names belong in repository documentation. Values remain in the GitHub environment and must not appear in repository files, pull requests, logs, artifacts, or generated pages.

The API token should be limited to the Cloudflare account and permissions required for Pages deployment.

## Provisioning timing

Do not provision the external staging project during P1-08 repository work.

Provision and connect Cloudflare only after P1-09, P1-10, and P1-11 are merged. Run the first credential-scoped staging deployment before P1-12 is closed. This timing gives the integration audit a representative PWA, accessibility, and content-loading surface while ordinary pull requests remain independent from Cloudflare credentials.

## Initial Pages project provisioning

Before the first automated deployment, create the Pages project under the intended Cloudflare account.

A maintainer may use Wrangler interactively:

```bash
npx wrangler pages project create cryptopaymap-staging
```

Use `main` only when the project later needs a designated production branch. The repository's manual staging workflow deploys an explicit `staging` preview branch.

Project creation is an account operation and is not performed automatically by pull-request CI.

## Preview access

Staging may contain unfinished public interface work. Protect the staging project or preview aliases with Cloudflare Access when wider public access is not intended.

Access protection must not be implemented through application code or embedded credentials.

## Headers and caching

`public/_headers` defines the initial Pages response policy.

Global responses receive:

- MIME sniffing protection;
- frame embedding denial;
- strict-origin referrer behavior;
- restricted camera, microphone, geolocation, and payment permissions.

Fingerprint-addressed Astro assets receive long immutable caching.

Public data under `/data/` receives a short browser cache and revalidation requirement so that payment information is not treated as permanently current.

A Content Security Policy is intentionally deferred until the staging application can be tested against real generated scripts, styles, map resources, images, and future submission endpoints. It must be added before production launch through the security and accessibility review process.

## Preview and production separation

- Staging uses the `cryptopaymap-staging` Pages project.
- Staging configuration contains no production database, storage, support-payment, or administration values.
- The static public build does not connect to Neon.
- Protected API and administration bindings are introduced separately when those server paths exist.
- A later production deployment requires its own reviewed project, environment, domain, and release procedure.

## CI artifact

Every successful foundation validation run uploads:

```text
cryptopaymap-staging-dist
```

This artifact proves that the exact static output is available before Cloudflare deployment. It may be inspected without granting Cloudflare access.

## Failure and rollback

If artifact validation fails, no staging deployment should occur.

If Cloudflare deployment fails:

- the GitHub artifact remains available for inspection;
- the previous Pages deployment remains active;
- no product release should be recorded;
- correct the configuration or account setup and rerun the manual workflow.

Cloudflare Pages deployment history provides the deployment-level rollback path. Repository rollback remains a normal Git revert or follow-up pull request.

## Current completion boundary

P1-08 proves:

- locked Wrangler tooling;
- a valid Pages configuration;
- a deterministic deployable artifact;
- header and cache policy;
- a manual credential-scoped deployment workflow;
- preview and production separation.

A live staging URL requires the external Pages project and GitHub environment credentials to be provisioned. Repository checks do not claim that this external provisioning has occurred.
