# P5-02Q configured Suggest review verification

**Implementation item:** P5-02Q  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02Q turns the fixed review deployment from a static review surface into a deployment path that can verify the configured Suggest runtime boundary without claiming more than the environment proves.

The slice provides:

- separate deployment of the SQLite-backed Submission rate-limit Durable Object Worker;
- explicit Pages-to-Worker Durable Object binding;
- runtime-safe Turnstile browser configuration;
- authenticated database and Durable Object readiness verification;
- fixed review post-deployment checks;
- a durable deployment receipt.

## Cloudflare deployment model

The Submission rate-limit provider is the separate Worker:

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

The binding is declared for the Pages configuration and the preview environment used by the fixed `review` branch deployment.

## Deployment order

```text
validated staging-review build
↓
Cloudflare credential check
↓
review database URL and root-seed check
↓
stable review-secret derivation
↓
Durable Object Worker deploy
↓
Pages preview secret synchronization
↓
Pages review deployment with Durable Object binding
↓
client configuration endpoint verification
↓
authenticated database + Durable Object readiness verification
↓
Turnstile CSP verification
↓
deployment receipt publication
```

Later steps must not run after a required earlier step fails.

## Manual repository secrets

The fixed review workflow requires only these two Suggest-specific repository secrets:

```text
DATABASE_URL
CPM_REVIEW_SECRET_SEED_BASE64URL
```

`DATABASE_URL` is the PostgreSQL connection string for the fixed review database.

`CPM_REVIEW_SECRET_SEED_BASE64URL` must be canonical unpadded Base64URL encoding of exactly 32 random bytes. It is a root secret for the fixed review environment only.

The root seed must remain stable while review Submission data needs to remain readable and verifiable. Rotating it changes every derived key and invalidates existing review status secrets, contact ciphertext access, email hashes, rate-limit buckets, and readiness authentication.

The root seed must not be used in production and must not be reused by another project or environment.

## Stable review-secret derivation

The workflow uses HKDF-SHA-256 with versioned domain separation:

```text
salt: cryptopaymap:review-suggest:v1
```

It derives separate values for:

```text
CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL
CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL
CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL
CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL
CPM_SUGGEST_READINESS_TOKEN
```

Each cryptographic key is 32 bytes. Each use has a different HKDF info label. Derived values are deterministic for the same seed and distinct across purposes.

The workflow masks derived values, writes them only to runner-local files with restricted permissions, synchronizes them to the Pages preview environment, and deletes the temporary files.

## Fixed review policy values

The review environment uses explicit non-production policy values:

```text
CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID=review-v1
CPM_SUBMISSION_CONTACT_RETENTION_DAYS=180
CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS=5
CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS=600
CPM_TURNSTILE_EXPECTED_HOSTNAME=review.cryptopaymap-staging.pages.dev
CPM_TURNSTILE_EXPECTED_ACTION=submission_intake
```

These values are deployment policy, not secrets.

## Turnstile review mode

The fixed review environment uses Cloudflare's published always-pass testing pair:

```text
site key:   1x00000000000000000000AA
secret key: 1x0000000000000000000000000000000AA
```

These are official testing values, not production credentials. They are used only on the fixed review environment so automated and manual integration work is not blocked by a production Turnstile widget.

Production must use a real widget and secret pair with its own hostname policy.

## Runtime client configuration

The browser loads:

```text
GET /api/suggest/config
```

The endpoint returns only:

```json
{
  "siteKey": "<public site key>",
  "action": "submission_intake"
}
```

It does not return the Turnstile secret, expected hostname, database URL, root seed, derived keys, or readiness token.

When runtime configuration is unavailable or malformed, the endpoint returns a bounded `503` and the browser form remains unavailable.

## Readiness boundary

The workflow verifies:

```text
GET /api/suggest/readiness
Authorization: Bearer <derived readiness token>
```

Unauthorized requests receive `404 not_found`.

Authorized verification performs:

1. complete Suggest HTTP runtime composition;
2. database URL validation;
3. a live lightweight database query;
4. live Durable Object namespace resolution;
5. a live request to the bound Durable Object `/health` path;
6. strict `{ "status": "ready" }` response validation.

Success returns only:

```json
{ "ready": true }
```

Failure returns only:

```json
{ "ready": false }
```

No provider detail is returned.

## Durable Object health probe

`GET /health` returns:

```json
{ "status": "ready" }
```

The health path does not consume a rate-limit request or update the fixed-window counter.

## Post-deployment verification

The workflow retries the fixed review URL until the new deployment is observable. It verifies:

- `/api/suggest/config` returns the exact fixed-review site key and action;
- `/api/suggest/readiness` returns `200` and `{ ready: true }` with the derived bearer token;
- `/suggest` includes the required Turnstile CSP directives.

Fixed review URL:

```text
https://review.cryptopaymap-staging.pages.dev
```

## Deployment receipt

Full success preserves:

```text
status: deployed
```

The receipt records:

```text
checks.credentials
checks.configuredInputs
checks.durableObjectWorker
checks.pagesSecrets
checks.pagesDeployment
checks.configuredVerification
```

It also records non-secret review configuration metadata, including the derivation version, test-key mode, retention days, and rate-limit policy.

Failure statuses remain bounded:

```text
missing_credentials
missing_configuration
worker_deploy_failed
secret_sync_failed
deploy_failed
verification_failed
```

Repository merge is not configured-environment proof. The receipt for the intended `main` commit is the deployment evidence.

## What readiness proves

A successful receipt proves:

- Cloudflare deployment credentials were accepted;
- required review inputs were present and the seed was valid;
- the Durable Object Worker deployment step succeeded;
- Pages preview secret synchronization succeeded;
- the Pages review deployment succeeded;
- runtime client configuration is reachable;
- the database accepts a lightweight query;
- the Pages Function can resolve and call the bound Durable Object;
- the deployed Suggest CSP is present.

## What readiness does not prove

It does not prove:

- production Turnstile configuration;
- a production human challenge;
- a real production Siteverify result;
- a successful live Suggest POST and private persistence;
- deterministic live replay;
- configured live 429 behavior;
- sensitive-log inspection;
- reviewer workflow behavior for a resulting live Submission;
- P5-02 integration closure;
- P5-03 readiness.

## Security and privacy invariants

- the root seed and all derived values remain server-only;
- one seed is expanded only through versioned, purpose-separated HKDF labels;
- the browser receives only the public test site key and action;
- readiness failures are generic;
- temporary secret files are deleted;
- no raw IP, plaintext email, plaintext status secret, challenge token, database URL, root seed, or derived key is returned;
- public Suggest intake still creates private review material only;
- no direct Candidate, canonical, export, or publication mutation is added.

## Completion criteria

Repository work is complete when:

1. the Pages Durable Object binding is explicit;
2. the fixed review workflow deploys the Worker before Pages;
3. manual Suggest configuration is reduced to `DATABASE_URL` and one valid root seed;
4. stable purpose-separated derivation is tested;
5. fixed review policy values and official Turnstile testing keys are explicit;
6. Pages secrets are synchronized without value logging;
7. runtime browser configuration remains client-safe and fail-closed;
8. readiness validates runtime composition, database connectivity, and live Durable Object health;
9. post-deploy verification checks config, readiness, and CSP;
10. the deployment receipt records detailed outcomes;
11. focused tests, deployment-contract checks, and full GitHub CI pass.

Configured review verification completes only after the receipt for the intended main commit records successful deployment and configured verification.
