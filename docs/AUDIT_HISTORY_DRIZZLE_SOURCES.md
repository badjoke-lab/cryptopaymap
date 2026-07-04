# Audit history durable Drizzle sources

**Implementation item:** P3-12C  
**Status:** Active

## Purpose

P3-12C connects the normalized audit history aggregation layer to durable Phase 3 database tables.

Each durable table is exposed through a bounded read-only `AuditHistorySource` adapter. The normalized cross-source merge remains the responsibility of the existing aggregation backend.

## Durable sources

The current durable source set covers:

- candidate duplicate decisions
- candidate promotion decisions
- Evidence review decisions
- reconfirmation expirations
- Media review decisions
- export release decisions
- export activation records

Export restore execution remains outside the durable source set until a restore execution database table exists.

## Query bounds

Every source:

- orders by its authoritative occurrence timestamp
- applies deterministic created-at and record-ID tie breakers
- reads at most `sourceLimit + 1` rows
- returns at most `sourceLimit` normalized items
- uses the extra row only to signal `hasMore`

The aggregation layer continues to apply defensive actor, target, time-range, cursor, domain, duplicate-ID, and cross-source ordering checks.

## Composition

`createDrizzleAuditHistoryBackend()` composes the seven Drizzle sources with `createAggregatedAuditHistoryBackend()` so protected API work can consume one `AuditHistoryBackend` boundary.

## Explicit exclusions

P3-12C does not add:

- a protected audit history API route
- an Audit administration UI
- a restore execution database table
- live database or production verification
- final Phase 3 integration sign-off
