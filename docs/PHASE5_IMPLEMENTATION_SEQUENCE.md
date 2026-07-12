# Phase 5 public submissions implementation sequence

**Phase:** Phase 5 — Public submissions / MVP-B  
**Status:** Active — P5-02 Suggest audit in progress  
**Last updated:** 2026-07-12

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
P5-02I  Submission status-secret environment binding                    Completed #167
P5-02J  Submission contact protection                                   Completed #168
P5-02K  Opaque Submission rate-limit bucket derivation                   Completed #169
P5-02L  Trusted Cloudflare edge identity extraction                      Completed #170
P5-02M  Durable Object distributed Submission rate limiting              Completed #171
P5-02N  Turnstile environment binding                                   Completed #172
P5-02O  Public Suggest HTTP route and safe response mapping              Completed #173
P5-02P  Public Suggest form and Turnstile browser wiring                 Completed #174
P5-02Q  Configured Suggest review verification                          Completed #175–#183
P5-02R  Suggest integration and handoff audit                           In progress
```

The corrected fixed-review P5-02R probe directly validated Cloudflare's exact documented always-pass
dummy token with the official test secret. Siteverify returned HTTP 200 and success but reported
`hostname: example.com` with no action rather than the documented `localhost` and `test`. The probe
reproduced this result for JSON and `application/x-www-form-urlencoded`, each with and without
`idempotency_key`, so the discrepancy is transport-independent and not caused by that optional
parameter. It stopped before the application route. P5-02 and P5-02R remain in progress, and P5-03
remains blocked pending resolution or explicit reclassification of this documentation contradiction
and a successful live journey rerun.

P5-01 is repository-complete. P5-02 has established Suggest contract and normalization, private intake, read-only overlap signals, protected reviewer entry, guarded workflow transitions, information requests, time-bounded Hold, the accepted-as-Candidate transaction boundary, status-secret environment binding, contact protection, opaque bucket derivation, trusted edge identity extraction, distributed rate limiting, Turnstile environment binding, the public Suggest HTTP route, the public Suggest form/browser wiring, and configured fixed-review verification. The bounded P5-02 integration and handoff audit is now active.

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

Configured environment wiring remains required when the first public Suggest route is exposed.

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
P5-02I — Submission status-secret environment binding                  Completed #167
    ↓
P5-02J — Submission contact protection                                 Completed #168
    ↓
P5-02K — Opaque Submission rate-limit bucket derivation                Completed #169
    ↓
P5-02L — Trusted Cloudflare edge identity extraction                   Completed #170
    ↓
P5-02M — Durable Object distributed Submission rate limiting           Completed #171
    ↓
P5-02N — Turnstile environment binding                                Completed #172
    ↓
P5-02O — Public Suggest HTTP route and safe response mapping           Completed #173
    ↓
P5-02P — Public Suggest form and Turnstile browser wiring              Completed #174
    ↓
P5-02Q — Configured Suggest review verification                       Completed #175–#183
    ↓
P5-02R — Suggest integration and handoff audit                        In progress
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

### Configured review dependency

P5-02Q completed against fixed-review main commit:

```text
513dc7f543ac27fe512319a3cc24cc16c3de4302
```

The fixed-review receipt records successful:

- SQLite-backed rate-limit Durable Object Worker deployment;
- Pages preview Durable Object namespace binding;
- required Suggest runtime secret synchronization;
- client-safe runtime Turnstile configuration availability;
- lightweight live Neon query;
- Pages Function to Durable Object health reachability;
- deployed Suggest CSP presence;
- durable deployment receipt publication.

Readiness verification does not by itself prove a real successful Suggest POST, deterministic live replay, a real configured 429 sequence, or protected reviewer execution. P5-02R owns the bounded integration/handoff decision and must not infer those claims from readiness alone.

### P5-02R audit dependency

P5-02R must:

- reconcile P5-02A through P5-02Q contract continuity;
- run one clearly synthetic fixed-review Suggest intake without real personal or business data;
- prove public-route first acceptance, exact replay, and changed-content conflict;
- avoid logging the challenge token or returned status secret;
- compare stable public review artifacts before and after intake;
- confirm no automatic public/canonical mutation;
- assign protected Admin, production Turnstile, live 429, and configured accepted-as-Candidate work to explicit later gates;
- record an explicit P5-03 handoff decision.

### Operational dependency

P4-18B must already provide safe operator handling and correction behavior for practical profile fields. Suggestion intake must not introduce field classes that the protected review and canonical application paths cannot safely process.

### Completion gate

A suggestion can move from public intake to protected review and resolve without directly changing a public record. A useful but insufficient suggestion may become a private Candidate.

P5-02 completes only when P5-02R records repository and fixed-review audit evidence and an explicit P5-03 handoff decision.

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
