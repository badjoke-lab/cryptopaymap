# Phase 5 public submissions implementation sequence

**Phase:** Phase 5 — Public submissions / MVP-B  
**Status:** Active — P5-02 Suggest work in progress  
**Last updated:** 2026-07-10

## Purpose

`docs/SUBMISSION_WORKFLOW.md` defines submission behavior, privacy boundaries, workflow states, review outcomes, and publication rules.

This document defines repository implementation order. It does not replace or narrow the submission workflow contract.

Phase 5 began after the P4-18E handoff gate in `docs/PHASE4_CLOSURE_PLAN.md` completed.

## Non-negotiable boundaries

Throughout Phase 5:

- submissions remain separate from canonical records;
- no public form writes directly to canonical Entity, Location, Claim, Evidence, or Media public state;
- automated checks may reject malformed or abusive intake but do not approve factual claims;
- accepted field changes use explicit reviewed canonical application operations;
- ownership verification does not bypass payment-acceptance verification;
- private contact, transaction evidence, ownership proof, and non-public Media remain outside public projections;
- publication remains a separate validated export and release operation.

## Execution order

```text
P5-01 Shared submission foundation
    ↓
P5-02 Suggest Place and Online Service
    ↓
P5-03 Payment and problem reports
    ↓
P5-04 Business and service claims
    ↓
P5-05 Photo and Media submission intake
    ↓
P5-06 Review workflow extensions
    ↓
P5-07 Canonical application transactions and retention
    ↓
P5-08 MVP-B integration audit
```

P5-03 through P5-05 share P5-01 but may only overlap when their data, privacy, and reviewer boundaries remain independent and reviewable. P5-06 and P5-07 depend on the real intake shapes delivered before them.

## Current position

```text
P5-01A  Completed through #150
P5-01B  Completed through #151
P5-01C  Completed through #152
P5-01D  Completed through #153
P5-01E  Completed through #154
P5-01F  Completed through #155
P5-01   Completed
P5-02A  In progress — Suggest contract and normalization
```

P5-01F closed the private follow-up status-read requirement after the post-#154 sequence audit. P5-01 is now repository-complete and P5-02 may proceed.

---

## P5-01 — Shared submission foundation

### Goal

Create the common private intake and follow-up foundation used by all public Submission types.

### Scope

- common Submission envelope;
- Submission type and workflow status;
- opaque public reference;
- one-time private follow-up secret issuance and stored verification representation;
- safe original-payload preservation and normalized review projection separation;
- optional contact boundary and protected storage;
- relationship disclosure field;
- common evidence-link intake boundary;
- request-size, content-type, URL, and text safety validation;
- abuse and rate-control adapter boundary;
- request replay and duplicate-request behavior;
- Audit event foundation;
- private Submission status read contract;
- public status labels that do not expose internal review information.

### Completion result

P5-01 completed through #150–#155.

A synthetic Submission can be received, assigned a public reference, replayed deterministically, protected by abuse-control boundaries, persisted privately, represented in metadata-only Audit history, and retrieved through its private follow-up boundary while remaining isolated from canonical/public data.

Configured-environment provider wiring remains required when the first public Suggest route is exposed.

---

## P5-02 — Suggest Place and Online Service

### Goal

Accept new Place or Online Service suggestions into protected review without direct canonical mutation.

### Scope

- physical Place and Online Service suggestion forms;
- target-type-specific validation;
- business identity and official URL fields;
- Place address and coordinate input;
- optional practical profile proposals such as phone, hours, official social links, amenities, and description;
- category and payment proposal fields;
- observation date;
- evidence link or allowed evidence attachment reference;
- relationship disclosure;
- normalization to review-safe proposal fields;
- duplicate Candidate or existing-target signals;
- reviewer entry path;
- accepted-as-Candidate outcome.

### Current bounded slice

P5-02A defines the type-specific Suggest contract and review-safe normalization boundary.

P5-02A must:

- support `physical_place` and `online_service` kinds;
- compose the P5-01 common envelope;
- keep new-record Suggest separate from existing-record correction workflows;
- accept reviewable incomplete Place/payment material without inventing canonical facts;
- preserve unknown Asset/Network/Route/Method values explicitly;
- never infer Network from Asset;
- normalize identity, Place, practical profile, category, payment, observation, relationship, and Evidence-link proposals for protected review;
- add no public route, Candidate mutation, canonical mutation, Evidence acceptance, export, or publication.

### Operational dependency

P4-18B must already provide safe operator handling and correction behavior for practical profile fields. Suggestion intake must not introduce field classes that the protected review and canonical application paths cannot safely process.

### Completion gate

A suggestion can move from public intake to protected review and resolve without directly changing a public record. A useful but insufficient suggestion may become a private Candidate.

P5-02 is not complete when P5-02A alone finishes. Later bounded slices must add private Suggest intake integration, duplicate Candidate/existing-target signals, protected reviewer entry, public route/form wiring with real environment-backed providers, and an integration audit.

---

## P5-03 — Payment and problem reports

### Goal

Accept target-aware reports about payment success, failure, and incorrect or problematic public information.

### Scope

- preselected Place or Online Service targets;
- positive and negative payment outcomes;
- asset, network, route, method, and observed payment steps;
- optional public evidence links;
- restricted transaction or receipt evidence boundary;
- factual correction proposals;
- practical profile correction proposals for address, phone, website, hours, amenities, social links, and description where relevant;
- privacy, rights, duplicate, closure, and other problem categories;
- priority recheck signal generation;
- negative Evidence review entry;
- no automatic Claim status change.

### Completion gate

Reports become review material, may add Evidence or recheck priority after explicit review, and cannot directly confirm, stale, end, hide, or publish a canonical Claim.

---

## P5-04 — Business and service claims

### Goal

Accept representative claims and verify ownership or authority separately from payment verification.

### Scope

- claimant role and target scope;
- official contact method boundary;
- proposed practical profile and payment corrections;
- ownership-verification method state;
- official-domain, website, DNS, official-social, and approved assisted verification adapter boundaries where implemented;
- protected ownership proof handling;
- ownership relationship status and scope;
- expiration and revocation boundaries;
- handoff of proposed changes to normal field and Claim review.

### Completion gate

A verified representative relationship can be recorded without granting uncontrolled editing rights or bypassing Evidence, canonical application, and publication review.

---

## P5-05 — Photo and Media submission intake

### Goal

Accept public-gallery Media proposals safely and connect them to the existing protected Media review system.

### Scope

- target binding;
- image role;
- capture date and description;
- rights and authorization basis;
- public-display permission;
- privacy and rights acknowledgements;
- bounded upload authorization;
- quarantine object path;
- MIME, size, dimension, and file-integrity validation;
- duplicate file hash behavior;
- derivative processing boundary;
- Media asset creation in non-public state;
- handoff to the existing Media review queue;
- cleanup and retention of rejected or abandoned private uploads.

### Completion gate

A submitted image remains non-public until the existing Media decision and controlled publication boundaries approve it.

---

## P5-06 — Review workflow extensions

### Goal

Support the review states and partial decisions required by real public submissions.

### Scope

- Submission review queue and detail workspace;
- field-level proposed-versus-current diff;
- information request;
- submitter follow-up response;
- time-bounded hold with reason and next review date;
- partial approval;
- duplicate and no-change outcomes;
- accepted-as-Candidate outcome;
- withdrawal behavior;
- status history;
- private reviewer notes separated from public status text;
- bounded public-facing resolution summaries.

### Completion gate

A multi-field Submission can resolve fields independently, request more information, pause safely, and report a bounded public status without exposing private review content.

---

## P5-07 — Canonical application transactions and retention

### Goal

Apply approved Submission decisions safely to canonical data and enforce private-data lifecycle rules.

### Scope

- explicit application plan derived from approved field decisions;
- exact canonical version or state expectations;
- field-level diff and correction provenance;
- atomic canonical create or update transaction;
- Claim, Claim Asset, identity, and practical profile boundaries kept distinct;
- Media decisions remain delegated to Media review operations;
- request replay and stale-state conflict handling;
- application receipt and Audit history;
- public export and release remain separate;
- contact, private payload, evidence, ownership proof, and upload retention jobs;
- deletion or anonymization where required;
- preservation of minimum Audit records where lawful and necessary.

### Completion gate

Approved changes can be applied once, replay safely, conflict on stale state, retain provenance and review identity, and reach public output only through the normal export and release workflow.

---

## P5-08 — MVP-B integration audit

### Goal

Verify the complete Submission system across all public and protected boundaries before launch preparation.

### Required journeys

1. Suggestion → review → Candidate or approved canonical change → export → publication.
2. Positive payment report → Evidence review → optional reconfirmation → publication.
3. Negative payment report → Evidence/recheck → explicit Claim decision if justified.
4. Problem report → correction, no change, duplicate, privacy, or rights outcome.
5. Business claim → ownership verification → normal proposed-change review.
6. Photo submission → quarantine → Media review → controlled public Media publication.
7. Information request → private follow-up → resumed review.
8. Partial approval → approved-field application with rejected or held fields preserved correctly.

### Audit categories

- privacy and data minimization;
- authorization;
- abuse controls;
- replay and duplicate handling;
- status secret handling;
- field-level review and provenance;
- stale-state conflict behavior;
- canonical/public separation;
- Media isolation;
- export leakage validation;
- public status privacy;
- retention and cleanup;
- mobile and accessibility behavior;
- failure, retry, and rollback boundaries.

### Completion gate

Phase 5 is complete only when the full Submission-to-publication path is auditable and the system can demonstrate that unreviewed Submission data never becomes public canonical data automatically.
