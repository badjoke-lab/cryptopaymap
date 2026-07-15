# P5-05E controlled private photo processing and Media handoff

**Implementation item:** P5-05E  
**Status:** Completed through #220  
**Started:** 2026-07-15  
**Completed:** 2026-07-15

## Purpose

Consume the exact private byte set validated by P5-05D, re-verify its integrity immediately before processing, require bounded metadata-stripped and orientation-normalized private derivatives, and atomically hand the result to the existing protected Media review system. This slice creates no public Media state and performs no review approval.

## Input boundary

The processing request contains:

- one opaque processing request UUID;
- one existing private Photos Submission UUID;
- one bounded processor version identifier;
- the complete P5-05D validation receipt;
- the exact validated private objects held only by the trusted processing caller.

The request does not contain a public object URL, signed download URL, storage credential, original filename, contact value, status secret, wallet data, receipt data, or public approval instruction.

## Exact context requirements

Before processor execution, the service requires:

- the Submission to exist and retain type `photos`;
- an active processing-compatible Submission workflow state;
- exact Entity or Location target agreement;
- the normalized Photos projection to remain valid;
- every normalized item, validation receipt item, validated byte object, and reservation row to form one exact set;
- every reservation to have been consumed by the same Photos Submission;
- validation to have occurred no later than reservation expiry and consumption;
- declared MIME, byte size, dimensions, private object key, and SHA-256 to agree across all layers;
- the exact source bytes to reproduce the P5-05D SHA-256 immediately before processing.

A mismatch fails closed before any processor call or Media insertion.

## Controlled processor contract

The injected private processor receives one validated private object and its intended public-gallery role. It must return exactly:

- one `display` derivative;
- one `thumbnail` derivative.

Each derivative must declare and satisfy:

- JPEG or WebP still-image format;
- metadata removed;
- orientation normalized;
- exact byte buffer, MIME type, width, and height;
- display maximum of 2,048 pixels on either axis and 5,000,000 bytes;
- thumbnail maximum of 512 pixels on either axis and 1,000,000 bytes;
- no pixel-count enlargement beyond the validated source;
- structurally valid, non-animated JPEG or WebP content;
- a newly computed SHA-256 matching the stored private derivative metadata.

P5-05E establishes the processor contract and validation boundary. It does not add a production image-codec package or claim that repository tests execute a production R2 processing deployment.

## Private derivative storage

Private review derivatives use the existing canonical Media storage-key convention:

```text
media/private/{mediaAssetId}/{mediaFileId}-{contentHash}.{jpg|webp}
```

The provider-neutral R2-compatible adapter:

- checks for an existing object before write;
- replays only when byte size, MIME type, content hash, source hash, asset identity, variant, and private scope metadata agree exactly;
- rejects a key containing different content or metadata;
- verifies object metadata after write;
- exposes cleanup for newly staged objects when the database handoff fails.

No private derivative is copied to public storage in this slice.

## Atomic Media handoff

For each accepted processing item, the handoff creates:

- one deterministic private `Media Asset`;
- purpose `public_gallery_candidate`;
- the submitted review role;
- `reviewStatus = pending`;
- `rightsStatus = unknown`;
- `visibility = private`;
- an exact Entity or Location subject;
- one original `Media File` that references the private quarantine object;
- one private display `Media File`;
- one private thumbnail `Media File`;
- one private Submission event containing bounded processing provenance and review context.

The database operation uses one Submission-scoped advisory lock and one atomic batch. It guards:

- exact Submission type, workflow state, and update version;
- absence of any previous Media handoff for the Submission;
- absence of the deterministic event UUID.

A Photos Submission can therefore create its Media handoff only once. A different processing request UUID cannot create a second Media set.

## Replay and rollback

Identical retries:

- derive the same event, asset, and file UUIDs;
- return the stored receipt before reloading mutable Submission state;
- do not run the processor again;
- do not rewrite derivatives or insert duplicate Media rows.

Changed content under the same processing request UUID returns an idempotency conflict.

If processing, derivative validation, storage, or database persistence fails:

- no Media rows are partially committed;
- newly created derivative objects are deleted on a best-effort cleanup path;
- exact pre-existing replayed derivative objects are not deleted;
- no public or canonical state changes.

## Privacy boundary

The private audit event may contain review-safe role, description, suggested alt text, rights declaration shape, and processor/content-hash provenance. It does not contain:

- object bytes;
- quarantine or derivative storage keys in the returned receipt;
- signed URLs or credentials;
- original filenames;
- EXIF or GPS payloads;
- contact plaintext;
- status secrets;
- public Media approval.

The leakage-safe receipt contains only opaque reservation, Media Asset/File identities, hashes, processing state, Submission identity, and timestamp.

## Explicit non-effects

P5-05E does not add:

- a production image codec or worker deployment;
- production R2 bucket binding;
- a public Photos route or browser form;
- asynchronous queue or retry infrastructure;
- face, plate, QR, wallet, or privacy-content decisions;
- duplicate or abuse-hash policy decisions;
- rights, privacy, quality, cover, or gallery-order approval;
- public storage copying;
- Media decision execution;
- canonical mutation;
- export or publication;
- production deployment.

## Completion evidence

Pull request #220 adds the processing contract, exact source re-hash, bounded derivative validation, deterministic replay identities, R2-compatible and in-memory private derivative stores, Drizzle atomic Media handoff, one-handoff-per-Submission guard, executable schema check, and focused integrity, replay, conflict, storage, rollback, and leakage tests.

Implementation head `c2079faba752b66471d5bcee35cfb1fb4173b837` passed:

- format and lint;
- Astro and TypeScript;
- executable runtime and submission schema checks;
- migration history and drift;
- 221 test files and 1,095 tests;
- build, accessibility, Phase 1, and staging artifact checks;
- Foundation validation, Migration drift, Staging review validation, and representative screenshot capture.

No migration was required. P5-05E reuses the existing `media_assets`, `media_files`, `submission_events`, Submission payload, and quarantine reservation structures.

## Next bounded item

P5-05F will define duplicate content-hash behavior and private upload lifecycle cleanup. It must distinguish harmless exact reuse from cross-target or previously rejected material, keep duplicate signals review-only, and apply bounded retention and cleanup rules to abandoned, rejected, superseded, or completed private objects without deleting active review material.
