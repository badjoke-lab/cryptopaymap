# Export release restore

**Implementation item:** P3-11I  
**Status:** Active

## Purpose

This contract defines the safe pre-execution boundary for restoring a previous public export release.

The operation does not switch the active pointer yet. It verifies the request, actor authority, current active snapshot, and target snapshot before returning an explicit blocked receipt.

## Authorization

Restore preparation uses the publication-side capability:

```text
export:publish
```

A read-only export reviewer cannot prepare a restore operation.

## Request

The request pins:

- target snapshot digest
- expected currently active snapshot digest
- restore preparation time
- reason code
- optional internal note

The target snapshot must differ from the current active snapshot.

## Snapshot checks

The service loads:

1. the current active snapshot
2. the requested target snapshot from durable history

The request fails if:

- there is no active release
- the target snapshot is not present in durable history
- the active snapshot changed after the client prepared the request
- the actor is not authorized
- the input is malformed

## Blocked receipts

P3-11I intentionally blocks execution.

Two blocked states are defined:

```text
blocked_missing_pointer_inventory
blocked_restore_execution_unavailable
```

`blocked_missing_pointer_inventory` means durable history does not yet include the complete pointer inventory required to switch back safely.

`blocked_restore_execution_unavailable` means inventory exists but the execution boundary is still intentionally unavailable in this implementation item.

## Explicit exclusions

P3-11I does not add:

- active pointer switching
- durable restore execution records
- public object verification during restore
- release history UI controls
- live R2, database, or production verification
