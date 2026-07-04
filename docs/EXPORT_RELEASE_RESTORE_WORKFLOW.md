# Export release restore workflow

**Implementation item:** P3-11L  
**Status:** Active

## Purpose

This slice connects pointer switching to restore execution recording.

The workflow sequence is:

1. authorize the publication-capable actor
2. validate request and inventory relationships
3. calculate the request fingerprint and check for replay or conflict
4. validate target release objects and conditionally switch pointers
5. persist the completed execution record with switch receipts

## Pre-mutation validation

Before object-store mutation, the workflow verifies:

- `export:publish` authority
- request input shape
- pointer inventory shape
- target snapshot agreement
- expected active snapshot agreement
- request fingerprint agreement with any existing execution record

The fingerprint includes actor ID, actor type, target snapshot, expected active snapshot, restore time, reason code, internal note, and inventory fingerprint.

Invalid requests and request-ID conflicts fail before pointer replacement.

## Replay behavior

The workflow checks for an existing matching execution before pointer switching.

A matching request ID and fingerprint returns the completed record directly. Target objects are not inspected and pointers are not switched again.

A reused request ID with different content fails with `replay_validation_failed` before object-store mutation.

The execution service checks the record again after pointer switching to guard concurrent requests.

## Failure boundary

Pointer-switch failure does not write a completed execution record.

When pointer switching succeeds but record persistence fails, the workflow raises `execution_record_failed_after_switch` and includes validated switch receipts for reconciliation.

Object storage and database persistence are separate operations. P3-11L therefore records partial-success evidence explicitly instead of reporting completion.

## Explicit exclusions

P3-11L does not add:

- a concrete Cloudflare R2 adapter
- restore execution database tables
- public restore controls
- live production verification
- the final P3-11 integration audit
