# Export release reviewer UI

**Implementation item:** P3-11D  
**Status:** Active

## Pages

```text
/admin/exports/
/admin/exports/detail/?digest=<sha256>
```

Both pages remain behind the protected administration boundary and hydrate only the export release React components.

## Queue page

The queue page displays two separate areas.

### Current private candidate

- eligible or blocked status
- dataset version when available
- exact snapshot digest
- artifact count
- validation issue count
- generation time
- link to the exact current digest

No candidate is fabricated when the private bundle is absent.

### Durable decision history

- approve or reject action
- approved or rejected outcome
- dataset version
- snapshot digest
- artifact count
- validation issue count
- candidate status
- decision time
- public summary or reason code

The history can be filtered by approved or rejected status and remains bounded.

## Detail page

The detail page reloads the current private candidate by the digest in the URL.

It displays:

- candidate status and release metadata
- full validation issue list
- artifact path and media type
- record count when available
- canonical JSON byte size
- per-artifact SHA-256
- durable decisions for the snapshot

Artifact payload content, private R2 keys, database credentials, actor policy, request fingerprints, and internal notes are not embedded in the static page artifact.

## Action matrix

| Candidate state | Available actions |
|---|---|
| Eligible with valid release metadata | Approve, reject |
| Blocked with valid release metadata | Reject |
| Missing valid release metadata | No decision; regenerate candidate |

The server-side decision contract remains authoritative.

## Decision request

The UI sends:

- approve or reject action
- expected snapshot digest
- expected artifact count
- expected dataset version
- expected schema version
- expected generation time
- reason code
- public summary
- optional internal note

A fresh idempotency UUID is generated for the request.

The UI never sends the artifact map or a caller-provided validation result.

## Result handling

- committed or replayed success: show durable outcome and reload option
- invalid decision: show the first bounded contract issue
- changed or blocked candidate: require reload
- denied identity: stop the decision
- unavailable service: do not imply success

## Explicit exclusions

P3-11D does not add:

- artifact generation or upload
- public deployment writes
- active release pointer switching
- rollback
- historical artifact bundles
- production Access, R2, database, or browser verification
