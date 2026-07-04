# Export release restore pointer switch

**Implementation item:** P3-11K  
**Status:** Active

## Purpose

This boundary validates target release objects before an active export pointer is replaced.

It is intentionally adapter-based. The core contract does not depend on a concrete R2 binding and can be tested without live object storage.

## Inputs

A restore pointer switch needs:

- restore pointer inventory
- one expected current ETag per pointer key
- an object-store adapter
- a switch timestamp

## Preflight checks

Before replacing a pointer, the boundary inspects the target object and verifies:

- object key
- target ETag
- SHA-256 digest
- content type
- byte size

The switch is not attempted if the target object is missing or has changed.

## Conditional replacement

The adapter receives:

- pointer key
- target object key
- expected current ETag
- target ETag
- switch timestamp

The adapter must return a pointer switch receipt. The boundary validates that receipt before returning it to the caller.

## Explicit exclusions

P3-11K does not add:

- a concrete Cloudflare R2 adapter
- restore database tables
- public restore UI controls
- live production verification
