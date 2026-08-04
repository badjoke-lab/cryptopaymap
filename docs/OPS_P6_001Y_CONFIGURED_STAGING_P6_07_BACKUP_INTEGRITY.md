# OPS-P6-001Y — Configured staging P6-07 backup integrity evidence

## Purpose

This slice implements Q3 of Issue #349 after accepted Q2 monitoring and alert evidence. It creates a bounded encrypted backup artifact from the fixed-review canonical database and proves artifact existence, scope, inventory reconciliation, authenticated decryption, retention metadata, and corruption rejection.

The implementation may merge before protected configuration is supplied. Execution remains fail-closed until `P6_07_BACKUP_ENCRYPTION_KEY` is configured and Q1 is rerun without the `backup_encryption:missing` blocker.

## Preconditions

Execution requires:

- exact current `main`;
- current accepted P6-01 through P6-06 receipts on one shared binding;
- current accepted P6-07 Q2 monitoring and alert receipt on the same commit and binding;
- current Q1 prerequisite diagnostic on the same commit and binding;
- configured fixed-review `DATABASE_URL`;
- retained `P6_07_BACKUP_ENCRYPTION_KEY` with at least 32 characters;
- exact confirmation `EXECUTE_CONFIGURED_STAGING_P6_07_Q3`;
- a bounded backup owner identity;
- successful repository contract validation.

The Q1 diagnostic may remain `configuration_blocked` only for `isolated_restore_database:missing`. Q3 does not require or access the isolated restore target.

## Backup scope

Included scope classes:

- canonical database records and relationships;
- provenance and Evidence records;
- review and application receipts;
- release metadata;
- Media linkage metadata;
- bounded operational configuration stored in the canonical database.

Excluded scope classes:

- private Submission payload and contact data;
- transient build output and caches;
- unrestricted logs;
- credentials, tokens, and encryption material;
- provider control-plane state.

Known private Submission tables are excluded from table data during `pg_dump`. Their schema may remain available for later compatibility checks, but private rows are not included in the encrypted backup artifact.

## Encrypted backup artifact

The executor:

1. parses the protected database URL without printing it;
2. invokes `pg_dump` in custom format with owner and privilege metadata removed;
3. inventories the dump with `pg_restore --list`;
4. requires non-empty schema, table, and table-data inventory;
5. encrypts the dump with AES-256-GCM;
6. binds authenticated metadata to the exact commit, schema revision, environment, and scope digest;
7. writes only the encrypted JSON envelope as the retained artifact;
8. deletes temporary plaintext material before completion.

The artifact is uploaded as a run-scoped GitHub Actions artifact with a 30-day retention period. The receipt retains only digests, counts, bounded metadata, and the safe key-reference digest. It never retains the database URL or encryption key.

## Integrity and corruption rejection

After creation, the executor:

- reads the retained encrypted artifact;
- performs authenticated decryption with the protected key;
- verifies the decrypted digest against the original dump digest;
- reruns `pg_restore --list` and requires the inventory digest and object count to match;
- mutates a copy of the authentication tag and requires decryption to fail;
- rejects missing, empty, malformed, unencrypted, inventory-incomplete, digest-mismatched, or corruption-tolerant artifacts.

A successful job without an encrypted artifact and verified corruption rejection cannot produce an accepted receipt.

## Receipt

Successful execution publishes:

`config/staging-authorization/p6-07-backup-integrity-receipt.json`

The receipt records:

- exact commit and shared P6-01 through P6-06 binding;
- Q1 and Q2 receipt digests;
- schema revision digest;
- included and excluded scope classes;
- encrypted artifact size and digest;
- plaintext backup digest without retaining plaintext;
- inventory object, schema, table, and table-data counts;
- encryption algorithm and safe key-reference digest;
- retention and deletion schedule;
- authenticated decryption, digest match, inventory reconciliation, and corruption rejection results;
- bounded owner, workflow run, expiry, and exceptions.

The receipt is `accepted` only when every precondition, backup, encryption, inventory, integrity, retention, and corruption-rejection check passes with no exception.

## Safety boundary

This slice:

- performs no production authorization or production mutation;
- performs no DNS, Pages, custom-domain, certificate, cache, R2, canonical write, release activation, or restore mutation;
- does not access `P6_07_RESTORE_DATABASE_URL`;
- does not upload or retain plaintext backup material;
- does not retain private Submission payload rows, contacts, credentials, tokens, database URLs, encryption keys, raw provider identifiers, or unrestricted logs;
- fails closed on missing encryption configuration, stale predecessors, binding mismatch, incomplete inventory, failed authenticated decryption, or failed corruption rejection.

## Boundary

An accepted Q3 receipt proves only encrypted configured-staging backup integrity. It does not prove isolated restore, RPO, RTO, safe disposal, incident response, full P6-07 completion, staging launch authorization, production authorization, or production cutover. Q4 remains blocked until a distinct protected isolated restore database is configured and Q1 is rerun.
