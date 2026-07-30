# OPS-P6-001G — Configured staging P6-03 Neon transaction harness

## Purpose

This operational slice executes the repository's real Candidate promotion service and Drizzle backend against the fixed-review Neon database with an isolated hidden fixture. It establishes the configured execution harness required by P6-03 without weakening the five-class evidence contract.

## Exact-main guard

Execution requires:

- confirmation `EXECUTE_CONFIGURED_STAGING_P6_03`;
- an exact lowercase current `main` commit;
- current accepted P6-01 and P6-02 receipts;
- an identical launch binding across P6-01 and P6-02;
- the configured fixed-review `DATABASE_URL`;
- a bounded transaction operator identity.

## Representative journey

The first configured journey uses an isolated online-service Candidate and exercises the actual Candidate promotion service. The atomic batch includes:

- hidden canonical Entity creation;
- hidden candidate Acceptance Claim creation;
- Claim Asset set creation;
- provenance links;
- Candidate state transition;
- durable Candidate promotion decision receipt.

The retained evidence records only safe digests, table-class counts, bounded result names, timestamps, and predecessor bindings.

## Required cases

The harness proves:

1. positive commit creates exactly one canonical/receipt chain;
2. exact replay returns the durable prior receipt without duplicate effects;
3. changed content under the same request ID conflicts;
4. a new request against stale Candidate state conflicts;
5. an invalid downstream foreign key fails after canonical statements are queued and the complete atomic batch rolls back;
6. the failed transaction creates no canonical row or promotion receipt and leaves the Candidate retryable;
7. export activation count remains unchanged and all committed canonical records remain hidden;
8. all fixture rows are removed after evidence capture.

## Five-class fail-closed rule

P6-03 remains `failed` until all required configured mutation classes are present:

- Candidate resolution;
- Location field correction;
- complete relationship replacement;
- Business Claim payment application;
- Photos/Media binding.

This slice marks only Candidate resolution as passed. Missing classes are explicit receipt exceptions and cannot be interpreted as launch authorization.

## Retained receipt

The workflow publishes:

`config/staging-authorization/p6-03-neon-transaction-receipt.json`

The receipt must not contain fixture UUIDs, slugs, source payloads, database hostnames, connection strings, credentials, raw errors, unrestricted query output, or private submission data.

## Safety boundary

No production database, public record, export, release, activation, DNS, canonical public visibility, or account-specific operational detail is changed by this slice.
