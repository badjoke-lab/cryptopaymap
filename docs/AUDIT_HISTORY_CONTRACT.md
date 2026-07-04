# Audit history contract

**Implementation item:** P3-12A  
**Status:** Active

## Purpose

This contract defines a normalized, protected read model for Phase 3 administrative history.

Phase 3 already stores durable domain receipts and events for candidate review, Evidence review, reconfirmation, Media review, export release decisions, activation, and restore execution. P3-12A does not duplicate those writes. It defines the common metadata envelope and bounded query contract that later backend work can populate from authoritative durable sources.

## Isolated read capability

Audit history uses:

```text
audit:read
```

The contract does not reuse mutation capabilities such as `evidence:review`, `media:review`, `export:release`, or `export:publish`.

## Domains

```text
candidate
evidence
reconfirmation
media
export
```

## Source kinds

```text
candidate_duplicate_decision
candidate_promotion
evidence_review_decision
reconfirmation_expiration
media_review_decision
export_release_decision
export_activation
export_restore_execution
```

Each source kind is pinned to exactly one audit domain. A mismatched domain and source-kind pair is rejected.

## Normalized event metadata

Every audit item contains:

- stable audit item ID
- occurrence timestamp
- domain
- source kind
- normalized action
- actor ID and actor type
- request ID when the source has one
- one primary target
- bounded secondary targets
- reason code when available
- bounded summary when appropriate
- optional state transition
- authoritative source record ID

The audit item deliberately has no arbitrary payload field.

## Privacy and leakage boundary

The audit history contract must not expose:

- submission contact details
- email addresses from administrator identity payloads
- private Evidence bodies or private Evidence URLs
- private Media storage keys
- original private uploads
- internal notes
- raw source payloads
- secrets or environment configuration

Later source adapters may map stable identifiers, actions, reason codes, public-safe summaries, and state transitions only through the normalized contract.

## Query contract

Supported filters are:

- domain
- actor ID
- target type and target ID
- from and to timestamps
- stable `before` plus `beforeId` cursor pair
- limit from 1 to 100, default 25

A target ID requires a target type. Cursor timestamp and cursor ID must be supplied together. Invalid time ranges are rejected.

## Deterministic ordering

Backends must return:

```text
occurredAt DESC
id DESC
```

The loader rejects duplicate IDs, out-of-order results, invalid source-domain combinations, malformed records, and result sets larger than the requested limit.

## Backend boundary

P3-12A defines `AuditHistoryBackend` only.

The next slice may implement bounded aggregation over existing durable Phase 3 decision and event sources. P3-12A does not add a new audit database table and does not claim live database aggregation.

## Explicit exclusions

P3-12A does not add:

- audit-history database aggregation
- protected audit API routes
- audit administration UI
- live Cloudflare Access policy verification
- Phase 3 final integration sign-off
