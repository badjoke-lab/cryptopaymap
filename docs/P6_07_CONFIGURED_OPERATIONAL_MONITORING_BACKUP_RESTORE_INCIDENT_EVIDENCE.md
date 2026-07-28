# P6-07 — Configured operational monitoring, backup, restore, and incident evidence

## Decision

Repository configuration is not proof of operational readiness. P6-07 is a launch-blocking evidence gate for monitoring, alert delivery, backup integrity, restore execution, recovery objectives, and incident response.

Configured staging evidence: `unproven`.

Configured production evidence: `unproven`.

Neither environment may be marked `passed` without executed procedures and retained redacted artifacts.

## Monitoring coverage

Configured monitoring must observe:

- public availability and latency;
- intended active-release identity, not HTTP status alone;
- canonical data freshness and publication freshness;
- database connectivity, transaction failures, capacity, and migration compatibility;
- queue, scheduled job, and background-task completion;
- R2 media availability and publication linkage;
- custom-domain, DNS, TLS, redirect, and cache behavior;
- protected Admin denial or Access challenge;
- machine-readable files and public APIs;
- error-rate, integrity, and dependency signals.

Synthetic checks must fail when a stale or wrong release returns HTTP 200.

## Monitoring-system health

Monitoring cannot silently fail. The configured run proves:

- heartbeat emission;
- dead-man or missed-check detection;
- stale-metric detection;
- collector and alert-pipeline health;
- clock and timestamp sanity;
- evidence that a disabled check is visible and authorized.

Absence of alerts is not proof of health unless heartbeat and check execution are also proven.

## Alert evidence

Alert tests record:

- rule identity and revision;
- severity and trigger condition;
- first detection time;
- routed destination class;
- deduplication and grouping result;
- acknowledgement time and owner;
- escalation deadline and result;
- recovery notification;
- suppression or maintenance-window authorization;
- safe delivery receipt digest.

A provider control-plane status alone is not alert-delivery proof. At least one configured channel must receive and acknowledge the test alert.

## Backup evidence

Backup evidence binds:

- protected stores and excluded transient stores;
- source revision and schema revision;
- backup start, completion, size, object count, and digest;
- encryption state and safe key reference;
- retention, immutability, and deletion schedule;
- canonical database, provenance, review receipts, release metadata, media linkage, and operational configuration scope;
- backup inventory reconciliation;
- integrity verification after creation.

A successful scheduled job without a verified backup artifact is not backup proof.

## Restore evidence

Restore drills execute against an isolated target and prove:

1. the selected backup exists and passes integrity checks;
2. the restore target cannot overwrite production;
3. schema and migration compatibility are validated;
4. canonical records, relationships, provenance, and review receipts are restored;
5. publication and media references remain valid or are explicitly reconciled;
6. protected data remains protected;
7. representative reads and invariants pass;
8. measured RPO and RTO meet the documented objectives;
9. rollback or disposal of the isolated target completes safely.

A dump that has never been restored is not recovery proof.

## Failure matrix

| Case | Required result |
| --- | --- |
| Monitoring provider outage | independent heartbeat or explicit monitoring blind-state alert |
| Alert channel outage | alternate route or unresolved readiness failure |
| Stale metric or false success | detect and fail closed |
| Wrong active release with HTTP 200 | synthetic failure |
| Split-brain health results | incident or bounded investigation; no pass |
| Incomplete or corrupted backup | reject before restore |
| Missing encryption key | explicit failure; no bypass |
| Partial restore | fail and isolate target |
| Backup older than RPO | readiness failure |
| Restore exceeds RTO | readiness failure or approved exception |
| Duplicate incident declaration | idempotent existing incident or explicit merge |
| Concurrent incident commanders | one command owner; later claimant stops |

## Incident response evidence

A configured exercise proves:

- incident declaration criteria and severity;
- immutable incident identity;
- command owner and delegated roles;
- detection, acknowledgement, containment, mitigation, rollback or restore decision, recovery, and closure timestamps;
- evidence preservation and redaction;
- internal and public communication decision points;
- status update cadence;
- dependency and provider escalation;
- post-incident actions, owners, and due dates;
- closure only after service and data integrity are externally reverified.

## Evidence receipt metadata

Each environment receipt records:

- evidence id and environment;
- source revision and evidence-plan revision;
- monitor inventory digest and rule revisions;
- heartbeat, synthetic, alert-delivery, acknowledgement, escalation, and recovery receipts;
- backup identity, scope digest, artifact digest, retention, immutability, and integrity result;
- restore target identity, backup identity, invariant results, measured RPO, measured RTO, and disposal result;
- incident-exercise identity, timeline digest, command ownership, decisions, communications, and follow-up digest;
- execution timestamps, operator, exceptions, artifact location, artifact digest, and recheck date.

No API token, notification webhook, database credential, encryption key, session cookie, private canonical payload, personal data, or unrestricted logs may appear.

## Pass rule

An environment may be marked `passed` only when:

- monitoring covers the required public, protected, data, release, dependency, and freshness boundaries;
- heartbeat and monitoring-pipeline failure detection are proven;
- representative alert delivery, acknowledgement, escalation, deduplication, and recovery notifications execute;
- backups are complete, encrypted, retained, immutable where required, inventory-reconciled, and integrity-verified;
- an isolated restore drill passes schema, referential, provenance, privacy, release, and media checks;
- measured RPO and RTO satisfy the documented objectives;
- monitoring, alert, backup, restore, provider, corruption, stale-signal, duplicate, and concurrency failures satisfy the fail-closed contract;
- an incident-response exercise retains a complete safe timeline and follow-up record;
- artifacts are present, redacted, digest-verified, and unexpired;
- no high-severity exception remains open.

Repository audit passing means only that this evidence contract is present and internally consistent.

## Recheck rule

Repeat configured evidence after changes to monitoring providers, checks, thresholds, alert routes, escalation policy, data stores, schemas, backup scope, encryption, retention, restore tooling, RPO, RTO, incident roles, domain routing, release activation, or protected Admin boundaries.

Otherwise recheck before launch, restore at least quarterly, alert delivery at least every 30 days, and backup integrity continuously or on every backup cycle.

## Boundary

This slice does not grant launch authorization, prove production capacity under sustained load, approve legal or policy readiness, or replace the final go-live decision.

## Next owner

P6-08 owns final launch authorization, go-live execution, post-cutover verification, and launch-close evidence.
