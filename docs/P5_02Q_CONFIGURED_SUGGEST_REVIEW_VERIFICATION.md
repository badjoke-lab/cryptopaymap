# P5-02Q configured Suggest review verification

**Implementation item:** P5-02Q  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02Q turns the fixed review deployment from a static review surface into a deployment path that can verify the configured Suggest runtime boundary without claiming more than the environment proves.

The slice addresses two concrete gaps left after P5-02P:

1. the SQLite-backed Durable Object Worker existed in the repository but the fixed review workflow did not deploy it or bind it to the Pages Function environment;
2. the public Suggest page depended on build-time Turnstile site-key/action values, while the actual server verification contract is runtime environment-backed.

P5-02Q adds explicit deployment, runtime configuration delivery, authenticated readiness verification, and deployment receipt evidence.

## Cloudflare deployment model

The Submission rate-limit provider remains a separate Worker:

```text
cryptopaymap-submission-rate-limit
```

The fixed review Pages project is:

```text
cryptopaymap-staging
```

The Pages Function binding is:

```text
SUBMISSION_RATE_LIMIT_BUCKETS
```

and resolves to:

```text
class_name: SubmissionRateLimitBucket
script_name: cryptopaymap-submission-rate-limit
```

The binding is declared for both the top-level Pages configuration and the preview environment used by the fixed `review` branch deployment.

## Deployment order

The fixed review workflow runs in this order:

```text
validated staging-review build
↓
Cloudflare credential check
↓
configured Suggest input check
↓
Durable Object Worker deploy
↓
Pages secret synchronization for preview
↓
Pages review deployment with wrangler.jsonc binding configuration
↓
client configuration endpoint verification
↓
authenticated database + DO readiness verification
↓
Turnstile CSP header verification
↓
deployment receipt publication
```

A later step must not run when an earlier required deployment step failed.

## Pages secret synchronization

The workflow requires configured review values for:

```text
DATABASE_URL
CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL
CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL
CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID
CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL
CPM_SUBMISSION_CONTACT_RETENTION_DAYS
CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL
CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS
CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS
CPM_TURNSTILE_SECRET_KEY
PUBLIC_TURNSTILE_SITE_KEY
CPM_TURNSTILE_EXPECTED_HOSTNAME
CPM_TURNSTILE_EXPECTED_ACTION
CPM_SUGGEST_READINESS_TOKEN
```

Values are assembled into a temporary runner-local JSON file, bulk synchronized into the Pages preview environment, and deleted from the runner after the command completes.

The workflow does not print values.

## Runtime client configuration

The public Suggest page no longer reads Turnstile site key or action from build-time `import.meta.env` values.

The browser loads:

```text
GET /api/suggest/config
```

The endpoint validates the existing Turnstile runtime environment and returns only:

```json
{
  "siteKey": "<public site key>",
  "action": "submission_intake"
}
```

It does not return:

- Turnstile secret key;
- expected hostname;
- database URL;
- contact protection keys;
- status-secret key;
- rate-limit bucket key;
- readiness token.

When configuration is unavailable or malformed, the endpoint returns a bounded `503` and the browser form remains unavailable.

## Browser fail-closed behavior

`ConfiguredSuggestForm` loads same-origin runtime configuration before rendering the existing `SuggestForm`.

States are:

```text
loading
ready
error
```

Only `ready` renders the Suggest form and Turnstile widget.

A failed request, non-200 response, or malformed client configuration renders an unavailable state and does not render the submission button.

## Readiness boundary

The workflow verifies:

```text
GET /api/suggest/readiness
Authorization: Bearer <configured readiness token>
```

The readiness token is a dedicated secret and is not reused from database, HMAC, encryption, or Turnstile secrets.

Unauthorized requests receive:

```text
404 not_found
```

Authorized verification performs:

1. complete Suggest HTTP runtime composition;
2. database URL validation;
3. live lightweight database query;
4. live Durable Object namespace resolution;
5. live request to the bound Durable Object `/health` path;
6. strict `{ "status": "ready" }` response validation.

Success returns only:

```json
{
  "ready": true
}
```

Failure returns only:

```json
{
  "ready": false
}
```

No provider detail is returned.

## Durable Object health probe

The `SubmissionRateLimitBucket` accepts:

```text
GET /health
```

and returns:

```json
{
  "status": "ready"
}
```

This path does not consume a rate-limit request or update the fixed-window counter row.

The Durable Object constructor still verifies/creates its SQLite table as part of normal object initialization.

## Post-deployment verification

After Pages deployment, the workflow retries the fixed review URL until the new deployment is observable.

It verifies:

- `/api/suggest/config` returns `200` and a valid client-safe shape;
- `/api/suggest/readiness` returns `200` and `{ ready: true }` with the dedicated bearer token;
- `/suggest` response CSP includes the Cloudflare challenge origin;
- `frame-src` includes the Cloudflare challenge origin.

The fixed review URL is:

```text
https://review.cryptopaymap-staging.pages.dev
```

## Deployment receipt

The existing final success value remains:

```text
status: deployed
```

for compatibility with existing review-state interpretation.

The receipt now also records:

```text
checks.credentials
checks.configuredInputs
checks.durableObjectWorker
checks.pagesSecrets
checks.pagesDeployment
checks.configuredVerification
```

Failure status values are bounded:

```text
missing_credentials
missing_configuration
worker_deploy_failed
secret_sync_failed
deploy_failed
verification_failed
```

Repository merge must not be interpreted as configured live verification. The receipt for the intended main commit is the deployment evidence.

## What P5-02Q proves

When the receipt for the intended commit records `status: deployed` and all checks are `success`, P5-02Q proves:

- the DO Worker deployment step succeeded;
- Pages preview secret synchronization succeeded;
- the Pages review deployment succeeded;
- runtime client-safe Turnstile configuration is reachable;
- the database accepts a lightweight query;
- the Pages Function can resolve and call the bound DO namespace;
- the DO health response is valid;
- the `/suggest` Turnstile CSP is present at the fixed review URL.

## What P5-02Q does not prove

P5-02Q does not prove:

- a human-completed Turnstile challenge succeeds;
- Siteverify accepts a real token for the configured hostname and action;
- a real Suggest POST persists successfully end to end;
- deterministic replay of a real live submission succeeds;
- configured 429 behavior is reached under a real rate-limit sequence;
- log streams contain no sensitive values unless logs are separately inspected;
- reviewer workflow behavior for the resulting live Submission;
- P5-02 integration closure;
- P5-03 readiness.

Those claims require explicit later evidence and must not be inferred from readiness success.

## Security and privacy invariants

P5-02Q preserves these boundaries:

- server secrets remain server-only;
- browser configuration returns only public site key and action;
- readiness uses a dedicated bearer token;
- readiness failures are generic;
- the DO health path does not consume user rate-limit quota;
- no raw IP, plaintext email, plaintext status secret, challenge token, database URL, provider secret, or key material is returned;
- temporary secret-sync files are deleted on the runner;
- public Suggest intake still creates private review material only;
- no direct Candidate, canonical, export, or publication mutation is added.

## Completion criteria

P5-02Q repository work is complete when:

1. Pages wrangler configuration contains the exact DO binding with `script_name`;
2. the fixed review workflow deploys the DO Worker before Pages;
3. configured review inputs are checked before deployment;
4. Pages preview secrets are synchronized without value logging;
5. the Suggest browser loads client-safe runtime config from same origin;
6. build-time Turnstile config dependency is removed from `/suggest`;
7. readiness validates full runtime composition, database connectivity, and live DO binding/health;
8. readiness is protected by a dedicated bearer secret;
9. post-deploy verification checks config, readiness, and CSP;
10. deployment receipt preserves `deployed` success compatibility and records detailed check outcomes;
11. focused tests and deployment-contract checks pass;
12. full GitHub CI passes.

Configured environment verification is complete only after a receipt for the intended main commit records successful deployment and configured verification. Repository CI alone is not sufficient.
