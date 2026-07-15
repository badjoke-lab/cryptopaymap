# P5-05J configured private validation and processing execution

**Implementation item:** P5-05J  
**Status:** Completed in PR #227  
**Last updated:** 2026-07-15

## Result

P5-05J binds the completed private Photos contracts to one executable post-intake path:

```text
private Photos Submission
  ↓
exact consumed reservation context
  ↓
configured R2 private-object read
  ↓
P5-05D byte, metadata, structure, dimensions, and hash validation
  ↓
configured Cloudflare Images binding processing
  ↓
P5-05E derivative revalidation, private R2 writes, and protected Media handoff
```

The path remains protected and private. It does not create approved or public Media.

## Chronology correction

The earlier contracts could not execute together because browser intake consumed reservations before private validation while P5-05E rejected validation after consumption.

P5-05J preserves the existing pre-intake P5-05D validator and adds an explicit post-intake validator that:

- requires one exact Photos Submission UUID;
- accepts only reservations consumed by that same Submission;
- requires a valid consumption timestamp no later than validation;
- requires validation no later than private processing;
- continues to require the exact intake request, target, purpose, reservation set, canonical private key, content type, metadata, byte size, image signature, dimensions, and content hash;
- never accepts an unconsumed reservation in post-intake mode.

P5-05E still re-hashes the original bytes immediately before processing and preserves deterministic processing replay and conflict handling.

## Configured execution

The private execution runtime composes:

- the configured private R2 bucket binding for quarantine reads and private derivative writes;
- the configured Cloudflare Images binding for raw-byte transformations;
- the existing Drizzle reservation, target, Submission, Media, and Audit persistence boundaries;
- one strict protected execution request with stable processing and validation identities.

The Images processor creates exactly:

- one `display` WebP bounded to 2,048 pixels and 5,000,000 bytes;
- one `thumbnail` WebP bounded to 512 pixels and 1,000,000 bytes.

Both transformations use scale-down behavior, disable animation, request metadata removal, and return bytes that are independently revalidated for MIME, dimensions, still-image structure, forbidden metadata chunks, and hashes before handoff.

## Verification

Implementation head `a49ce9af9fb4b35989d670d8535708290d322657` passed all four required workflows:

- Foundation validation;
- Migration drift;
- Staging review validation;
- Capture representative review screenshots.

Foundation validation passed format, lint, Astro and TypeScript, executable schemas, migration history, 231 test files with 1,130 tests, build, accessibility, Phase 1, and staging artifact checks.

## Free-plan boundary

The implementation uses transformations for images stored outside Cloudflare Images. It does not use Cloudflare Images storage. Runtime usage remains subject to the account's Images transformation allowance and fails closed when transformation capacity or configuration is unavailable.

## Explicit exclusions

P5-05J does not add:

- automatic public execution from an untrusted route;
- privacy-content or abuse-image classification;
- Media approval or rejection;
- public object copy;
- Gallery activation;
- canonical mutation;
- export activation;
- publication;
- production deployment or launch readiness.

## Handoff

P5-05 is repository-complete through P5-05J. The next Phase 5 area is P5-06 review workflow extensions, beginning with an exact inventory of remaining cross-submission reviewer diff, information-request, hold, partial-decision, duplicate/no-change, and private-status gaps before adding new mutation surfaces.
