# OPS-P6-001Q — Configured staging P6-07 prerequisite diagnostic

## Purpose

P6-07 cannot begin with backup, restore, alert, or incident mutations until the exact configured staging environment and every required protected input are identified. This slice adds a read-only diagnostic that binds the next work to current P6-01 through P6-06 evidence and reports missing operational configuration without retaining secrets.

Parent operational issue: #349.

## Scope

The diagnostic is limited to configured staging and the approved hostname `staging.cryptopaymap.com`.

It verifies:

- the supplied revision is the exact current `main` commit;
- P6-01 through P6-06 receipts are accepted, current, unexpired, on that commit, and share one binding;
- the P6-06 final domain state is accepted with no exception;
- the staging home page, `/version.json`, and `/data/manifest.json` are externally reachable without cache reuse;
- the protected Admin dashboard remains denied to an unauthenticated request;
- the fixed-review database connection input exists for a later bounded backup;
- a distinct isolated restore database input exists and is not byte-identical to the fixed-review source input;
- a protected backup-encryption input exists;
- a bounded alert evidence issue is configured;
- a bounded backup retention value is configured.

## Safety boundary

The diagnostic:

- performs no database query, dump, mutation, backup, or restore;
- performs no DNS, Pages, R2, canonical, release, cache, or production mutation;
- does not post an alert or incident message;
- does not retain URLs containing credentials, connection strings, tokens, encryption material, raw response bodies, private records, or account identifiers;
- retains only status classes, timestamps, counts, and SHA-256 digests of bounded public responses and protected input values;
- fails closed if the source and isolated restore inputs are identical.

The pull-request and push jobs run only repository validation and self-tests. The live diagnostic is reachable only through `workflow_dispatch` with the exact confirmation `DIAGNOSE_CONFIGURED_STAGING_P6_07`.

## Result

The diagnostic receipt is written to:

`config/staging-authorization/p6-07-prerequisite-diagnostic.json`

Its state is `diagnosed`. Its decision is:

- `ready` when all predecessor, external, and protected-input checks pass;
- `configuration_blocked` when one or more required protected inputs are missing or unsafe;
- `evidence_blocked` when predecessor or external evidence is missing, stale, mismatched, or failed.

The receipt expires 24 hours after generation so later backup, restore, alert, and incident slices cannot reuse stale prerequisite evidence.

A `ready` diagnostic does not satisfy P6-07 and does not authorize backup, restore, alert, incident, staging authorization, or production work. It only authorizes the next bounded implementation slices under Issue #349.