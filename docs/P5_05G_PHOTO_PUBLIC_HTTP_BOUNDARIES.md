# P5-05G public Photos HTTP boundaries

**Status:** Completed in PR #222

## Result

P5-05G exposes two bounded JSON POST boundaries:

- `POST /api/photos/upload-authorizations`
- `POST /api/photos`

The first route issues short-lived instructions for direct upload into private quarantine. The second route commits the existing private Photos Submission intake after opaque upload reservations have been created and used by the client.

## Shared controls

Both routes require:

- `application/json`;
- a UUID `Idempotency-Key`;
- a streamed request body no larger than 128 KiB;
- trusted Cloudflare edge identity;
- opaque distributed rate-limit buckets;
- Turnstile verification;
- strict schemas that reject undeclared fields;
- `no-store`, `no-referrer`, JSON, and `nosniff` response headers;
- bounded public error codes with no internal details.

Malformed media type, body size, idempotency identity, or JSON fails before database or provider runtime composition.

## Upload-authorization route

The request contains the existing P5-05C authorization contract and a challenge token. The `Idempotency-Key` must exactly equal `intakeRequestId`.

The execution order is:

1. validate the HTTP envelope;
2. read trusted edge identity;
3. derive the opaque rate-limit bucket;
4. apply distributed rate limiting;
5. verify Turnstile;
6. issue or replay durable reservations;
7. return transient direct-upload instructions.

The upload-authorizer dependency remains injected. This item does not claim a configured production object-storage signer.

## Private-intake route

The request contains the existing strict Photos Submission contract and a challenge token. The route reuses the established private intake, including:

- protected optional contact handling;
- deterministic status-secret issuance and replay;
- private original and normalized payload persistence;
- exact reservation ownership, purpose, expiry, and consumption checks;
- atomic rollback on conflicts.

The response contains only the public Submission reference, request-bound status secret, and submitted timestamp.

## Runtime separation

Upload authorization and private intake have separate runtime factories. Failure of the upload-authorizer configuration does not add an unnecessary dependency to final private intake after a client has already uploaded its objects.

## Public errors

The route boundary exposes only:

- `photo_media_type_unsupported`;
- `photo_request_too_large`;
- `photo_request_invalid`;
- `photo_rate_limited`;
- `photo_request_conflict`;
- `photo_unavailable`.

Storage keys, private object bytes, contact values, edge addresses, persistence details, and secret hashes are not returned in errors.

## Explicit non-effects

P5-05G does not add:

- a browser `/photos` form;
- binary upload proxying;
- configured production object-storage binding;
- object validation or image processing execution;
- Media approval or publication;
- canonical mutation;
- export activation or deployment.

## Verification

Implementation head `285aa11e0fb4381c90719f11ec55366e04fe7a9a` passed all four required workflows. Foundation validation passed format, lint, TypeScript, executable schemas, migration history, 225 test files with 1,112 tests, build, accessibility, Phase 1, and staging artifact checks.

## Next bounded item

P5-05H adds the browser `/photos` form and direct-upload orchestration against these two HTTP boundaries. It does not configure automatic processing, approve Media, or publish objects.
