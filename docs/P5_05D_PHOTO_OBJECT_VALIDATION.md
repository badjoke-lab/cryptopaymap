# P5-05D private photo object validation

**Implementation item:** P5-05D  
**Status:** Completed through #219  
**Started:** 2026-07-15  
**Completed:** 2026-07-15

## Purpose

Validate the private quarantine objects authorized by P5-05C before any asynchronous processing or protected Media handoff. This slice reads one bounded private object body, verifies that it belongs to the exact reservation and canonical target, inspects the supported still-image structure, and computes a content hash. It does not create Media records or public derivatives.

## Request boundary

The validation request contains:

- the same opaque `intakeRequestId` used by upload authorization and later Photos intake;
- exact existing `entity` or `location` target identity;
- one to eight unique quarantine reservation UUIDs;
- `public_gallery_candidate` purpose only;
- declared JPEG, PNG, WebP, HEIC, or HEIF content type;
- declared byte size within the existing 5,000,000-byte item and 40,000,000-byte Photos limits.

The request contains no object key, signed URL, storage credential, original filename, EXIF, GPS, contact, status secret, wallet address, or receipt payload.

## Context validation

Before reading object bytes, the service requires:

- the canonical Entity or Location to exist and not be deleted;
- the complete reservation set to belong to the same intake UUID;
- every reservation to retain `public_gallery_candidate` purpose;
- every reservation to remain unexpired and unconsumed;
- the request reservation set to match exactly, without omitted or additional private rows.

A target or reservation failure produces a bounded error and does not expose private object paths or the failed private predicate.

## Bounded object read

The provider-neutral private object adapter receives the deterministic private key derived from the opaque reservation UUID and an exact maximum byte count. The R2-compatible adapter checks the provider-reported object size before calling `arrayBuffer()`, preventing allocation of an object larger than the declared item boundary.

The loaded object must match:

- the expected private object key;
- the declared content type;
- the exact body length and provider-reported size;
- signed private metadata for schema version, reservation, intake, target, purpose, and declared byte size.

The adapter returns no signed URL and persists nothing.

## Image inspection

The bounded inspection implementation accepts:

- JPEG marker and frame structures;
- PNG signature, chunk bounds, CRC values, IHDR, image data, and IEND;
- WebP RIFF length and VP8, VP8L, or VP8X dimensions;
- HEIC and HEIF ISO-BMFF file-type brands, bounded box structure, and `ispe` dimensions.

It rejects:

- unsupported signatures;
- executables, archives, and document signatures;
- corrupted or truncated structures;
- animated WebP and HEIF image-sequence brands;
- declared MIME types that do not match actual file signatures;
- dimensions above 20,000 pixels on either axis;
- images above 100,000,000 total pixels.

The decoder boundary remains injectable so a later processing slice can require a production pixel decoder and re-encoder. P5-05D does not claim that structural validation strips metadata or produces a display-safe derivative.

## Validation result

The internal result preserves the exact private key and byte buffer only for an immediate trusted processing caller. Its leakage-safe receipt contains only:

- intake and target identity;
- validation time;
- opaque reservation UUID;
- detected MIME type;
- actual byte size;
- width and height;
- SHA-256 content hash.

The safe receipt contains no object key, object bytes, custom metadata, signed URL, original filename, contact data, or public Media state.

## Explicit non-effects

P5-05D does not add:

- production R2 credentials or bucket binding;
- public HTTP routes or browser wiring;
- upload renewal or reservation mutation;
- EXIF, GPS, face, QR, wallet-address, or privacy-content analysis;
- duplicate or known-abuse hash lookup;
- asynchronous processing or retry queues;
- metadata stripping, orientation normalization, resizing, redaction, or re-encoding;
- Media Asset or Media File creation;
- protected reviewer queue or Media decision execution;
- canonical mutation, export, publication, or deployment.

## Completion evidence

Pull request #219 adds the strict validation contract, canonical target reader, exact reservation-set guard, bounded in-memory and R2-compatible object readers, supported still-image structural inspection, safe dimensions, SHA-256 hashing, leakage-safe receipts, executable schema checks, and focused mismatch and failure tests.

Implementation head `322943c110090e147ae9d038042c168cf0759f81` passed:

- format and lint;
- Astro and TypeScript;
- executable runtime and submission schema checks;
- migration history and drift;
- 219 test files and 1,084 tests;
- build, accessibility, Phase 1, and staging artifact checks;
- Foundation validation, Migration drift, Staging review validation, and representative screenshot capture.

No migration was required. The implementation reuses the P5-05B reservation model and does not persist validation receipts or private bytes.

## Next bounded item

P5-05E will own controlled private processing and protected Media handoff. It must consume a validated byte set or re-verify the exact SHA-256 before creating any private Media metadata, derivative, or review entry.
