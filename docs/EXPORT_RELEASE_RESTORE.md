# Export release restore

**Implementation item:** P3-11I through P3-11M  
**Status:** Active repository boundary

## Purpose

This contract defines the safe preparation boundary for restoring a previous public export release and the handoff to the controlled restore execution workflow.

Preparation verifies the request, actor authority, current active snapshot, target snapshot, and durable pointer-inventory availability before reporting whether execution may proceed.

## Authorization

Restore preparation and execution use the publication-side capability:

```text
export:publish
```

A read-only export reviewer cannot prepare or execute a restore operation.

## Request

The request pins:

- target snapshot digest
- expected currently active snapshot digest
- restore time
- reason code
- optional internal note

The target snapshot must differ from the current active snapshot.

## Snapshot checks

The preparation service loads:

1. the current active snapshot
2. the requested target snapshot from durable history

The request fails if:

- there is no active release
- the target snapshot is not present in durable history
- the active snapshot changed after the client prepared the request
- the actor is not authorized
- the input is malformed

## Preparation states

The preparation receipt can report:

```text
blocked_missing_pointer_inventory
blocked_restore_execution_unavailable
ready_for_execution
```

`blocked_missing_pointer_inventory` means durable history does not contain the complete pointer inventory required for safe restore execution.

`blocked_restore_execution_unavailable` is retained in the receipt schema for compatibility with pre-execution records created before the restore workflow existed. The current preparation service no longer emits it when all execution prerequisites are present.

`ready_for_execution` means the active and target snapshots were validated and the target reports durable pointer inventory. It contains no blocking issues and may be handed to the internal restore execution workflow together with the exact inventory and pointer expectations.

## Execution workflow

The execution workflow:

1. validates request and inventory relationships before mutation
2. checks for an existing request record before switching pointers
3. verifies target objects against the inventory
4. conditionally replaces pointers using expected current ETags
5. validates pointer-switch receipts
6. records the completed restore execution
7. replays completed requests without repeating pointer mutation

The workflow fails explicitly if pointer switching succeeds but execution-record persistence fails, and the failure carries the validated switch receipts for reconciliation.

## Explicit exclusions

The repository boundary does not add:

- a concrete production Cloudflare R2 restore adapter
- deployed restore execution database tables
- public restore UI controls
- live production restore verification

Those remain deployment or later implementation work.
