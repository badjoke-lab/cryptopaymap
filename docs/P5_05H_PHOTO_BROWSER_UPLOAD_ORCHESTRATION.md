# P5-05H browser Photos form and direct-upload orchestration

**Implementation item:** P5-05H  
**Status:** Completed through #223  
**Started:** 2026-07-15  
**Completed:** 2026-07-15

## Purpose

Expose the completed P5-05G public HTTP boundaries through a browser `/photos` form while keeping file bytes outside the application JSON routes and preserving private review, Media, canonical, export, and publication separation.

## Public page and configuration

P5-05H adds:

- `/photos` as the dedicated public Photos contribution page;
- an available Photos entry on `/contribute`;
- `GET /api/photos/config` for client-safe Turnstile site key and action only;
- target prefill through bounded `targetType` and `targetId` query parameters;
- explicit notices that upload and intake success do not approve or publish Media.

The configuration endpoint is `no-store` and does not expose Turnstile secrets, database configuration, rate-limit keys, object-storage credentials, contact-protection material, or status-secret material.

## Browser contract

The browser accepts one to eight JPEG, PNG, WebP, HEIC, or HEIF files with:

- a 5,000,000-byte per-file limit;
- a 40,000,000-byte total limit;
- one existing Entity or Location UUID target;
- one public-gallery role per photo;
- optional capture date, description, and suggested alt text;
- submitted-permission, licensed, or public-domain rights declarations;
- explicit public-display permission intent;
- optional protected contact and reviewer note;
- privacy and submission-term acknowledgements.

The browser contract does not place an original filename, object key, signed URL, storage credential, EXIF value, GPS value, wallet value, or status secret in the authorization or private Submission payload.

## Two-stage verification and request identity

One browser-generated opaque UUID remains stable across:

1. upload-authorization request;
2. direct private uploads;
3. retry after a bounded failure;
4. final private Photos Submission intake.

The authorization header identity must match the authorization body `intakeRequestId` through P5-05G. The browser requests a fresh Turnstile result for the final intake rather than reusing the authorization challenge token.

Starting over explicitly discards the browser request identity and creates a new request on the next attempt.

## Direct upload boundary

For each selected file, the browser:

- accepts only one matching returned authorization entry;
- verifies declared local byte size against the authorization receipt;
- verifies the required `content-type` header against the declared MIME type;
- sends the file body directly to the returned HTTPS URL;
- uses the exact returned `PUT` method and required headers;
- stops before private intake when any direct upload fails.

The application `/api/photos` JSON route receives only the opaque quarantine reservation UUIDs and declared review metadata. Binary objects are never proxied through that route.

## Retry boundary

A failed direct upload retains the same browser request UUID so an exact authorization replay can return the same reservation set. The final private intake is not attempted until all direct uploads have succeeded.

A changed-content conflict requires an explicit new request. The browser does not silently create another identity or mix reservation sets.

## Private receipt boundary

After successful private intake, the browser displays:

- the opaque Submission reference;
- the status secret;
- the submitted timestamp through the validated receipt contract.

The receipt remains in React memory only. P5-05H does not write it to local storage, session storage, a URL, analytics, or a public artifact.

## CSP boundary

`/photos` receives a route-specific policy that permits:

- the existing Cloudflare Turnstile script and frame;
- same-origin application requests;
- HTTPS direct upload requests to the bounded Cloudflare R2 S3 endpoint pattern.

The other public Submission routes retain their existing same-origin `connect-src` policy. The Photos page remains `no-store` with a no-referrer response policy.

## Validation and leakage checks

P5-05H includes:

- strict browser contract tests;
- direct authorization, PUT, and final intake orchestration tests;
- mismatched file-size and MIME rejection tests;
- bounded public-error handling tests;
- build artifact and contribution-entry checks;
- static and Pages Function CSP checks;
- executable schema-chain integration.

Implementation head `8e97bbd3439327c20223f1da422b2ccd4668e287` passed:

- format and lint;
- Astro and TypeScript;
- runtime schemas and migration history;
- 227 test files and 1,119 tests;
- static build, accessibility, Phase 1, and staging artifact checks;
- Foundation validation;
- Migration drift;
- Staging review validation;
- representative screenshot capture.

No migration was required.

## Explicit non-effects

P5-05H does not add:

- a configured production or fixed-review R2 signer;
- a production bucket binding;
- a binary upload proxy;
- automatic object validation or image processing;
- a processing queue or scheduler;
- privacy-content, face, plate, QR, receipt, or wallet review decisions;
- Media approval or a public storage copy;
- canonical mutation;
- export activation;
- publication or deployment.

## Next bounded item

P5-05I will add configured object-storage signing and binding plus a bounded direct-upload integration audit. It must prove that one synthetic browser-compatible authorization can upload only to the intended private quarantine object and that the resulting private intake remains isolated from automatic validation, processing, Media approval, canonical mutation, export, and publication.

Configured image processing and protected Media decision execution remain separate later slices.
