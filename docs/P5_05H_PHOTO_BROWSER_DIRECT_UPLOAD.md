# P5-05H browser Photos form and direct-upload orchestration

**Implementation item:** P5-05H  
**Status:** In progress  
**Last updated:** 2026-07-15

## Purpose

P5-05H adds the public `/photos` browser experience on top of the completed P5-05G upload-authorization and private-intake HTTP boundaries.

The slice connects a user-selected photo set to private quarantine without proxying image bytes through the application API and without treating upload success as Media approval or publication.

## Public flow

```text
/photos
  ↓
GET /api/photos/config
  ↓
Turnstile challenge 1
  ↓
POST /api/photos/upload-authorizations
  ↓
direct HTTPS PUT to each exact returned upload URL
  ↓
fresh Turnstile challenge 2
  ↓
POST /api/photos
  ↓
private Submission reference + status secret
```

The two server POST requests and all retries for one unchanged browser attempt use the same opaque UUID. Upload authorization requires that UUID to equal `authorization.intakeRequestId`.

## Browser contract

The browser accepts:

- one existing Entity or Location UUID;
- submitter relationship;
- one to eight JPEG, PNG, WebP, HEIC, or HEIF files;
- no more than 5,000,000 bytes per file;
- no more than 40,000,000 bytes total;
- public-gallery role;
- optional capture date, description, and suggested alt text;
- photographer and rights-holder declarations;
- submitted-permission, licensed, or public-domain rights basis;
- optional protected contact email;
- optional reviewer note;
- Privacy and Terms acknowledgements.

The browser builders finish by parsing through the existing authoritative P5-05A and P5-05C schemas. They do not create a second domain model.

## Direct-upload boundary

The authorization response is strictly parsed before any upload. For every selected file the browser uses only:

- `method = PUT`;
- the exact HTTPS `uploadUrl`;
- the exact `requiredHeaders`;
- the exact selected file body.

The browser does not invent an object key, bucket, metadata header, storage credential, filename field, or public URL.

Image bytes are sent directly to the authorized private object endpoint. They are never placed in the JSON request to `/api/photos` and are never proxied through a CryptoPayMap application Function.

## Retry behavior

The browser keeps one attempt UUID in memory.

- authorization or upload transport failure preserves the UUID;
- exact authorization retry receives the existing deterministic reservation set and fresh transient upload instructions;
- changing form values after upload clears the in-memory reservations and starts a new attempt;
- final private-intake transport failure preserves the UUID and uploaded reservation set;
- an idempotency conflict clears the incompatible attempt state;
- no attempt state, signed URL, required header, challenge token, or status secret is written to local storage or session storage.

## Turnstile behavior

Both P5-05G POST routes verify a challenge. Because challenge tokens are single-use security material, P5-05H requires:

1. a challenge before authorization;
2. widget reset after direct upload;
3. a fresh challenge before final private intake.

The client-safe configuration endpoint exposes only the site key and expected action. The secret remains server-only.

## CSP boundary

`/photos` has a page-scoped policy that permits:

- Cloudflare Turnstile script and frame origins;
- same-origin JSON API calls;
- the exact runtime-provided HTTPS direct-upload request.

The broader HTTPS `connect-src` applies only to `/photos`; other public contribution forms keep same-origin-only connection policy.

## Success receipt

A successful `202` private-intake response replaces the form with:

- Submission reference;
- status secret;
- an instruction to save both values.

The status secret is displayed once because it is required for private follow-up. It is not persisted by browser code.

## Security and privacy invariants

P5-05H preserves these boundaries:

- filenames are not included in authorization or Submission JSON;
- signed URLs and required storage headers are not included in the final Submission;
- challenge tokens remain in component memory only;
- private storage and environment markers are absent from built HTML;
- a Photos Submission remains private review material;
- upload success does not prove byte validity, rights, privacy, quality, or suitability;
- no automatic processing, Media decision, public object copy, canonical mutation, export, or publication occurs.

## Validation

The slice adds or updates:

- browser authorization and Submission builder tests;
- mismatch and rights-declaration rejection tests;
- `/photos` build artifact checks;
- contribution entry checks;
- private/server marker leakage checks;
- static and runtime CSP checks;
- full repository format, lint, Astro/TypeScript, schema, migration, unit, build, accessibility, staging, and screenshot workflows.

## Out of scope

P5-05H does not add:

- configured production object-storage signer or binding;
- automatic object validation or image processing execution;
- background queue or scheduler;
- privacy-content analysis;
- protected Media reviewer execution;
- Media approval or rejection;
- public object copy;
- gallery ordering;
- canonical mutation;
- export activation;
- production deployment or launch claim.

## Completion criteria

P5-05H is complete when:

1. `/photos` renders the real private upload form;
2. browser values parse through existing strict schemas;
3. one stable in-memory UUID spans unchanged retries;
4. authorization precedes every direct upload;
5. each file uses only the exact returned method, HTTPS URL, and headers;
6. final intake contains only opaque reservation UUIDs and declared metadata;
7. separate fresh Turnstile challenges protect authorization and intake;
8. success displays the private receipt without browser persistence;
9. changing the form invalidates completed in-memory upload state;
10. page-scoped static and runtime CSP permit Turnstile and HTTPS direct upload;
11. build artifacts contain no private storage or secret markers;
12. all required GitHub workflows pass;
13. no approval, processing, publication, or launch readiness is claimed.
