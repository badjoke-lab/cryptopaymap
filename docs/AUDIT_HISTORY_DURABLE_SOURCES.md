# Audit history durable sources

**Implementation item:** P3-12C  
**Status:** Active

## Purpose

P3-12C connects normalized audit history aggregation to existing Phase 3 decision and event tables.

No second audit write path is added. Existing source tables remain authoritative.

## Connected sources

The source registry includes candidate duplicate decisions, candidate promotions, Evidence review decisions, reconfirmation expirations, Media review decisions, export release decisions, and export activation records.

Each source reads one extra row beyond its bounded source limit to report `hasMore`, maps records through metadata-only normalizers, and preserves deterministic source ordering.

## Filter pushdown

Each source pushes applicable filters into its query before applying the source limit:

- actor ID
- from and to timestamps
- stable before timestamp and audit item ID cursor
- source-specific primary or secondary target filters

The aggregate layer repeats normalized filters as a defense boundary.

## Cursor ordering

Source queries order by occurrence time descending and source record ID descending. At equal timestamps, cursor comparison uses the normalized `sourceKind:sourceRecordId` identity.

## Restore execution source

The restore execution contract has a normalized audit mapper, but it is not registered as a Drizzle source here because there is no deployed restore execution table in the repository schema.

The source registry does not claim durable database history for a record class whose table is not present.

## Failure and privacy behavior

Normalizers do not expose internal notes or arbitrary source payloads. Source failures propagate through the aggregate fail-closed behavior, so partial history is not presented as complete.

## Explicit exclusions

P3-12C does not add a restore execution table, protected audit history API route, Audit administration UI, live database verification, or final Phase 3 integration sign-off.
