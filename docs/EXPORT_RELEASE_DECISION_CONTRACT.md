# Export release decision contract

**Implementation item:** P3-11A  
**Status:** Active

## Purpose

This contract separates public artifact generation and validation from the durable decision to approve or reject a release candidate.

A release decision never trusts a caller-supplied validation result. The service derives the candidate digest, artifact count, release metadata, and validation issues from the supplied artifact set.

## Existing public boundary

Every release candidate remains subject to the public export boundary, including:

- exact public path allowlist
- required artifact inventory
- strict public schemas
- recursive non-public field detection
- HTTP(S)-only public URLs
- canonical-only and verification markers
- common schema version and generation time
- manifest inventory and media types
- record counts
- per-artifact SHA-256 hashes
- complete release snapshot digest

P3-11A does not weaken or replace these checks.

## Capability

Export release decisions use the isolated capability:

```text
export:release
```

The verified actor ID must be explicitly allowlisted through:

```text
CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS
```

A valid `Idempotency-Key` UUID is required for every mutation.

## Candidate preparation

The service receives a complete artifact map and prepares an internal candidate:

```text
artifact map
→ canonical snapshot digest
→ public export boundary validation
→ release metadata extraction
→ eligible or blocked candidate
```

Candidate fields:

- status: `eligible` or `blocked`
- snapshot digest
- artifact count
- dataset version
- schema version
- generated time
- validation issues

Release metadata is read from the validated `/version.json`; it is not accepted from an unverified decision body.

## Exact expectations

A decision pins:

- snapshot digest
- artifact count
- dataset version
- schema version
- generated time
- decision time
- action
- reason code
- actor and request identity

If any expected value differs from the internally prepared candidate, the service returns a conflict before persistence.

## Actions

### Approve

Approval requires:

- an `eligible` candidate
- zero validation issues
- valid release metadata
- exact expectation matches
- a public summary or internal note

A blocked candidate cannot be approved.

### Reject

A reviewer may reject an exact candidate snapshot.

A rejection may record:

- boundary validation issues
- a manual release hold or policy reason
- a public summary or internal note

Rejecting a candidate does not make any artifact public.

## Idempotency and replay

The request fingerprint includes:

- request and actor identity
- exact decision body
- candidate status
- sorted validation issues

Reusing the same request ID with identical content returns the existing receipt as `replayed`.

Reusing the request ID with different content is a conflict.

## Receipt

A durable backend must return a receipt containing:

- request ID
- approve or reject action
- approved or rejected release status
- snapshot digest
- artifact count
- dataset version
- schema version
- generated time
- decision time
- committed or replayed state

P3-11A defines this persistence boundary but does not yet add the database table or publication operation.

## Fail-closed behavior

- missing actor policy: unavailable
- missing or unauthorized identity: denied
- invalid idempotency key: invalid request
- malformed decision: rejected
- candidate preparation failure: no decision
- changed digest or metadata: conflict
- blocked candidate approval: rejected
- backend failure: no fabricated receipt

## Explicit exclusions

P3-11A does not add:

- durable release decision persistence
- release queue or detail APIs
- `/admin/exports`
- writing artifacts to the public deployment target
- atomic release pointer switching
- rollback to a prior public snapshot
- release history UI
- live Cloudflare or database verification
