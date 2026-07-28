# P6-08 — Final launch authorization, go-live execution, post-cutover verification, and launch-close evidence

## Status boundary

- Repository contract status: `defined`
- Configured staging launch authorization: `not authorized`
- Configured production launch authorization: `not authorized`
- Go-live execution: `not executed`
- Launch-close evidence: `not proven`

Repository audit passing means only that this evidence contract is present and internally consistent. It does not authorize or prove a configured launch.

## 1. Purpose

P6-08 is the final Phase 6 gate. It separates preparation, authorization, execution, verification, rollback, and closure so that no CI result, provider control-plane status, or operator assertion can be mistaken for completed go-live proof.

## 2. Mandatory predecessor gate

Launch remains `not authorized` unless current, non-expired configured evidence exists for P6-01 through P6-07. The authorization receipt must bind:

- exact repository commit and immutable release identity;
- canonical data snapshot/export identity and digest;
- schema and migration state;
- configured environment and provider account identifiers in redacted form;
- intended domain, DNS target, TLS hostname coverage, and canonical host;
- identity and protected Admin boundary;
- Neon transaction evidence, R2 media lifecycle evidence, public export evidence, domain cutover evidence, monitoring, alerting, backup, restore, and incident-response evidence;
- named launch owner, independent observer, rollback owner, and approval time.

Repository CI alone cannot authorize launch.

## 3. Authorization states

Allowed states are `not_authorized`, `authorized`, `revoked`, `expired`, `executing`, `verification_failed`, `rolled_back`, and `closed`.

Authorization fails closed when any bound commit, release, data snapshot, schema, migration, configuration, domain target, credential generation, dependency state, or required evidence receipt changes. A stale approval cannot be reused.

## 4. No-go conditions

No-go includes:

- any mandatory predecessor state is missing, failed, stale, expired, or unproven;
- changed head, changed data, changed configuration, or changed credentials after approval;
- unresolved high-severity incident or material security/privacy risk;
- monitoring heartbeat, alert delivery, backup integrity, restore drill, rollback path, or operator ownership is unproven;
- mixed release, split target, stale cache, partial propagation, wrong canonical host, invalid TLS, or protected Admin exposure;
- unavailable rollback owner, missing communication channel, or ambiguous execution ownership.

## 5. Bounded execution window

The go-live receipt records:

- immutable execution ID and idempotency key;
- authorized commit, release, data snapshot, environment, and domain;
- start deadline, maximum duration, and authorization expiry;
- launch owner, observer, rollback owner, communication channel, and incident owner;
- ordered steps and stop conditions;
- provider request IDs in redacted form;
- every state transition with UTC timestamps.

Duplicate or concurrent execution attempts fail closed. Only one execution may own the active lease.

## 6. Post-cutover external verification

Provider control-plane success alone is not proof. External observations must verify:

- authoritative and recursive DNS convergence;
- valid TLS chain, hostname coverage, expiry, protocol, and no plaintext downgrade;
- canonical host, redirect behavior, path/query preservation, and no loops;
- intended immutable release identity rather than HTTP status alone;
- public pages and APIs;
- media retrieval and linkage;
- `version.json`, `data/manifest.json`, `llms.txt`, `ai.txt`, robots, and sitemap;
- protected Admin boundary and expected unauthorized behavior;
- canonical data freshness, record counts, integrity, and release/data binding;
- monitoring heartbeat, synthetic checks, alert delivery, backup readiness, and rollback readiness.

Mixed old/new release responses, partial propagation, split targets, stale caches, dependency degradation, and false-success responses produce `verification_failed`.

## 7. Stop and rollback rules

Execution stops on any no-go condition, ownership conflict, verification mismatch, unexpected write, privacy exposure, monitoring blindness, alert-channel failure, data-integrity mismatch, or rollback-path uncertainty.

Rollback must bind to the last known-good serving path and release. Changing a control-plane pointer without externally observing restored service, data integrity, canonical host behavior, monitoring recovery, and alert recovery is not rollback proof.

Rollback receipts record trigger, decision owner, target release, target data compatibility, DNS/cache effects, external observations, unresolved risks, and incident linkage.

## 8. Observation window and launch close

Launch cannot close immediately after first success. A defined post-launch observation window must complete with:

- sustained external availability and intended release identity;
- stable DNS/TLS/canonical-host behavior;
- no mixed release or split target;
- acceptable data freshness and integrity;
- successful heartbeat and synthetic monitoring;
- confirmed alert routing and acknowledgement;
- current backup inventory and usable restore evidence;
- no unresolved launch-blocking incident.

The launch-close receipt records final state, observation interval, evidence index, open-risk register, deferred items, owners, deadlines, rollback status, incident links, and next operational review date.

## 9. Evidence safety

Retained receipts may include hashes, redacted provider identifiers, timestamps, bounded status summaries, release IDs, observation classes, and reviewer identities.

They must not include credentials, passwords, API tokens, webhook secrets, TLS private keys, encryption keys, unrestricted logs, private canonical payloads, personal data, or protected Admin session material.

## 10. Recheck and revocation

Authorization expires at the earliest of its explicit expiry, changed bound input, failed mandatory check, credential/configuration rotation, material incident, or execution-window end. Any material change requires a new authorization receipt.

Closed launch evidence remains historical and immutable. Later operational failures do not rewrite it; they create linked incidents and post-launch operational evidence.

## 11. Phase handoff

P6-08 closes repository definition work for Phase 6 only. Configured staging and production remain unlaunched until real authorization, execution, external verification, observation, and close receipts exist.

The next phase owns post-launch operational verification, recurring evidence freshness, incident follow-up, and production change governance.