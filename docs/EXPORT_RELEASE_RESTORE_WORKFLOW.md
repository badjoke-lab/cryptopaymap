# Export release restore workflow

**Implementation item:** P3-11L  
**Status:** Active

## Purpose

This slice connects the restore pointer-switch boundary to the restore execution-record boundary.

A successful workflow now has one controlled sequence:

1. authorize the publication-capable actor
2. validate the restore request and pointer inventory relationship
3. inspect an existing request record for replay
4. validate target release objects and conditionally switch pointers
5. persist the completed restore execution record with the exact switch receipts

## Pre-mutation validation

Before any object-store mutation, the workflow verifies:

- `export:publish` authority
- request input shape
- pointer inventory shape
- requested target snapshot equals the inventory target snapshot
- expected active snapshot equals the inventory previous-active snapshot

Invalid requests fail before pointer replacement.

## Replay behavior

The workflow checks the request ID before pointer switching.

When a matching execution record already exists, its pointer-switch receipts are passed through the existing execution-record replay validation and no pointer is switched again.

A mismatched request using an existing request ID fails as replay validation failure.

## Failure boundary

Pointer-switch failure does not write a completed execution record.

If pointer switching succeeds but durable execution-record persistence fails, the workflow raises `execution_record_failed_after_switch` and carries the validated pointer-switch receipts on the error. This makes the post-mutation persistence failure explicit for operator reconciliation instead of reporting the restore as completed.

## Explicit exclusions

P3-11L does not add:

- a concrete Cloudflare R2 adapter
- restore execution database tables
- public restore controls
- live production verification
- the final P3-11 integration audit
