# CryptoPayMap administration data-access foundation

## Purpose

P3-01 establishes the private write boundary used by later administration and review features.

It persists reviewed import plans into the private data layer without creating canonical entities, locations, acceptance claims, verification events, or public artifacts.

```text
validated import plan
  -> administration authorization
  -> private-boundary validation
  -> one atomic database batch
  -> immutable persistence receipt
```

## Scope

P3-01 persists:

- import-batch metadata;
- immutable source records;
- private source candidates;
- candidate-to-source origin relationships;
- pending legacy mappings.

P3-01 does not persist:

- canonical entities or locations;
- acceptance claims;
- claim assets or networks;
- Evidence decisions;
- verification events;
- media decisions;
- public JSON or GeoJSON.

## Administration mutation context

Every write requires:

- UUID request ID;
- opaque actor ID;
- actor type: `human` or `system`;
- `candidate:write` capability.

The import-batch row records the request ID and actor identity. Email addresses, credentials, access tokens, and private contact details are not stored in this context.

A request without the required capability fails before reaching the database backend.

## Import-batch record

Each private batch records:

- source ID;
- import kind;
- source schema version;
- importer version;
- SHA-256 input checksum;
- input, accepted, rejected, replayed, out-of-scope, and duplicate-signal counts;
- automatic Confirmed count, which must remain zero;
- rejection counts grouped by reason;
- start and completion times;
- request and actor identity.

The database enforces count relationships, nonnegative values, time order, checksum format, and zero automatic Confirmed records.

## Candidate-plan validation

Before persistence, the service verifies:

- actor authorization;
- metadata shape and time order;
- lowercase SHA-256 checksum;
- summary counts against concrete arrays;
- unique candidate, source-record, and legacy-mapping IDs;
- source ID consistency;
- import-batch identity consistency;
- `candidate_status = new`;
- null canonical entity and location IDs;
- physical versus online candidate-type boundaries;
- exact origin relationship IDs;
- expected legacy source system;
- pending unresolved legacy mapping state;
- zero automatic Confirmed records.

A rejected plan does not call the persistence backend.

## Transaction model

The production adapter uses the Drizzle Neon HTTP batch API.

All statements for one request are submitted in one batch transaction:

1. insert the import-batch row if absent;
2. verify the stored batch exactly matches the request;
3. insert each source record if absent;
4. insert each source candidate if absent;
5. insert each origin relationship if absent;
6. insert each pending legacy mapping if absent;
7. verify every resulting private record exactly matches the validated draft.

A database guard deliberately fails when an existing row conflicts with the deterministic draft. PostgreSQL then rolls back the complete batch.

This is a one-shot transaction. P3-01 does not claim support for long-running or interactive database transactions.

## Idempotency

The request ID is the idempotency key for the administration mutation.

An exact retry must reuse:

- the request ID;
- import-batch ID;
- source and import kind;
- input checksum;
- importer and source schema versions;
- counts and rejection summary;
- deterministic source, candidate, relationship, and legacy-mapping identities;
- original private payloads.

An exact retry succeeds without creating duplicate rows.

Changing content while reusing an existing deterministic identity is a persistence conflict and rolls back.

Using a different batch ID for the same source, kind, importer version, and checksum conflicts with the unique batch identity rather than silently creating a second audit record.

## Failure behavior

Validation failure:

- no backend call;
- no database write.

Known PostgreSQL identity, foreign-key, check, or exact-match guard failure:

- reported as a persistence conflict;
- complete batch rollback.

Unexpected backend or network failure:

- reported as an uncommitted backend failure;
- no committed receipt is returned.

A caller must not display or record a successful administration action until the service returns `state = committed`.

## In-memory contract backend

The in-memory backend mirrors the atomic contract for automated tests.

It supports:

- exact replay;
- conflicting deterministic identity rejection;
- unique source external identity;
- unique legacy source identity and path;
- injected pre-commit failure;
- copy-on-write rollback.

It is not a production data store.

## Public boundary

All P3-01 data remains private. The service has no public route and does not invoke public artifact generation.

Later administration items must continue to use explicit review and promotion operations. Persisting a source candidate is not evidence that a place or service accepts cryptocurrency.

## Phase 3 handoff

Later items add:

- protected administration routes;
- candidate queues and detail views;
- duplicate decisions;
- canonical entity and location creation;
- claim editing and promotion;
- Evidence review;
- status transitions;
- media review;
- controlled export and audit interfaces.

Those items must use this authorization, idempotency, transaction, and fail-closed boundary rather than writing directly from UI input.
