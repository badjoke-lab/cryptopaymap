# Export release workspace

**Implementation item:** P3-11C  
**Status:** Active

## Purpose

The protected export release workspace combines a server-controlled private artifact candidate with durable release decision history.

Reviewers never upload artifact content through the decision request. Queue, detail, and decision operations reload the current private candidate bundle from the server environment.

## Private candidate source

The current candidate is stored in a private R2 binding as a JSON bundle:

```json
{
  "formatVersion": "1",
  "artifacts": {
    "/version.json": {},
    "/data/manifest.json": {}
  }
}
```

The configured key must remain under:

```text
export-candidates/*.json
```

Required environment bindings:

```text
CPM_EXPORT_CANDIDATE_BUCKET
CPM_EXPORT_CANDIDATE_KEY
```

The source rejects invalid keys, traversal segments, malformed JSON, and invalid bundle shapes.

## Queue

```text
GET /admin/api/exports
```

The queue returns:

- current candidate status
- snapshot digest
- artifact count
- dataset and schema version when available
- generation time
- validation issue count
- recent durable approve and reject decisions
- bounded history pagination state

A missing candidate is represented as `null`; it is not replaced with fabricated metadata.

## Detail

```text
GET /admin/api/export-detail?snapshotDigest=<sha256>
```

Detail is available only for the exact current candidate digest.

It returns:

- complete candidate metadata and validation issues
- artifact path
- media type
- canonical JSON byte size
- per-artifact SHA-256
- record count when structurally available
- durable decisions for the same snapshot digest

Historical artifact bundles are not reconstructed from decision receipts.

## Decision

```text
POST /admin/api/export-decision
Idempotency-Key: <uuid>
```

The client sends only the exact expected candidate identity and the decision fields.

The server:

1. verifies the administration identity and `export:release` capability
2. loads the private candidate bundle
3. reruns the public export boundary
4. compares digest, artifact count, dataset version, schema version, and generation time
5. commits through the durable release backend
6. returns a committed or replayed receipt

The client cannot provide its own artifact map or validation result.

## Authorization

All three endpoints require:

- Cloudflare Access identity propagated by the protected admin boundary
- actor ID present in `CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS`
- isolated `export:release` capability

POST additionally requires an idempotency UUID.

## Fail-closed behavior

- missing actor policy: unavailable
- unauthorized identity: denied
- missing database: unavailable
- missing private R2 binding or key: unavailable
- invalid bundle: unavailable or conflict without exposing artifact content
- invalid queue filter or digest: bad request
- stale digest: not found
- blocked approval: conflict
- changed snapshot expectations: conflict
- persistence failure: unavailable

All responses use private no-store and noindex administration headers.

## Explicit exclusions

P3-11C does not add:

- `/admin/exports` reviewer UI
- artifact generation or upload
- public deployment writes
- active release pointer switching
- release rollback
- historical artifact storage
- live Access, R2, database, or production verification
