# CryptoPayMap database migration and rollback contract

## Purpose

This document defines the rollback contract for reviewed Drizzle and PostgreSQL migrations.

CryptoPayMap does not assume that every production migration can be safely reversed by running an automatic down migration. Rollback is selected according to compatibility, data impact, and whether the migration has reached production.

## Core rules

1. Migration SQL, snapshots, and journal entries are reviewed together.
2. A migration merged to `main` is immutable. Corrections use a new migration.
3. An unpublished migration on a work branch may be regenerated before merge.
4. Migration drift must be zero before merge.
5. A database backup or provider restore point is required before a production migration.
6. Public JSON publication remains separate from database migration success.
7. Candidate, private Evidence, private media, contacts, and internal notes are never used as rollback artifacts.

## Phase 2 migration history

The Phase 2 schema history is recorded by the Drizzle journal from migration `0000` through `0011`.

The reviewed history contains:

- registry and canonical identity structures;
- entities and locations;
- acceptance claims and claim combinations;
- Evidence and verification history;
- source candidates, provenance, and licenses;
- media metadata and legacy mappings;
- database constraints that enforce public eligibility.

The journal, generated snapshots, migration SQL, and current Drizzle schema must agree. The Migration drift workflow verifies this agreement.

## Before applying a migration

Record or verify:

- application commit and migration journal head;
- database environment and schema version;
- backup or restore-point identifier;
- row counts for affected tables;
- expected locks and deployment window;
- generated SQL review result;
- rollback owner and stop condition;
- previous public artifact snapshot and application deployment.

Do not apply a production migration when the backup or restore path is unknown.

## Rollback decision

### Case A — Migration has not been applied

- stop deployment;
- fix or regenerate the unpublished migration;
- rerun formatting, schema checks, tests, build, and migration drift;
- do not alter a migration already merged to `main`.

### Case B — Additive or backward-compatible migration applied successfully

When the old application remains compatible with the new schema:

- roll the application back to the previous deployment;
- leave the additive schema in place;
- stop new writers that depend on the new fields;
- investigate and ship a new forward corrective migration if required.

This is preferred over destructive schema reversal.

### Case C — Migration applied but database behavior is unsafe

Examples include invalid constraints, unexpected write failures, incorrect transformations, or material data corruption.

- stop affected writes;
- keep public publication disabled;
- capture database state and failure logs without secrets or private payloads;
- choose one of the following:
  - restore the verified pre-migration database snapshot; or
  - apply a reviewed forward corrective migration when restoration would lose valid writes;
- redeploy the compatible application commit;
- rerun integrity, orphan, constraint, count, and migration-history checks.

A manual destructive reversal is not performed without a reviewed SQL plan and a verified backup.

### Case D — Migration succeeds but public export fails

- do not publish the new artifact set;
- continue serving the previous validated public snapshot;
- keep the database migration and public release as separate states;
- correct the projection or export logic;
- publish only after the complete artifact set passes schema, leakage, manifest, count, time, version, and digest validation.

### Case E — Non-production or disposable environment

For an isolated development or test database with no retained operational data:

- reset the database;
- check out the intended application commit;
- replay migrations from the journal head for that commit;
- rerun all schema and integration checks.

This reset path is not a production rollback method.

## Data-preserving forward correction

Use a new forward migration when:

- the current schema is still readable by the previous application;
- valid writes occurred after migration;
- restoring a snapshot would discard accepted changes;
- a constraint or index can be corrected safely;
- a new nullable column or table can remain without exposure.

A corrective migration must include:

- the failure it addresses;
- affected tables and constraints;
- data-preservation behavior;
- lock and performance considerations;
- validation queries or automated checks;
- the application versions that remain compatible.

## Snapshot restoration

Use snapshot restoration when:

- schema or data corruption cannot be corrected safely in place;
- writes can be stopped;
- the restore point is verified;
- the accepted loss window is known;
- the previous application deployment and public artifact snapshot remain available.

After restoration:

1. verify migration journal state;
2. verify table and row-count expectations;
3. run integrity and orphan checks;
4. run runtime schemas and tests;
5. build the static site;
6. validate the retained public artifacts;
7. resume writes only after review.

## Public data continuity

Database rollback does not require replacing a valid public snapshot with incomplete data.

The public site may continue to serve the last validated JSON and GeoJSON release while:

- database writes are stopped;
- a migration is corrected;
- a snapshot is restored;
- a new release is generated and validated.

## Secrets and private data

Rollback records may contain identifiers, counts, migration names, and validation results. They must not contain:

- credentials or connection strings;
- private source payloads;
- submission contacts;
- private Evidence;
- private media keys;
- status tokens;
- internal notes containing personal information.

## Completion evidence

A migration-related pull request is complete only when applicable checks pass:

- SQL and snapshot review;
- journal continuity;
- migration drift;
- runtime schemas;
- database constraints;
- unit and integration tests;
- static build;
- documented rollback selection for a production release.

Phase 2 therefore satisfies the migration completion criterion through reviewable SQL history plus this documented rollback contract, rather than claiming universal automatic reversibility.
