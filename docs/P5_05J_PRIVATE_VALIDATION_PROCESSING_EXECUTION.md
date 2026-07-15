# P5-05J configured private validation and processing execution

**Implementation item:** P5-05J  
**Status:** In progress  
**Last updated:** 2026-07-15

## Purpose

Bind the completed private Photos contracts to one executable post-intake path:

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

## Required chronology correction

The repository contracts completed before P5-05J contain an execution-order mismatch:

- P5-05D accepts only unconsumed upload reservations;
- P5-05H completes private intake immediately after direct upload and consumes those reservations;
- P5-05E expects a Photos Submission whose reservations are already consumed by that Submission, while also rejecting a validation timestamp later than consumption.

Those conditions cannot all be true in the browser flow that is now on `main`.

P5-05J must preserve the existing pre-intake P5-05D validation method for tests and future bounded use, while adding an explicit post-intake validation method that:

- requires one exact Submission UUID;
- accepts only reservations consumed by that same Submission;
- requires a valid consumption timestamp no later than validation;
- continues to require the exact intake request, target, purpose, reservation set, canonical private key, content type, metadata, byte size, image signature, dimensions, and content hash;
- never accepts an unconsumed reservation in post-intake mode.

P5-05E must accept the resulting post-intake validation receipt only when validation occurred no later than processing and all bytes are re-hashed immediately before processing.

## Configured resources

The execution runtime uses:

- the configured private R2 bucket binding for quarantine reads and private derivative writes;
- the configured Cloudflare Images binding for raw-byte transformations;
- the existing Drizzle reservation, target, Submission, Media, and audit persistence boundaries.

The Images processor creates exactly:

- one `display` WebP bounded to 2,048 pixels and 5,000,000 bytes;
- one `thumbnail` WebP bounded to 512 pixels and 1,000,000 bytes.

Both transformations use scale-down behavior, disable animation, discard invisible metadata, and rely on the transformation service to apply color profiles and EXIF rotation before metadata removal. The returned bytes remain subject to P5-05E structural, dimension, MIME, and hash verification.

## Free-plan boundary

The implementation uses transformations for images stored outside Cloudflare Images. It does not use Cloudflare Images storage. Runtime usage remains subject to the account's Images transformation allowance and must fail closed when transformation capacity or configuration is unavailable.

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
