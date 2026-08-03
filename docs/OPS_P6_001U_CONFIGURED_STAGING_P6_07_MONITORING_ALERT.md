# OPS-P6-001U — Configured staging P6-07 monitoring and alert evidence

## Purpose

This slice executes Q2 of Issue #349 after the configured-staging P6-07 prerequisite diagnostic. It proves that monitoring observes service identity and freshness rather than HTTP availability alone, that the monitoring path cannot fail silently, and that a bounded alert channel can deliver, deduplicate, acknowledge, escalate, and recover test alerts.

Operational issue: #357.

## Preconditions

Execution requires:

- exact current `main`;
- current accepted P6-01 through P6-06 receipts on one shared binding;
- a current P6-07 prerequisite diagnostic on the same commit and binding;
- successful home, version, manifest, and protected Admin-denial observations in that diagnostic;
- Issue #349 configured as the bounded alert evidence channel;
- exact confirmation `EXECUTE_CONFIGURED_STAGING_P6_07_Q2`;
- a bounded monitoring owner identity;
- successful repository contract validation.

The prerequisite diagnostic may be `ready` or `configuration_blocked` only when its blockers are limited to the independent Q3/Q4 requirements `backup_encryption:missing` and `isolated_restore_database:missing`. Monitoring and alert evidence does not bypass those blockers.

## Live monitoring coverage

The configured run observes:

- public home availability and latency;
- `/version.json` and `/data/manifest.json` availability;
- public Media availability;
- protected Admin denial;
- active `/p6-05-release.json` identity;
- public DNS resolution;
- trusted TLS, hostname coverage, certificate expiry, and protocol;
- HTTP-to-HTTPS redirect behavior;
- heartbeat timestamp sanity.

The live service is not intentionally degraded.

## Synthetic failure cases

Evaluator-controlled inputs prove:

- HTTP 200 with the wrong active release fails;
- a stale metric fails;
- a missing or overdue heartbeat triggers dead-man detection;
- an unauthorized disabled collector creates an explicit monitoring blind state;
- a failed alert-channel delivery cannot produce an accepted receipt.

Synthetic fault inputs are never sent to the live service and do not mutate release, DNS, data, Media, or protected Admin state.

## Alert evidence channel

Issue #349 is the bounded configured-staging test channel.

The run writes only safe test-evidence comments:

1. a wrong-release test alert;
2. duplicate delivery of the same immutable alert identity, which must converge without a second alert comment;
3. acknowledgement and recovery comments;
4. a monitoring blind-state alert;
5. an intentionally missed short test deadline followed by an escalation comment;
6. acknowledgement and recovery after escalation.

Each comment includes an HTML marker with a digest-based immutable test identity. Before writing, the executor reads existing comments and reuses an exact marker when present. Comment IDs and URLs are retained only as SHA-256 digests.

## Safety boundary

The run:

- performs no production authorization or production mutation;
- performs no DNS, Pages custom-domain, certificate, registrar, cache, database, R2, canonical, release-activation, backup, or restore mutation;
- does not intentionally interrupt configured staging;
- writes only bounded test-alert, acknowledgement, escalation, and recovery comments to Issue #349;
- retains no API token, webhook, database credential, encryption key, private canonical payload, personal data, raw provider identifier, raw comment ID, or unrestricted log;
- fails closed when exact-main, predecessor, binding, active-release, external monitoring, or alert-delivery evidence is missing or inconsistent.

## Receipt

Successful execution publishes:

`config/staging-authorization/p6-07-monitoring-alert-receipt.json`

The receipt records:

- exact source commit and shared binding;
- prerequisite diagnostic digest and permitted blocker classes;
- heartbeat and timestamp-sanity result;
- live public, protected, release, DNS, TLS, redirect, and Media observations;
- wrong-release, stale-signal, dead-man, and blind-state detection results;
- alert rule revision and immutable alert identities;
- delivery, duplicate convergence, acknowledgement, escalation, and recovery timestamps;
- routed destination class and safe comment-reference digests;
- bounded owner digest, workflow run, expiry, and exceptions.

The receipt expires after 30 days. It is `accepted` only when every required live check, evaluator failure case, channel delivery, acknowledgement, escalation, deduplication, and recovery result passes with no exception.

## Boundary

An accepted Q2 receipt proves only configured-staging monitoring and alert behavior. It does not prove encrypted backup integrity, isolated restore, RPO/RTO, incident response, full P6-07 completion, staging launch authorization, production authorization, or production cutover. Q3 and Q4 remain blocked until a distinct isolated restore target and retained backup-encryption key are configured.