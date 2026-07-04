# Audit history aggregation

**Implementation item:** P3-12B  
**Status:** Active

## Purpose

P3-12B adds the bounded aggregation layer between existing Phase 3 decision records and the normalized audit-history contract.

Existing durable domain records remain authoritative. This slice does not add a second write path.

## Sources

Normalizers are defined for candidate identity decisions, candidate promotions, Evidence reviews, reconfirmation expirations, Media reviews, export release decisions, export activations, and export restore executions.

Each source produces the metadata-only item shape defined in P3-12A.

## Aggregation behavior

The aggregator:

1. selects sources relevant to the requested domain
2. loads bounded source batches concurrently
3. validates normalized items
4. verifies source-domain consistency
5. rejects duplicate item identities
6. applies actor, target, time-range, and cursor filters defensively
7. merges items by `occurredAt DESC, id DESC`
8. returns at most the requested limit
9. reports more history when any bounded source has additional records

Concrete source adapters must apply filters before their own source limit is taken. The aggregate layer repeats normalized filters as a defense boundary.

## Failure behavior

A source failure fails the aggregate read. Invalid normalized items and duplicate identities also fail closed. The history endpoint must not silently present an incomplete subset as complete.

## Explicit exclusions

P3-12B does not add Drizzle source adapters, protected audit API routes, Audit administration UI, live database verification, or the final Phase 3 integration sign-off.
