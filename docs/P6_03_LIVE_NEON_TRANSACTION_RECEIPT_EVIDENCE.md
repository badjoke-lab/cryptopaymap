# P6-03 — Live Neon transaction and application receipt evidence

## Decision

A repository-complete canonical application path is not configured-environment proof. P6-03 is a launch-blocking evidence gate for real Neon execution, atomicity, receipt integrity, rollback, replay, conflict handling, and publication-state separation.

Configured staging evidence: `unproven`.

Configured production evidence: `unproven`.

Neither environment may be marked `passed` without executed procedures and retained redacted artifacts.

## Representative execution scope

The configured run must cover at least one representative application from each materially different mutation class:

- create a new canonical entity or location;
- correct an existing canonical field;
- replace a complete set-valued relationship such as accepted assets or payment methods;
- apply a Business Claim-controlled payment change;
- bind an approved Photos submission to Media without publishing an original object.

Where production mutation is not separately authorized, production evidence must use a bounded reversible fixture, isolated production evidence record, or approved read-only verification of an already executed transaction. It must never silently alter public data.

## Required transaction chain

A successful application proves that the following are bound to the same application execution identity and expected source revision:

1. final review decision and source submission identity;
2. exact canonical pre-state digest;
3. canonical mutation rows;
4. application receipt;
5. audit event or events;
6. resulting canonical state digest;
7. publication-handoff state remaining pending or otherwise explicitly non-public;
8. transaction commit identity and execution timestamp.

Canonical mutation, application receipt, and required audit events must commit atomically where the domain contract requires them to describe one application.

## Positive execution

The retained receipt must prove:

- the expected Neon project, branch, database, and schema revision using safe identifiers or digests;
- the deployed source revision and migration revision;
- the expected preconditions and canonical pre-state digest;
- one authorized application execution;
- exact row-count deltas by affected table class;
- one durable application receipt;
- the required audit event classes;
- the resulting canonical state digest;
- no duplicate effects;
- no export, release, activation, or public-visibility transition caused by canonical commit alone.

## Injected-failure rollback

A controlled failure must be injected after at least one canonical write has begun but before transaction completion.

The failed run passes only when post-failure evidence proves:

- canonical state equals the pre-state digest;
- no partial application receipt exists;
- no success audit event exists;
- no partial relationship replacement exists;
- no publication state changed;
- the failure is represented by a safe operational receipt outside the rolled-back domain transaction where required;
- retry remains possible under the documented idempotency and conflict rules.

## Replay and conflict cases

The configured journey matrix includes:

| Case | Required result |
| --- | --- |
| Replay of the same completed application | deterministic prior result or explicit no-op; no duplicate rows, receipts, or audit effects |
| Concurrent duplicate execution | at most one commit; competing execution fails or resolves idempotently |
| Changed source content | fail closed and require a new decision or application identity |
| Stale canonical pre-state | conflict; no partial mutation |
| Missing prerequisite | fail closed before canonical commit |
| Already-public target state | does not bypass application, export, release, or activation controls |

## Publication separation

A committed canonical transaction is not proof of publication.

The evidence must preserve distinct receipts or states for:

1. canonical application;
2. public projection or export generation;
3. export validation;
4. release creation;
5. release activation;
6. externally observable public visibility.

P6-03 must not set any later state to passed merely because the canonical transaction committed.

## Evidence receipt metadata

Each environment receipt records:

- evidence id;
- environment;
- Neon project and branch safe identifier or digest;
- database and schema safe identifier or digest;
- source revision;
- migration revision;
- application type and execution identity;
- source decision identity;
- canonical pre-state and post-state digests;
- affected table classes and row-count deltas;
- application receipt digest;
- audit-event digest;
- transaction commit timestamp;
- positive, rollback, replay, duplicate, stale-state, and changed-content results;
- redacted artifact location and artifact digest;
- exceptions;
- operator;
- expiry or recheck date.

No connection string, password, token, private submission payload, raw contact value, private evidence, or unrestricted database dump may appear in retained artifacts.

## Pass rule

An environment may be marked `passed` only when:

- all required positive paths commit with complete receipt chains;
- the injected-failure path proves complete rollback;
- replay and concurrent duplicate execution create no duplicate effects;
- stale-state, changed-content, and missing-prerequisite cases fail closed;
- canonical commit remains separate from publication;
- retained artifacts are present and digest-verified;
- the evidence has not expired;
- no high-severity exception remains open.

Repository audit passing means only that this evidence contract is present and internally consistent.

## Recheck rule

Repeat configured evidence after changes to:

- Neon project, branch, database, role, or connection architecture;
- migrations affecting canonical, receipt, audit, decision, or publication tables;
- transaction boundaries;
- application registration or lifecycle code;
- idempotency, replay, conflict, or locking behavior;
- publication-handoff state transitions.

Otherwise recheck before launch and at least every 90 days while operational.

## Boundary

This slice does not prove R2 media lifecycle, export generation, release activation, domain cutover, retention deletion, backup restore, rollback drill, monitoring, or launch readiness.

## Next owner

P6-04 owns configured R2 media upload, quarantine, derivative, publication, takedown, and deletion evidence.