# Export release restore execution record

**Implementation item:** P3-11J  
**Status:** Active

## Purpose

This document defines the durable record boundary for a completed export release restore.

P3-11J does not perform the object-store pointer switch itself. It defines what must be present before a restore can be recorded as completed.

## Required inputs

A restore record requires:

- publication-capable actor context
- restore request metadata
- target pointer inventory
- pointer switch receipts

The target pointer inventory pins every pointer key to the target object key, target SHA-256 digest, target ETag, content type, and size.

## Inventory guardrails

The target inventory must:

- target a different snapshot from the previous active snapshot
- include the active pointer key
- contain no duplicate pointer keys
- point every target object key inside the target release prefix
- contain between 1 and 100 pointer entries

## Pointer switch receipt guardrails

The pointer switch receipt set must:

- contain exactly one receipt for each inventory pointer key
- not contain pointers outside the inventory
- report a new ETag matching the target inventory ETag

## Replay and conflict behavior

Restore records are request-ID based.

If the same request ID and same fingerprint are seen again, the existing record is replayed.

If the same request ID is reused with different content, the request is rejected as a conflict.

## Explicit exclusions

P3-11J does not add:

- live R2 pointer switching
- Drizzle restore execution tables
- public restore UI controls
- production verification
