# P5-05C Photo quarantine upload authorization

**Implementation item:** P5-05C  
**Status:** Completed through #218  
**Started:** 2026-07-15  
**Completed:** 2026-07-15

## Purpose

Issue short-lived upload authorizations for public-gallery candidates and durably create the opaque quarantine reservations consumed by P5-05B. This slice establishes a provider-neutral signing boundary and does not connect production R2 credentials or accept image bytes through the application.

## Bounded scope

P5-05C includes:

- a strict Photos upload-authorization request contract;
- one to eight `public_gallery_candidate` items;
- the existing 5,000,000-byte per-file and 40,000,000-byte Photos total limits;
- JPEG, PNG, WebP, HEIC, and HEIF declarations;
- exact Entity or Location target metadata;
- deterministic opaque reservation UUIDs derived from the canonical request;
- durable reservation creation through the existing P5-05B table;
- a short-lived provider-neutral PUT authorization interface;
- private object keys containing only an opaque reservation UUID;
- required signed content-type and private validation metadata headers;
- exact replay, changed-content conflict, expiry, consumption, and concurrency handling;
- no signed URL or storage credential persistence.

## Request boundary

The authorization request contains:

- `schemaVersion`;
- the same random `intakeRequestId` later used for Photos Submission intake;
- exact `targetType` and `targetId`;
- declared MIME type and byte size for each public-gallery candidate.

The contract rejects evidence and owner-verification purposes, unsupported MIME declarations, oversized items, more than eight items, undeclared properties, original filenames, storage keys, and user-supplied object paths.

## Reservation and replay boundary

Reservation UUIDs are deterministic for the canonical request content, but remain opaque because the request includes a random intake UUID. The Drizzle persistence adapter serializes creation attempts with a transaction-scoped advisory lock for that intake UUID. It accepts either an empty reservation set or the exact expected UUID set before inserting.

This provides:

- one durable reservation set for an intake attempt;
- identical concurrent request convergence;
- exact replay without duplicate rows;
- changed-content conflict without appending a second reservation set;
- no renewal after reservation expiry or Submission consumption.

A new intake UUID is required after expiry.

## Upload authorization boundary

The provider-neutral authorizer receives:

- a deterministic private key shaped as `quarantine/photos/v1/<reservation-uuid>`;
- the declared content type;
- the reservation expiry;
- signed private metadata for reservation, intake, target, purpose, and declared byte size.

The public receipt contains the short-lived HTTPS PUT URL, required headers, declared byte size, expiry, and opaque reservation UUID. It does not contain a separate object-key field, storage credential, original filename, public URL, status secret, contact information, or canonical data.

The signed URL is transient response material and is never written to Neon, review projections, Audit events, public exports, or repository fixtures.

## Failure behavior

Reservation persistence occurs before signing. If the signer fails, the private reservation set remains available for an exact retry until expiry. A retry can obtain fresh transient signed URLs without creating additional reservations.

The service returns bounded failures for:

- invalid request shape;
- changed-content request-ID reuse;
- expired or consumed reservations;
- persistence conflict;
- authorizer failure or incomplete signed-header binding.

Errors do not identify a private object key or disclose which ownership, expiry, or consumption predicate failed.

## Explicit non-effects

P5-05C does not add:

- production R2 or S3 credentials;
- an actual Cloudflare R2 presigner;
- a public HTTP route or browser form;
- binary upload proxying;
- object existence checks;
- magic-byte, size, dimension, decode, or file-integrity validation;
- EXIF or GPS processing;
- content hashing or duplicate detection;
- derivative generation;
- Media Asset or Media File creation;
- protected Media review handoff;
- approval, canonical mutation, export, publication, or deployment.

## Completion evidence

Pull request #218 adds the upload-authorization contract, deterministic opaque reservation issuance, Drizzle and in-memory persistence adapters, provider-neutral signer boundary, signed-header verification, exact replay and changed-content conflict behavior, expiry and consumption guards, executable schema validation, and focused privacy and concurrency tests.

The implementation validation passed format, lint, Astro and TypeScript checks, executable schemas, migration drift, 217 test files and 1,072 tests, build, accessibility, Phase 1 checks, and staging validation. The final documentation-head workflow results are recorded on #218.

## Next bounded item

P5-05D will own private object existence and byte-level validation. It must validate actual size, file signature, decoding, safe dimensions, object metadata, target and reservation relationships, and content hashes before any Media record or processing handoff is created.
