# Export release activation

**Implementation item:** P3-11E  
**Status:** Active

## Purpose

This contract activates a previously approved public export snapshot without allowing the approval receipt, private candidate, or active release pointer to change silently between review and activation.

Approval and activation remain separate operations.

## Authorization

Activation uses the isolated capability:

```text
export:publish
```

The actor must be explicitly allowlisted through:

```text
CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS
```

An actor authorized for `export:release` is not automatically authorized to activate a release. Every activation request requires an `Idempotency-Key` UUID.

## Exact request

The request pins:

- approved release decision request ID
- snapshot digest
- artifact count
- dataset version
- schema version
- generation time
- expected currently active snapshot digest, or `null` for the first release

The protected server supplies the activation time.

The client does not submit artifact bodies, object keys, validation results, or an active pointer body.

## Revalidation

Before writing public objects, the service:

1. reads the durable approved release decision
2. reloads the private candidate bundle
3. reruns the complete public export boundary
4. rebuilds canonical JSON for every allowlisted artifact
5. recomputes per-artifact hashes and the complete snapshot digest
6. compares the approval, request expectations, and candidate metadata
7. reads the currently active pointer
8. confirms the expected active snapshot

Any mismatch stops activation.

## Immutable release objects

Artifacts use the deterministic prefix:

```text
export-releases/by-snapshot/{snapshotDigest}/
```

Each object stores metadata for the snapshot digest, public artifact path, and artifact SHA-256.

An existing object is reused only when its key, size, media type, and metadata exactly match. A mismatched immutable object is never overwritten.

A partial staging failure leaves the active pointer unchanged. A retry may safely fill missing immutable objects.

## Active pointer

The active release is selected only by:

```text
export-releases/active.json
```

The pointer contains release versions, generation and activation times, immutable prefix, and the complete artifact path, key, media type, hash, and byte-size inventory.

The pointer is written only after every immutable object is verified.

## Compare-and-set activation

The R2 adapter reads the active pointer ETag and uses it as a conditional `put` guard.

- first release: the pointer must not already exist
- replacement release: the ETag read before staging must still match
- failed condition: activation returns a pointer conflict

This prevents concurrent activation requests from silently overwriting one another.

## Replay behavior

If the exact validated snapshot is already active, activation returns `replayed` without staging or switching the pointer again.

Request-level durable activation history and detection of an idempotency key reused with different activation content are added with the next publication-history delivery.

## Endpoint

```text
POST /admin/api/export-activate
```

The endpoint verifies the separate activation policy, reloads the private candidate, checks the durable approval, stages immutable objects, and conditionally switches the pointer.

## Receipt

A successful result includes:

- request and approval request IDs
- snapshot digest
- dataset and schema versions
- generation and activation times
- previous active snapshot digest
- pointer key
- immutable release prefix
- artifact count
- `published` or `replayed` state

## Explicit exclusions

P3-11E does not add:

- durable activation history
- request-level publication replay records
- rollback to a prior release
- release history UI
- automatic candidate generation
- root-path materialization or CDN serving changes
- cleanup of inactive immutable release objects
- live Access, R2, database, or production verification
