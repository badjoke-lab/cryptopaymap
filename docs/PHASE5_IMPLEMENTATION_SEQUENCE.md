# Phase 5 public submissions implementation sequence

**Phase:** Phase 5 — Public submissions / MVP-B  
**Status:** Active — P5-02 Suggest work in progress  
**Last updated:** 2026-07-11

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
P5-02A  Completed through #156
P5-02B  Completed through #157
P5-02C  Completed through #158
P5-02D  Completed through #159
P5-02E  Completed through #160
P5-02F  Completed through #161
P5-02G  Completed through #162
P5-02H  Completed through #163
P5-02I  Submission status-secret environment binding                    In progress
Remaining public Suggest route/form provider and exposure slices        Planned
P5-02 integration and handoff audit                                    Planned
```

P5-01 is repository-complete. P5-02 has established Suggest contract and normalization, private intake, read-only overlap signals, protected reviewer entry, guarded workflow transitions, information requests, time-bounded Hold, and the accepted-as-Candidate transaction boundary. Public route/form wiring with real environment-backed providers is active; a bounded P5-02 integration and handoff audit remains after it.

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

### Current bounded sequence

```text
P5-02A — Suggest contract and review-safe normalization                Completed #156
    ↓
P5-02B — private Suggest intake integration                            Completed #157
    ↓
P5-02C — Candidate overlap and canonical-target read-only signals      Completed #158
    ↓
P5-02D — protected reviewer queue and detail entry                     Completed #159
    ↓
P5-02E — guarded received→triage→in_review transitions                 Completed #160
    ↓
P5-02F — guarded in_review→needs_information request                   Completed #161
    ↓
P5-02G — guarded time-bounded in_review→on_hold operation              Completed #162
    ↓
P5-02H — atomic accepted-as-Candidate outcome                          Completed #163
    ↓
P5-02I — Submission status-secret environment binding                  In progress
    ↓
remaining public Suggest route/form provider and exposure slices       Planned
    ↓
P5-02 integration and handoff audit                                    Planned
```

P5-02H must:

- accept only exact-state `in_review` Suggest submissions;
- require a separate Candidate-create capability;
- revalidate the normalized Suggest projection immediately before transaction planning;
- use a configured active `user_submission` source channel;
- create a private Source Record, private Candidate, and origin linkage atomically with Submission resolution and durable event history;
- guard both Submission state version and normalized payload version;
- replay safely under identical request UUID retry;
- create no canonical Entity, Location, Claim, Evidence acceptance, public export, or publication state.

### Operational dependency

P4-18B must already provide safe operator handling and correction behavior for practical profile fields. Suggestion intake must not introduce field classes that the protected review and canonical application paths cannot safely process.

### Completion gate

A suggestion can move from public intake to protected review and resolve without directly changing a public record. A useful but insufficient suggestion may become a private Candidate.

P5-02 is not complete when P5-02H finishes. Public Suggest route/form wiring with real environment-backed providers and a bounded integration/handoff audit still remain.

---
