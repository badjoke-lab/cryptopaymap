# P3-06A migration recovery procedure

**Migration:** `0013_unknown_rockslide`  
**Implementation item:** P3-06A  
**Status:** Active

## Scope

Migration `0013_unknown_rockslide` adds private duplicate-signal and duplicate-decision tables, their enums, indexes, foreign keys, and validation checks.

The migration is additive. It does not rewrite existing Candidate, source, canonical, Evidence, media, or public-export rows. This procedure supplements `DATABASE_MIGRATION_ROLLBACK.md`.

## Before application

Verify and record:

- the application commit and migration journal head;
- a tested database restore point;
- row counts for duplicate groups and source Candidates;
- whether duplicate-signal or duplicate-decision writers are enabled;
- the first application commit that enables those writers;
- the reviewed SQL, snapshot, journal, and migration-drift result.

Do not apply the migration until a recovery path is known.

## Recovery before operational use

When the migration has not reached an operational database:

- stop the deployment;
- correct or regenerate the unpublished migration;
- review SQL, snapshot, and journal together;
- rerun migration drift, runtime schemas, tests, and build;
- keep partial generated files out of `main`.

## Recovery after successful application

When the schema was applied successfully but the application must return to the previous release:

- pause duplicate-signal import writes and duplicate-decision writes;
- deploy the previous compatible application;
- retain the additive schema and any committed audit rows;
- use a new reviewed migration for later schema corrections.

The public site can continue serving the last validated artifact set because duplicate-review data remains private and publication is a separate workflow.

## Recovery from unsafe behavior

When unexpected constraints, write failures, or materially incorrect decisions occur:

1. pause Candidate import and duplicate-decision mutations;
2. keep canonical promotion and publication disabled;
3. record affected decision IDs, request IDs, group IDs, counts, and PostgreSQL error codes without copying private payloads or notes;
4. restore the tested pre-migration database state when no valid later writes must be retained, or apply a reviewed forward correction when valid audit rows must remain;
5. rerun group-membership, Candidate-status, idempotency, foreign-key, migration-history, runtime, and artifact checks;
6. resume writes only after review.

## Audit preservation

Committed duplicate decisions are audit records. Recovery planning must explicitly account for their retention.

The preferred operational path is application rollback with paused writers, followed by a reviewed forward correction. Any schema-removal procedure requires a separate reviewed plan, a tested restore point, confirmation that no dependent writer is active, and post-recovery integrity checks.

## Completion evidence

P3-06A is migration-complete only when:

- generated SQL, snapshot, and journal are committed together;
- migration drift is zero;
- schema and runtime checks pass;
- duplicate-signal persistence tests pass;
- duplicate-decision conflict, replay, and rollback tests pass;
- static build and artifact checks pass;
- temporary generation workflows are absent from the final branch.
