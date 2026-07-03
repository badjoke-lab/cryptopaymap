# Export activation history

**Implementation item:** P3-11F  
**Status:** Active

## Purpose

P3-11F records successful export activations in durable database state.

The record is written only after the activation runner returns a successful publication receipt. Failed approval checks, candidate mismatches, pointer conflicts, and target failures do not create an activation record.

## Stored identity

Each record stores:

- request ID
- approved release decision request ID
- active snapshot digest
- dataset and schema versions
- generation and activation times
- previous active snapshot digest
- active pointer key
- immutable release prefix
- artifact count
- actor identity and actor type
- reason code and optional internal note
- request fingerprint

## Replay and conflict

The request ID is unique.

An identical request returns the stored receipt as `replayed`.

The same request ID with a different fingerprint is rejected as a conflict.

Snapshot digest and dataset version are also unique so a different request cannot create a second activation record for the same public release.

## Database constraints

The activation table enforces digest shape, bounded artifact count, non-empty actor and reason fields, generated-before-published ordering, and distinct previous/current snapshot digests.

## Explicit exclusions

P3-11F does not add rollback execution, release history UI, inactive object cleanup, or live database and R2 verification.
