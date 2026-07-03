# Export release persistence

**Implementation item:** P3-11B  
**Status:** Active

## Purpose

P3-11B makes export release decisions durable without publishing artifacts yet.

The persistence layer stores the exact reviewed snapshot identity, release metadata, validation result, actor, reason, and idempotency fingerprint.

## Durable table

```text
export_release_decisions
```

Stored fields include:

- request ID
- approve or reject action
- approved or rejected status
- snapshot SHA-256 digest
- artifact count
- dataset version
- schema version
- generated time
- eligible or blocked candidate status
- validation issues
- actor ID and type
- reason code
- public summary and internal note
- decision time
- request fingerprint
- creation time

## Database constraints

The database enforces:

- one row per request ID
- lowercase 64-character snapshot digest
- bounded artifact count
- JSON-array validation issues
- non-empty actor, reason, and fingerprint
- public summary or internal note
- generated time not after decision time
- approval only for eligible candidates with zero validation issues
- reject action only with rejected status

## Duplicate approval protection

Partial unique indexes prevent two approved receipts for:

- the same snapshot digest
- the same dataset version

Rejected candidates do not reserve a snapshot digest or dataset version.

## Commit and replay

The backend follows this sequence:

1. Read by request ID.
2. Return a replay when the fingerprint matches.
3. Return a conflict when the request ID exists with different content.
4. Insert the durable receipt.
5. On a concurrent unique violation, read the request again and replay only when the fingerprint matches.
6. Treat remaining uniqueness or constraint violations as release conflicts.

No success receipt is fabricated after a database failure.

## Receipt state

The first successful insert returns:

```text
committed
```

An identical request returns:

```text
replayed
```

Both receipts preserve the same release outcome and snapshot identity.

## Explicit exclusions

P3-11B does not add:

- artifact generation
- release queue or detail APIs
- `/admin/exports`
- public bucket or deployment writes
- active release pointer changes
- rollback
- release history UI
- live migration execution or verification
