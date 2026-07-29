# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-07-29

This file tracks the current repository implementation and operational handoff. GitHub `main`, merged pull requests, actual CI results, protected configured-environment receipts, and external observations are authoritative when this file differs from reality.

Detailed historical slices remain available in merged pull requests and Git history. This document intentionally keeps the current plan concise after the P6-08 tracking reconciliation.

## Rules

- Implementation item IDs are independent of pull request numbers.
- Candidate, canonical, Submission, and public-export layers remain separate.
- Public intake never mutates canonical or public data directly.
- Each pull request has one primary responsibility and explicit completion checks.
- Configured-environment work may be marked complete only with retained redacted receipts from the intended environment.
- Repository CI cannot authorize or prove configured staging or production launch execution.
- Public product Roadmap and repository implementation status are separate documents.
- Private evidence, credentials, personal data, protected Admin material, and private canonical payloads must not enter the public repository.

## Current item

```text
OPS-P6-001 — Configured launch authorization, bounded go-live execution,
external verification, observation, and launch close
GitHub Issue: #293
```

Current configured state:

```text
Configured staging authorization: not authorized
Configured production authorization: not authorized
Go-live execution: not executed
Post-cutover verification: not proven
Launch-close evidence: not proven
```

## Phase 0 — Public specifications and development control

**Status:** Completed

P0-01 through P0-08 established repository control, product scope, information architecture, data architecture, verification/source/license rules, Submission and Media policy, technical/security/privacy architecture, operations, migration, launch criteria, and public Roadmap boundaries.

Completed through #1–#9.

## Phase 1 — Foundation

**Status:** Repository-complete

P1-01 through P1-12 established the application foundation, responsive shell, design and motion systems, state boundaries, runtime schema and migration foundation, CI/test foundation, Cloudflare staging contract, PWA/accessibility baselines, content loaders, and integration audit.

Completed through #11–#23.

## Phase 2 — Data core

**Status:** Completed

P2-01 through P2-14 established registries, Entity/Location/Acceptance Claim data, Claim payment combinations, Evidence, Verification Events, Candidate/provenance/duplicate boundaries, Media metadata, legacy identifiers, public export schemas, leakage validation, private importers, and the Phase 2 integration audit.

Completed through #24–#40.

Imported records remain private until reviewed. Candidate data is not public truth and does not automatically create Confirmed Claims.

## Phase 3 — Administration and review

**Status:** Repository-complete

P3-01 through P3-12 and later P4-18 reconciliation established protected Admin access, dashboard and review queues, Candidate identity resolution and Promotion, Evidence review, verification transitions, Reconfirmation, Media review, export/release controls, restore boundaries, Audit history, and configured-work classifications.

Completed through #41–#95 and reconciled through #147.

## Phase 4 — Public core / MVP-A

**Status:** Completed for Phase 5 handoff

P4-01 through P4-18 established public Place and Online Service discovery, MapLibre and list synchronization, filters, URL/back restoration, mobile bottom sheet, Home, Stats, Updates, Roadmap, Changelog, trust/legal pages, public Media, practical-profile paths, administration reconciliation, and the live-review handoff audit.

Completed through #96–#148.

## Phase 5 — Public submissions / MVP-B

**Status:** Repository-complete

P5-01 through P5-08 established and audited:

- shared private Submission intake, privacy, replay, conflict, abuse-control, and follow-up status boundaries;
- Suggest Place and Online Service intake and review;
- Payment Report and Problem Report intake, Evidence, recheck, correction, and visibility decisions;
- Business and Service Claim intake and ownership-verification boundaries;
- Photo and Media Submission intake and private quarantine boundaries;
- protected review, information request, time-bounded hold, partial approval, duplicate/no-change, and final-decision workflows;
- guarded canonical application transactions and field provenance;
- private retention execution;
- five-family end-to-end integration audits covering intake, status, review, decision, canonical application, publication handoff, privacy, replay, conflict, partial failure, and retention.

Repository completion milestones:

| Item | Completion |
|---|---|
| P5-01 | #150–#155 |
| P5-02 | #156–#192 |
| P5-03 through P5-06 | completed before P5-07 integration closure |
| P5-07 | completed through #243–#263 |
| P5-08A through P5-08F | #265, #267, #269, #271, #273, #275 |

Phase 5 closed in #275. Configured launch execution was not claimed.

## Phase 6 — Launch and cutover evidence

**Status:** Repository definition complete; configured execution active

| ID | Item | Status | Pull request |
|---|---|---|---|
| P6-01 | Launch evidence register and data QA baseline | Completed | #277 |
| P6-02 | Configured identity access and protected Admin evidence | Completed | #279 |
| P6-03 | Live Neon canonical transaction and receipt evidence | Completed | #281 |
| P6-04 | Configured R2 Media lifecycle evidence | Completed | #283 |
| P6-05 | Configured public export and release evidence | Completed | #285 |
| P6-06 | Configured domain cutover and rollback evidence | Completed | #287 |
| P6-07 | Configured monitoring, alerting, backup, restore, and incident evidence | Completed | #289 |
| P6-08 | Final launch authorization, go-live, verification, rollback, observation, and close contract | Completed | #291 |
| OPS-P6-001 | Execute configured staging and production launch evidence | Active | Issue #293 |

P6-08 merged at `46b89747797e06d62e94f8d974fd1ab0d72dfaff`. The associated repository workflows passed. That result proves the evidence contract is present; it does not prove configured staging or production authorization, execution, verification, or launch close.

### OPS-P6-001 sequence

1. Reconcile current configured P6-01 through P6-07 receipts against the intended commit, immutable release, canonical data snapshot, schema, migrations, environment, domain, and credential generation.
2. Fail closed on missing, stale, expired, changed, or unproven evidence.
3. Authorize and verify configured staging first.
4. Retain redacted staging receipts for identity/Admin, Neon, R2, publication, DNS/TLS, monitoring, alerts, backup, restore, and rollback readiness.
5. Issue a separate bounded production authorization only after staging evidence is accepted.
6. Execute production cutover with named launch owner, independent observer, rollback owner, communication channel, stop conditions, and one execution lease.
7. Verify externally observed DNS, TLS, canonical host, redirects, release identity, public pages/APIs/media, machine-readable exports, Admin protection, data freshness/integrity, monitoring, alerts, backups, and rollback readiness.
8. Complete the observation window and retain immutable launch-close evidence.

## Phase 7 — Stabilization

**Status:** Planned; not started

Phase 7 begins only after OPS-P6-001 has proven configured production launch close.

It will verify production errors, redirects, indexing, Submissions, exports, mobile behavior, evidence freshness, incident follow-up, migration completeness, production change governance, and the conditions for retiring the legacy implementation.

## Retained launch boundary

The following cannot be waived or converted into documentation-only completion:

- configured Cloudflare Access and protected Admin verification;
- exact deployed Functions and environment allowlists;
- live Neon schema/migration and representative canonical transaction receipts;
- configured R2 private/public Media lifecycle and conditional-write behavior;
- deterministic public export, immutable release, activation, cache propagation, and rollback evidence;
- authoritative and recursive DNS, TLS, canonical-host, and redirect observations;
- monitoring heartbeat, synthetic checks, alert delivery and acknowledgement;
- backup inventory, integrity, isolated restore, measured recovery, and incident-response evidence;
- external post-cutover verification and the complete observation window.

The governing contracts are:

- `docs/P6_08_FINAL_LAUNCH_AUTHORIZATION_GO_LIVE_CLOSE_EVIDENCE.md`;
- `docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md`;
- `docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md`;
- `docs/P6_05_CONFIGURED_PUBLIC_EXPORT_RELEASE_EVIDENCE.md`;
- `docs/P6_04_CONFIGURED_R2_MEDIA_LIFECYCLE_EVIDENCE.md`;
- `docs/P6_03_LIVE_NEON_TRANSACTION_RECEIPT_EVIDENCE.md`;
- `docs/P6_02_CONFIGURED_IDENTITY_ADMIN_EVIDENCE.md`;
- `docs/P6_01_LAUNCH_EVIDENCE_REGISTER_DATA_QA_BASELINE.md`.
