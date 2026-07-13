# P5-02R fixed-review database recovery

**Status:** Completed  
**Last updated:** 2026-07-13

## Confirmed evidence

The configured fixed-review deployment is healthy for credentials, derived configuration, the rate-limit Durable Object, Pages secrets, Pages deployment, readiness, and CSP.

The bounded P5-02R audit then confirmed:

- the exact official Turnstile dummy token validates successfully;
- the bounded fixed-review Turnstile exception reaches the public Suggest route;
- the first Suggest POST returns HTTP 503;
- `/data/manifest.json` and `/version.json` remain unchanged.

A read-only database diagnostic identified the cause:

- `drizzle.__cpm_migrations` does not exist;
- migration `0023_solid_scourge` is not recorded;
- the existing `submissions` table is not the P5-02 Submission table;
- it has only `id` and `updated_at` among the required P5-02 columns;
- all four enums introduced by migration 0023 are absent;
- `submission_public_reference_counters`, `submission_payloads`, `submission_contacts`, and `submission_events` are absent.

The live audit remains stopped before private intake. P5-03 remains blocked.

## Why the existing database is not repaired in place

The current database has no repository migration ledger and contains an unrelated legacy table named `submissions`. Running all migrations against it would collide with existing unmanaged objects. Applying only part of migration 0023 would leave the review database outside the repository migration contract.

The recovery path therefore does not rename, drop, truncate, or alter the legacy database.

## Safe recovery path

1. Create a new empty PostgreSQL database dedicated to the fixed-review environment.
2. Replace the repository secret `DATABASE_URL` with that database connection string.
3. Run the guarded `Initialize fixed review database` workflow.
4. Enter the exact confirmation text:

```text
INITIALIZE_FIXED_REVIEW_DATABASE
```

The workflow refuses any database that already contains a public base table or a Drizzle migration table. On an empty database only, it:

1. applies all repository migrations through `0023_solid_scourge`;
2. verifies the five P5-02 Submission tables, expected columns, enums, and migration ledger;
3. triggers the configured staging-review deployment;
4. allows the existing one-shot P5-02R audit to verify HTTP 202, exact replay, HTTP 409 conflict, public artifact stability, and bounded privacy-safe evidence.

## Prohibited shortcuts

Do not:

- run migration 0023 directly against the legacy database;
- rename or drop the legacy `submissions` table without a separate data-ownership decision;
- fabricate migration-ledger rows;
- weaken Turnstile, rate-limit, privacy, or publication boundaries;
- treat database connectivity readiness as proof that the private Submission schema exists.

## Completion outcome

A new empty fixed-review database was created and selected through the repository `DATABASE_URL` secret. The guarded initializer accepted the empty database, applied the full migration history, verified the P5-02 Submission schema and migration ledger, redeployed the fixed-review environment, and completed the bounded live audit.

The legacy unmanaged database was not modified. The completion receipt for main commit `699cff048fa80113d3b05bcdf4f385c229a4d41d` records HTTP 202 first acceptance, identical HTTP 202 replay, HTTP 409 changed-content conflict, and unchanged public artifacts.
