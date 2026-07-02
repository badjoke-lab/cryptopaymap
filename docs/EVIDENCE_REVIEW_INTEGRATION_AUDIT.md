# Evidence review integration audit

**Implementation item:** P3-08D  
**Scope:** Repository integration and handoff audit for P3-08  
**Status:** In progress

## Audited review flow

P3-08 provides one protected Evidence review flow:

1. load a bounded Evidence queue;
2. open one Evidence record with its exact Claim version;
3. load the complete accepted Evidence set and threshold projection;
4. submit one explicit Evidence disposition and optional Claim action;
5. recheck Evidence, Claim, and accepted-set state inside one atomic transaction;
6. persist the Evidence result, optional Claim transition, verification event, Evidence relationship, and replay receipt together.

## Authorization boundary

Evidence review uses the isolated `evidence:review` capability and the separate `CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS` allowlist. Candidate read, duplicate review, and Candidate promotion permissions do not grant Evidence review access.

GET and POST endpoints require a verified protected administration identity. Mutations also require a UUID idempotency key.

## Read boundary

The queue exposes bounded operational summaries only. The detail workspace exposes the reviewed Evidence, exact Claim version, complete accepted Evidence set, and threshold result required for a decision.

Candidate data, unrelated private records, database errors, authorization configuration, and secrets are not serialized into protected HTML artifacts.

## Decision boundary

A decision separates:

- Evidence disposition: accepted, rejected, or held;
- review finding: supports Claim, contradicts Claim, or insufficient;
- explicit Claim action: no change, confirm, mark stale, end, or reject.

Held and rejected Evidence cannot change Claim state. Confirmation requires the existing Evidence threshold and canonical payment requirements. Negative Claim actions require accepted contradicting Evidence.

Claim visibility is an expected guard and result field, not a mutable review input. Evidence review cannot publish or unhide a Claim.

## Version and set guards

Every mutation fixes:

- Evidence ID, version, and pending review status;
- Claim ID, version, status, and visibility;
- exact accepted Evidence ID set;
- reviewer identity, decision time, and normalized request content.

A changed row or accepted Evidence set produces a conflict instead of a partial decision.

## Durable atomicity

The durable backend projects the requested result through the P3-08A decision engine, then commits transaction guards, Evidence update, optional Claim update, verification event, Evidence relationship, and `evidence_review_decisions` receipt in one Neon batch.

An identical request replays the durable receipt. Reusing the request ID with different content is a conflict. Constraint or guard failure rolls back the complete operation.

## Machine validation

The repository validates P3-08 through:

- authorization tests;
- decision-contract and state-transition tests;
- rollback and replay tests;
- durable schema and persistence tests;
- queue and detail workspace tests;
- protected GET and POST API tests;
- reviewer component payload tests;
- cross-layer queue-to-decision integration tests;
- runtime checks;
- migration drift, build, accessibility, and staging-artifact checks.

## Repository completion boundary

P3-08 is repository-complete when this audit passes CI and is merged. The following remain deferred and must not be represented as completed:

- live Cloudflare Access verification;
- live database transaction verification;
- production deployment verification;
- recurring reconfirmation and due-date queues, which belong to P3-09.
