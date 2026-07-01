# Candidate promotion integration audit

**Implementation item:** P3-07J  
**Scope:** Repository integration and handoff audit for P3-07  
**Status:** In progress

## Audited promotion choices

P3-07 supports two explicit reviewer choices:

1. create a new hidden canonical Entity, optional Location, hidden candidate Claim, and Claim Assets;
2. reuse an existing version-pinned Entity and optional Location while creating only a new hidden candidate Claim and Claim Assets.

Neither path verifies or publishes the Claim.

## Shared authorization and request boundary

Both paths require the isolated `candidate:promote` capability. Each mutation carries a UUID request ID, verified actor identity, exact Candidate type and version, exact Candidate source-record set, and deterministic request fingerprint.

Reusing a request ID with different normalized content is a conflict. Replaying identical content returns the durable prior receipt.

## New-target boundary

The new-target path:

- creates hidden canonical identity records;
- creates only a hidden Claim with status `candidate`;
- rejects Confirmed status, public visibility, confirmation timestamps, review timestamps, and ending state;
- requires origin provenance for every non-null supported factual field when a field plan is supplied;
- resolves pending legacy mappings and links the Candidate in the same atomic transaction.

## Existing-target boundary

The existing-target path:

- does not rewrite the selected Entity or Location;
- rechecks exact Entity and optional Location versions;
- rechecks the canonical path and complete non-deleted Claim set;
- requires at least one identity-field attribution when a field plan is supplied;
- applies origin provenance to every non-null supported field on the new Claim and Claim Assets;
- creates only a hidden candidate Claim and Claim Assets.

## Provenance roles

- New canonical records use `origin`.
- Reused existing Entity and Location fields use `attribution`.
- New Claims and Claim Assets on an existing target use `origin`.
- Every assigned source must belong to the exact reviewed Candidate source set.

## Atomicity

Each durable backend commits guards, canonical changes, provenance rows, legacy mapping updates, Candidate links, and the replay receipt in one Drizzle/Neon batch. A guard, constraint, or injected pre-commit failure rolls back the full operation.

## Reviewer workspaces

The protected admin workspaces provide:

- new-target canonical editing;
- existing-target search and comparison;
- explicit target selection;
- stable draft IDs while editing;
- per-field Candidate source controls;
- submission blocking when required source coverage is incomplete.

## Machine validation

The repository validates P3-07 through:

- service contract tests;
- in-memory atomicity and replay tests;
- Drizzle persistence-shape tests;
- field provenance validators;
- new-target and existing-target component payload tests;
- cross-path integration tests;
- runtime checks;
- build, accessibility, staging-artifact, and migration-drift checks.

## Repository completion boundary

P3-07 is repository-complete when this audit passes CI and is merged. The following remain deferred and must not be represented as completed:

- live Cloudflare Access verification;
- live database transaction verification;
- production deployment verification;
- Evidence review and verification decisions, which belong to P3-08.
