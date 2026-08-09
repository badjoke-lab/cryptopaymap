# OPS-P6-002A — Configured staging P6-07 isolated restore evidence

## Purpose

This slice implements Q4 of Issue #349 after accepted Q2 monitoring and alert evidence and an accepted exact-main Q3 encrypted backup-integrity receipt. It restores the exact retained Q3 artifact into a distinct isolated PostgreSQL target, reconciles the restored schema and non-private data against the fixed-review canonical source, measures explicit recovery objectives, and safely disposes the isolated target.

The repository implementation may merge before protected configuration is supplied. Execution remains fail-closed until the exact current-main P6-01 through P6-06, Q1, Q2, and Q3 receipts are accepted and a distinct protected restore database is configured.

Runtime restore tooling is pinned to PostgreSQL client major 17 from the official PGDG Apt repository. Before artifact download or restore mutation, the workflow verifies that the selected `pg_restore` is major 17 and that both the fixed-review source and isolated restore target are not newer than that client. An unversioned Ubuntu `postgresql-client` or an older incompatible client fails closed before restore execution.

## Preconditions

Execution requires:

- exact current `main`;
- current accepted P6-01 through P6-06 receipts on one shared binding;
- current Q1 prerequisite diagnostic on the same commit and binding with no blocker;
- current accepted P6-07 Q2 monitoring and alert receipt on the same commit and binding;
- current accepted P6-07 Q3 backup-integrity receipt on the same commit and binding;
- the exact encrypted Q3 artifact identified by the Q3 workflow run and deterministic artifact name;
- configured fixed-review source `DATABASE_URL`;
- configured isolated `P6_07_RESTORE_DATABASE_URL`;
- retained `P6_07_BACKUP_ENCRYPTION_KEY` with at least 32 characters;
- exact confirmation `EXECUTE_CONFIGURED_STAGING_P6_07_Q4`;
- a bounded restore owner identity;
- an explicit isolated database name beginning `cpm_p6_07_restore_`;
- explicit bounded RPO and RTO objectives supplied at dispatch;
- successful repository contract validation.

## Exact artifact selection

The executor reads the accepted Q3 receipt from `staging-review`, validates its commit, shared binding, expiry, workflow run identity, encrypted-artifact digest, plaintext digest, inventory digest, encryption result, and corruption-rejection result, then resolves only this artifact:

```text
ops-p6-001y-configured-staging-p6-07-encrypted-backup-<Q3 workflow run id>
```

The downloaded file must be named `p6-07-q3-backup.enc.json`. The Q4 executor hashes the downloaded bytes before parsing and requires an exact match with the digest retained in the Q3 receipt. A missing, expired, wrong-run, wrong-name, malformed, or digest-mismatched artifact is rejected before any restore mutation.

## Restore-target safety

The restore target is accepted only when all of the following hold:

- the protected source and restore URLs are valid PostgreSQL URLs;
- their bounded URL identities differ;
- their live database identities differ;
- the live target database name exactly matches the dispatch input;
- the target name matches `cpm_p6_07_restore_<bounded suffix>`;
- no user table, view, materialized view, sequence, or foreign table exists in the target before restore;
- the target can be safely disposed after the drill.

The executor never selects a target by discovery and never falls back to the source database. A non-empty, ambiguous, same-identity, wrong-name, or unrecognized target fails closed before `pg_restore`.

## Restore and reconciliation

The expected Drizzle schema snapshot is resolved from the latest `_journal.json` entry's numeric `idx`, zero-padded to the canonical `NNNN_snapshot.json` filename. The human-readable journal `tag` is retained only as bounded receipt metadata and is never used as the snapshot filename. A missing, invalid, or unresolved index fails closed before any restore mutation.

After authenticated decryption and Q3 inventory revalidation, the executor restores the custom-format dump with:

```text
pg_restore
--exit-on-error
--single-transaction
--no-owner
--no-privileges
```

The executor then proves:

- the current Drizzle snapshot revision matches the Q3 schema revision;
- every expected public table from the current Drizzle snapshot exists in the fixed-review source and isolated target;
- source and target schema-only digests match;
- every expected non-private table has the same row count in source and target;
- private Submission tables excluded by Q3 contain zero restored rows;
- expected foreign-key and check constraints are present and validated;
- the target has no invalid constraint;
- at least one expected non-private table contains a representative restored row;
- canonical records, relationships, provenance, review and audit records, release and publication metadata, Media linkage, and operational configuration covered by the Q3 backup are represented by the all-table reconciliation.

The executor records only table-set, row-count, constraint, schema, and invariant digests. It does not retain row values, private payloads, contacts, credentials, database URLs, or unrestricted logs.

## RPO and RTO

RPO is measured from the selected Q3 backup creation time to the Q4 restore start. RTO is measured from the restore start through schema, table, row-count, constraint, privacy, and representative-read verification.

Both objectives are explicit workflow-dispatch inputs. The executor does not invent or silently relax objectives. Invalid objectives, an RPO breach, or an RTO breach produces a failed receipt even when the database restore otherwise succeeds.

## Disposal

After restore execution begins, the isolated target is disposed in a `finally` path regardless of success or failure. Disposal drops the restored `public` schema with cascade, recreates an empty `public` schema, and verifies that no user object remains.

An accepted receipt requires successful disposal. A partial restore, failed invariant, objective breach, or other execution failure does not permit an uncleared target to be treated as ready. Disposal failure remains a launch-blocking exception requiring operator remediation.

## Receipt

Successful execution publishes:

`config/staging-authorization/p6-07-isolated-restore-receipt.json`

The receipt records only bounded evidence:

- exact commit and shared P6-01 through P6-06 binding;
- Q1, Q2, and Q3 receipt digests;
- Q3 workflow and artifact identities as safe digests;
- downloaded artifact, plaintext, inventory, and schema digests;
- bounded source and restore identity digests;
- target preflight and isolation result;
- expected and restored table counts;
- non-private row-count reconciliation digest;
- private-table zero-row result;
- foreign-key, check-constraint, and invalid-constraint counts;
- representative-read result;
- measured and objective RPO and RTO;
- disposal result;
- bounded owner, workflow run, expiry, and exceptions.

The receipt is `accepted` only when every precondition, artifact, target-safety, restore, reconciliation, privacy, objective, and disposal check passes with no exception.

## Safety boundary

This slice:

- performs no production authorization or production mutation;
- performs no DNS, Pages, custom-domain, certificate, cache, R2, canonical-source write, release activation, or go-live mutation;
- does not modify the fixed-review canonical database;
- never restores to a discovered or non-empty target;
- never retains plaintext backup bytes after execution;
- never retains protected URLs, encryption material, private Submission rows, contacts, row values, raw provider identifiers, or unrestricted logs;
- fails closed on stale predecessors, wrong binding, wrong artifact, same database identity, non-empty target, partial restore, schema or row-count mismatch, private-data restoration, objective breach, or failed disposal.

## Boundary

An accepted Q4 receipt proves only the configured-staging encrypted-backup restore drill, reconciliation, measured RPO/RTO, and isolated-target disposal. It does not prove the later incident-response exercise, production recovery, final P6-07 completion, staging launch authorization, production authorization, or production cutover.
