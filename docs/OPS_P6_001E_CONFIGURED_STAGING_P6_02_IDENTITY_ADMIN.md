# OPS-P6-001E — Configured staging P6-02 identity and protected Admin evidence

## Purpose

Execute the repository P6-02 contract against the fixed configured staging environment and retain one redacted, exact-main receipt.

Repository tests prove parsing and fail-closed behavior. They do not prove that the intended Cloudflare Access application, policies, service identities, Pages environment values, protected routes, or capability allowlists are configured and operating.

## Preconditions

- exact current `main` commit;
- current configured staging deployment and fixed-review live audit;
- non-expired accepted P6-01 receipt;
- P6-01 release, data, configuration, and environment binding;
- Cloudflare API credentials with bounded read access to the configured Access application and policies;
- two staging-only Access service identities:
  - review identity;
  - publication identity;
- deployed Pages configuration mapping each identity only to its intended capability family.

Secret values and live identity identifiers are never written to repository files, Issues, summaries, or retained receipts.

## Guarded dispatch

The workflow accepts only:

```text
confirmation    EXECUTE_CONFIGURED_STAGING_P6_02
approved_commit exact 40-character current main SHA
identity_owner  bounded operational owner identity
```

Any mismatch fails closed.

## Configured secret names

The execution reads these existing protected values without printing or retaining them:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CPM_STAGING_ACCESS_REVIEWER_CLIENT_ID
CPM_STAGING_ACCESS_REVIEWER_CLIENT_SECRET
CPM_STAGING_ACCESS_PUBLISHER_CLIENT_ID
CPM_STAGING_ACCESS_PUBLISHER_CLIENT_SECRET
```

The review and publication service identities must be distinct.

## Protected surface inventory

The executor derives the complete deployed Admin Function inventory from `functions/admin/**` and records only:

- route count;
- method coverage;
- deterministic inventory digest.

It does not retain source payloads or private responses.

## Control-plane checks

The executor verifies the configured Cloudflare Access organization, exact staging Admin application, audience shape, policy inventory, service-auth policy presence, and policy digest.

The receipt retains only bounded hashes, counts, booleans, timestamps, and safe error classes. Application IDs, audience values, issuer values, policy IDs, and service-token identifiers are not retained in raw form.

## Negative journey matrix

Every derived protected route and method is called:

1. without an Access assertion or service identity;
2. with only a forged `Cf-Access-Authenticated-User-Email` header.

Each request must be denied or redirected to the configured Access challenge without private response leakage. Protected responses must remain private or non-cacheable where the application origin handles the response.

A forged email header never creates an authenticated identity.

## Positive capability matrix

The staging-only review service identity must:

- reach the protected dashboard;
- receive private/no-store response behavior;
- be denied publication activation.

The staging-only publication service identity must:

- be denied dashboard access;
- reach the protected publication boundary far enough for an intentionally invalid body to receive the bounded validation response;
- never activate a release during this P6-02 execution.

The application validates the Access JWT signature, issuer, audience, time bounds, and verified service-token `common_name` before normalizing a service identity. An empty `sub` without a valid verified service-token common name fails closed.

## Receipt

The workflow writes:

```text
config/staging-authorization/p6-02-identity-admin-receipt.json
```

Required receipt properties:

- `evidenceId: P6-02`;
- `environment: configured_staging`;
- exact commit;
- non-expired timestamps;
- exact P6-01 shared binding;
- route inventory digest;
- redacted control-plane result;
- bounded negative and positive journey summaries;
- no raw assertions, cookies, credentials, email addresses, private rows, or unrestricted logs;
- empty exception list for `accepted`.

## Pass rule

P6-02 is accepted only when:

- exact main matches;
- repository contract and self-test pass;
- P6-01 is current;
- the full protected route inventory is non-empty;
- the configured Access application and policy checks pass;
- every negative journey fails closed;
- the review and publication identities pass the capability-separation matrix;
- the receipt retains the unchanged P6-01 binding;
- no exception remains.

## Exclusions

This procedure does not:

- modify production Access;
- authorize configured staging;
- mutate canonical data;
- activate a public release;
- execute Neon transaction evidence;
- execute R2 lifecycle evidence;
- change DNS or production domains.

P6-03 owns the next configured predecessor after P6-02 is accepted and current.


## Configured staging derived service authentication

Configured staging uses `CPM_ADMIN_AUTH_MODE=derived_staging_service`. Reviewer and publisher
HMAC keys are derived from the existing review seed with separate HKDF labels and synchronized
only to the Pages preview environment. Each request carries a role, timestamp, and HMAC signature;
the signature is verified with WebCrypto inside a bounded clock window. Unverified email headers,
missing signatures, stale signatures, and cross-role signatures fail closed. Production and the
default mode remain Cloudflare Access with issuer, audience, and signature validation. No raw key
or request signature may be retained in logs, receipts, artifacts, or repository files.
