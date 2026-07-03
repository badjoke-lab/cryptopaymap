# Media storage operation contract

**Implementation item:** P3-10C  
**Status:** Active

## Purpose

This contract separates Media review decisions from object-storage effects while keeping both sides version-pinned, replayable, and fail-closed.

## Storage classes

```text
private R2
- originals
- evidence and owner-verification media
- review candidates
- reviewed display and thumbnail derivatives before public approval

public R2
- only derivatives whose Media decision is durably accepted for public display
```

Original files never enter public storage.

## Canonical keys

Reviewed derivatives use deterministic keys derived from the Media asset ID, file ID, content hash, and public MIME extension.

```text
media/private/{mediaAssetId}/{fileId}-{contentHash}.{ext}
media/public/{mediaAssetId}/{fileId}-{contentHash}.{ext}
```

The database and storage adapter must reject non-canonical keys.

## Public approval

1. The decision contract requires private JPEG or WebP display derivatives.
2. Before changing durable state, the storage adapter confirms that every selected private object exists and matches the expected MIME type and content hash.
3. The database transaction changes the selected Media file rows from private keys to public keys and records the durable decision receipt.
4. After a committed or replayed approval, the storage adapter verifies the private objects again and copies only the selected derivatives to their deterministic public keys.
5. A failed publication returns an error and may be retried with the same request ID. The durable review decision is not duplicated.
6. A partially completed publication is cleaned up before the error is returned.

This ordering prefers unavailable approved media over exposing media before a durable approval exists.

## Restriction and supersession

1. The storage adapter revokes all currently public derivatives first.
2. Only after successful revocation does the database transaction move the file rows back to private keys and record the restricted or superseded decision.
3. A revocation failure blocks the database decision.
4. Missing public objects may be treated idempotently by the concrete storage adapter.

This ordering prefers a temporarily unavailable image over continued exposure after a privacy or rights restriction.

## Database boundary

File scope and key transitions are included in the same guarded database batch as:

- the exact Media asset version guard
- the complete file-set guard
- active cover uniqueness
- Media asset review-state changes
- the durable Media review decision receipt

A transition is pinned to the exact file ID, Media asset ID, current scope, and current key.

## Adapter contract

A storage adapter must support:

- inspecting private object metadata
- publishing a private object to an exact public key
- revoking an exact public key

The repository includes an in-memory adapter for tests and a Cloudflare R2-compatible adapter boundary. Bucket bindings and live credentials remain deployment configuration.

## Failure behavior

- missing private source: reject approval before durable state changes
- MIME or content-hash mismatch: reject approval before durable state changes
- database approval failure: do not publish
- publication failure after durable approval: return an error; the same request can replay and retry storage
- partial publication failure: remove completed public copies
- public revocation failure: do not commit restriction or supersession
- unexpected adapter failure: fail closed and do not fabricate success

## Explicit exclusions

P3-10C does not add:

- upload APIs or presigned upload flows
- image decoding or Sharp processing
- signed review URLs
- the protected Media queue or detail APIs
- `/admin/media`
- public export release logic
- live R2 bucket configuration or verification
