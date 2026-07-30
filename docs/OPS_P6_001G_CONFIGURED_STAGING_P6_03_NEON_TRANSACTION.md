# OPS-P6-001G configured staging P6-03 Neon transaction evidence

## Purpose

This operational slice executes the repository-defined P6-03 transaction evidence contract against the fixed configured-staging Neon database.

Repository checks alone do not prove a configured database transaction. The retained receipt is accepted only after the exact current `main` revision executes the bounded fixture and all configured checks pass.

## Preconditions

The guarded workflow requires:

- exact confirmation `EXECUTE_CONFIGURED_STAGING_P6_03`;
- an exact 40-character current `main` commit;
- a bounded transaction owner;
- a configured `DATABASE_URL`;
- current accepted P6-01 and P6-02 receipts for the same commit;
- one identical P6-01/P6-02 release, data, configuration, and environment binding;
- successful repository contract checks.

## Isolated fixture

The configured procedure uses reserved UUIDs and one deliberately hidden Entity and Location. The fixture:

- is never public;
- is not a Candidate import or user-visible record;
- uses no private Submission payload, contact, Evidence URL, Media object, or external identity;
- is removed after the configured checks finish;
- is removed again on the next run before seeding, so interrupted runs are recoverable.

The fixture exists only to prove the actual database transaction boundary without changing reviewed public records.

## Atomic positive transaction

One transaction binds:

1. a hidden canonical Location field update;
2. one `location_profile_correction_decisions` receipt;
3. the matching common Submission application transition from `pending / blocked` to `committed / pending`;
4. one append-only `application_committed` audit event.

The transaction uses an application-scoped PostgreSQL advisory lock and exact canonical/application pre-state guards.

## Injected failure and rollback

Before the positive transaction, the procedure executes the same multi-write shape with an intentional failure after the writes are queued. It passes only when the database proves:

- the Location remains at the exact pre-state;
- no correction decision survives;
- no application transition survives;
- the original registration event remains the only application event.

## Replay, duplicate, and conflict coverage

The configured matrix proves:

- two concurrent exact executions serialize under the advisory lock;
- exactly one transaction commits and the competing execution fails closed;
- the committed receipt and audit event remain singular;
- exact replay resolves to the durable prior result with no duplicate effects;
- a changed fingerprint is not accepted as the exact replay;
- a stale expected canonical version fails before mutation;
- a missing application prerequisite produces no write.

## Publication separation

P6-03 does not publish the fixture.

The configured receipt requires:

- Entity and Location visibility remain `hidden`;
- application publication state remains `pending`;
- export-release decision count is unchanged;
- export-activation record count is unchanged;
- no release, DNS, production, or public visibility transition occurs.

## Retained receipt

The workflow publishes:

```text
config/staging-authorization/p6-03-neon-transaction-receipt.json
```

The receipt includes only bounded evidence:

- exact commit and expiry;
- hashed operator identity;
- hashed database and schema identifiers;
- migration count and migration-ledger digest;
- predecessor states and shared binding;
- canonical pre/post-state digests;
- application receipt and audit-event digests;
- fixture-specific row counts;
- rollback, concurrency, replay, stale-state, changed-content, missing-prerequisite, publication-separation, and cleanup outcomes;
- bounded exception codes.

It does not include a connection string, password, token, database name, private payload, unrestricted row dump, private Evidence, or raw operational credential.

## Acceptance

P6-03 becomes `accepted` only when every configured check passes, cleanup succeeds, the receipt is current, and it preserves the exact P6-01/P6-02 binding.

The workflow remains manual and exact-commit bound; a repository push or successful contract check cannot execute the configured database fixture by itself.

An accepted P6-03 receipt does not authorize staging, production, release activation, DNS cutover, or launch. P6-04 remains the next configured predecessor.
