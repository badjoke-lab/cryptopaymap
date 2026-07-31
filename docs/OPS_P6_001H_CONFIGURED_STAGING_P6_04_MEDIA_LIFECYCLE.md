# OPS-P6-001H configured staging P6-04 Media lifecycle evidence

## Purpose

This operational slice executes the repository-defined P6-04 Media lifecycle contract against configured staging.

The production/default storage implementation remains R2. Configured staging uses an isolated Durable Object object store because launch evidence must be executable without weakening the production storage contract or retaining operational credentials in repository content.

## Preconditions

The guarded workflow requires:

- exact confirmation `EXECUTE_CONFIGURED_STAGING_P6_04`;
- the exact current `main` commit;
- a bounded Media operations owner;
- current accepted P6-01, P6-02, and P6-03 receipts with one shared binding;
- configured fixed-review database and review seed;
- successful repository Media and P6-04 contract checks.

## Storage boundary

The staging store is available only when `CPM_ADMIN_AUTH_MODE` is `derived_staging_service`.

It uses:

- the existing configured-staging Durable Object Worker;
- one isolated Durable Object instance;
- one reserved Media asset UUID;
- fixed private and public key prefixes;
- a one-megabyte fixture limit;
- SHA-256 verification before storage;
- PNG, JPEG, or WebP signature and dimension inspection;
- private `no-store` responses and public short-cache responses.

The Worker default public fetch handler remains `404`. Private objects are reachable only through the protected reviewer route. Public reads can reach only the reserved public derivative prefix.

## Configured journey

The retained execution proves:

1. missing, expired, and forged-header upload requests are denied;
2. disguised non-image bytes are rejected after byte inspection;
3. one synthetic PNG original and deterministic WebP display/thumbnail derivatives are stored privately;
4. the original and derivatives remain unavailable from the public route before approval;
5. an injected object-publication failure cleans the first public object and leaves it externally unavailable;
6. the existing Media decision service commits one public approval and returns one deterministic replay under concurrent exact requests;
7. changed-content replay and publisher-role Media review are denied;
8. approved derivatives are externally readable with matching digests and public cache headers;
9. the existing Media restriction decision revokes both public derivatives;
10. public reads return `404` after takedown;
11. every fixture object, Media file, Media asset, and Media decision row is deleted.

## Fixture boundary

The fixture uses reserved UUIDs and synthetic one-pixel image bytes. It contains no user upload, private Evidence, contact, business information, reviewed public Media, or production object.

The fixture is deleted before execution, after successful execution, and again from the final failure cleanup path.

## Receipt

The workflow publishes:

```text
config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json
```

The historical receipt path remains unchanged so the P6-01 through P6-08 authorization contract stays stable. The receipt records `mode: durable_object_staging_media` for configured staging and does not claim that configured R2 credentials or production R2 execution were proven.

Retained evidence includes only:

- commit, expiry, workflow, and hashed owner;
- predecessor states and shared binding;
- HTTP status classes;
- MIME type, byte size, dimensions, and content digests;
- approval, replay, capability, partial-failure, public delivery, takedown, and cleanup outcomes;
- hashed fixture, object-key set, and decision receipts;
- bounded exception codes.

It excludes raw bytes, object keys, signed requests, HMAC keys, database values, account identifiers, bucket identifiers, private payloads, and unrestricted logs.

## Validation sequence

Before merge, the pull-request head must pass formatting, lint, Astro and TypeScript checks, runtime schemas, migration history, all unit and component tests, static build, accessibility checks, staging artifact checks, the repository P6-04 evidence contract, the configured execution self-test, and the Durable Object Worker dry-run.

After merge, the exact resulting `main` commit must pass configured staging deployment and the guarded P6-04 workflow before the retained receipt can become current.

## Acceptance

P6-04 becomes `accepted` only when every configured journey and both object and database cleanup pass on exact current `main` with the unchanged P6-01 through P6-03 binding.

An accepted P6-04 receipt does not authorize production, staging launch, export activation, DNS cutover, or public release. P6-05 remains the next configured predecessor.
