# P4-18D administration workflow integration audit

**Implementation item:** P4-18D  
**Status:** Active — D1 route reachability and stale-copy correction in progress  
**Last updated:** 2026-07-08

## Purpose

P4-18D verifies the protected administration workflow as one operator journey rather than as a set of isolated repository-complete components.

Repository tests, schemas, and built artifacts are evidence for repository behavior only. They do not prove live Cloudflare Access policy, live allowlist values, live database migrations, live R2 conditional writes, or production release/restore behavior.

## Required operator journey

```text
Candidate queue
    ↓
Candidate detail and source provenance
    ↓
duplicate review when applicable
    ↓
new-target promotion or existing-target linking
    ↓
separate existing-Location correction when needed
    ↓
Evidence review and Claim transition
    ↓
recheck / reconfirmation workflow
    ↓
Media review
    ↓
private export candidate review
    ↓
release decision
    ↓
publication activation
    ↓
release history / restore boundary
    ↓
Audit history
```

## Journey matrix

| Journey stage | Operator route or boundary | Repository reachability | D audit status |
|---|---|---|---|
| Operations overview | `/admin` | top-level protected dashboard and operation map | D1 copy corrected |
| Candidate queue | `/admin/candidates` | top-level Admin navigation and overview card | reachable |
| Candidate detail | `/admin/candidates/detail/?id=<candidate>` | Candidate queue card → detail | reachable; stale copy corrected in D1 |
| Duplicate review | `/admin/candidates/duplicates/?groupId=<group>` | Candidate detail contextual group navigation | reachable when applicable |
| New-target promotion | `/admin/candidates/promotion/?id=<candidate>` | eligible Candidate queue card | reachable |
| Existing-target linking | `/admin/candidates/existing-target/?id=<candidate>` | eligible Candidate queue card | reachable |
| Existing-Location correction | `/admin/candidates/location-correction/?candidateId=<candidate>&locationId=<location>` | selected physical existing target → separate correction workspace | reachable in context |
| Claim operation map | `/admin/claims` | top-level Admin navigation and overview card | D1 replaces stale placeholder with workflow index |
| Evidence queue | `/admin/evidence` | Admin navigation, overview, Claim workflow index | reachable |
| Evidence detail/decision | `/admin/evidence/detail/?id=<evidence>` | Evidence queue item | repository route present; D2/D3 compatibility audit pending |
| Reconfirmation queue | `/admin/rechecks` | Admin navigation, overview, Claim workflow index | reachable |
| Reconfirmation detail | `/admin/rechecks/detail/?id=<claim>` | Rechecks queue item | repository route present; D2/D3 compatibility audit pending |
| Media queue | `/admin/media` | Admin navigation and overview | reachable |
| Media detail/decision | `/admin/media/detail/?id=<media>` | Media queue item | repository route present; D2/D3 compatibility audit pending |
| Export release queue | `/admin/exports` | Admin navigation and overview | reachable |
| Export candidate detail/decision | `/admin/exports/detail/?digest=<digest>` | current candidate card | reachable |
| Publication activation | protected `export:publish` boundary | API/non-overview operation; D4 must classify UI or non-UI operator contract | pending D4 |
| Release history | protected release-history read boundary | repository API/read model | pending D4 route/non-UI classification |
| Restore prepare/execute | protected `export:publish` restore boundary | repository workflow exists; public restore controls remain deferred | pending D4 |
| Audit history | `/admin/audit` | Admin navigation, overview, Claim workflow index | reachable; D4 visibility/leakage audit pending |
| Submissions | `/admin/submissions` | explicit future Phase 5 boundary only | intentionally no operation before P5-01 |

## Initial Access and capability matrix

This matrix records repository policy contracts. D2 must verify request/response compatibility and identity mapping across them; it must not assume that mixed identifier types are equivalent.

| Boundary | Repository configuration key | Allowlist identity | Capability |
|---|---|---|---|
| Dashboard | `CPM_ADMIN_DASHBOARD_SUBJECTS` | Access subject | `dashboard:read` |
| Candidate queue/detail | `CPM_ADMIN_CANDIDATE_SUBJECTS` | Access subject | `candidate:read` |
| Duplicate resolution | `CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS` | Access subject | `candidate:resolve` |
| Promotion and existing-target linking | `CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS` | Access subject | `candidate:promote` |
| Existing-Location correction | `CPM_ADMIN_LOCATION_CORRECT_SUBJECTS` | Access subject | `location:correct` |
| Evidence decision | `CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS` | Access subject | `evidence:review` |
| Reconfirmation read | `CPM_ADMIN_RECONFIRMATION_SUBJECTS` | Access subject | `claim:recheck` |
| Reconfirmation expiration | `CPM_ADMIN_RECONFIRMATION_SUBJECTS` | Access subject | `claim:expire` |
| Media review | `CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS` | normalized actor ID | `media:review` |
| Export release | `CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS` | normalized actor ID | `export:release` |
| Publication and restore | `CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS` | normalized actor ID | `export:publish` |
| Audit history | `CPM_ADMIN_AUDIT_READ_ACTOR_IDS` | normalized actor ID | `audit:read` |

### D2 compatibility questions

D2 must explicitly answer:

- whether the subject-based and actor-ID-based allowlists receive the identifiers operators are expected to configure;
- whether queue/detail read authorization and mutation authorization compose without impossible operator journeys;
- whether all protected GET and POST handlers map configuration, denied identity, invalid input, conflict, and unavailable states consistently enough for their UI clients;
- whether UUID idempotency requirements are supplied by every reachable mutation UI;
- whether the reconfirmation expiration actor type and actor identity semantics match the durable Audit expectation;
- whether current migration assumptions are represented by repository checks only or by an environment-specific verification item.

## D1 findings — Route reachability and stale copy

### D-ROUTE-01 — Nested Admin routes lost their top-level active navigation state

**Finding:** The shared Admin layout used exact path equality. Detail routes such as Candidate detail, Evidence detail, Rechecks detail, Media detail, Export detail, and Location correction therefore did not retain the owning top-level section as active.

**D1 correction:** Centralize Admin navigation and use section-aware nested path matching, while keeping Overview exact-only.

### D-ROUTE-02 — Claims route was a Phase 3 placeholder after Claim operations existed elsewhere

**Finding:** `/admin/claims` described canonical Claim editing as future work even though Claim creation, Evidence decisions, reconfirmation, and Audit operations already existed in separate protected workspaces.

**D1 correction:** Replace the stale placeholder with a workflow index that routes operators by operation and preserves the separate boundaries.

### D-ROUTE-03 — Shared dynamic placeholders still declared already implemented Admin sections

**Finding:** The dynamic Admin section source still declared placeholders for Evidence, Rechecks, Media, Exports, and Audit after dedicated routes existed.

**D1 correction:** Limit the dynamic placeholder boundary to Submissions, which is intentionally future Phase 5 work.

### D-COPY-01 — Admin Home contradicted implemented capabilities

**Finding:** Admin Home said Candidate promotion was disabled, public publication was disabled, and Export controls were unavailable even though repository boundaries existed for promotion, release, publication, restore, and Audit.

**D1 correction:** Replace disabled/unavailable statements with accurate separation-of-capability and exact-state-guard descriptions, and add Audit history to the operation map.

### D-COPY-02 — Candidate detail page described promotion as unavailable

**Finding:** Candidate detail top-level copy still said promotion remained unavailable.

**D1 correction:** Describe duplicate review, new-target promotion, and existing-target linking as separate guarded operations rather than unavailable functionality.

### D-COPY-03 — Candidate inspection component retained a historical P3-05 unavailable-operation statement

**Finding:** The Candidate detail component still described duplicate decisions, canonical promotion, Evidence decisions, and publication controls as unavailable in P3-05.

**D1 correction required:** Replace historical milestone wording with the current inspection boundary: this component is read-only, while mutations remain separate guarded workspaces.

## D1 repository contracts

D1 adds or updates checks for:

- unique top-level Admin navigation entries;
- nested route ownership for active-state navigation;
- Overview exact-only active matching;
- Admin Home capability copy and stale-copy rejection;
- dedicated Claim workflow markers and stale placeholder rejection;
- explicit future-only Submission boundary markers;
- Candidate detail current workflow wording;
- private and server-only marker leakage checks in built Admin HTML.

## Execution slices

### D1 — Route reachability and stale copy — In progress

- create the durable operator journey matrix;
- correct Admin Home capability descriptions;
- replace stale Claims placeholder with an operation index;
- restrict generic placeholders to genuinely future work;
- preserve owning Admin navigation state on nested routes;
- correct stale Candidate detail workflow copy;
- validate built-route markers and private-value exclusion.

### D2 — Access, API compatibility, and migration assumptions

- compare read and write authorization policies across the complete operator journey;
- verify subject versus actor-ID mapping expectations;
- verify GET/POST UI-client response compatibility;
- verify idempotency-key supply on reachable mutations;
- audit reconfirmation actor semantics;
- inventory current migration assumptions and assign live migration checks precisely.

### D3 — Guards, replay, conflict, failure, and retry integration

- trace version guards and source-set guards across Candidate, Promotion, correction, Evidence, reconfirmation, and Media;
- verify accepted-Evidence guards and Claim-transition constraints;
- verify identical replay and changed-content conflict behavior;
- verify stale-state conflict behavior;
- verify operator-visible retry or reconciliation state for unavailable and post-mutation failure cases;
- add cross-workspace integration tests where isolated tests leave a material gap.

### D4 — Publication, restore, and Audit integration

- classify publication activation as a reachable UI path or explicit non-UI protected operation;
- classify release history and restore preparation/execution similarly;
- verify release/publish capability separation;
- reconcile post-switch persistence failure handling;
- verify Audit normalization covers durable decisions without private payload leakage;
- verify Location correction Audit integration remains compatible with the cross-domain aggregator.

### D5 — Closure and environment-specific inventory

- reconcile the full journey matrix;
- resolve repository findings or assign them explicitly;
- enumerate every live-only check as completed, unavailable, P4-18E work, or later launch work;
- prohibit generic deferred-verification wording;
- move tracking to P4-18E only when D repository findings are closed or explicitly assigned.

## Environment-specific inventory seed

The following items are not proven by repository CI and must be classified by D5/P4-18E rather than silently considered complete:

- live Cloudflare Access policy behavior;
- actual subject and actor-ID allowlist values;
- live Neon migration application, including Location correction and restore-related durable tables;
- live Location correction operator flow and protected Audit appearance;
- concrete production R2 publication and restore adapter wiring;
- live R2 conditional-write behavior;
- production publication and restore drills;
- configured canonical query → complete candidate generation → private upload → release-review handoff;
- corrected canonical value → candidate generation → release review → public activation flow.

## Completion rule

P4-18D closes only when:

- every implemented operation has a reachable and accurate operator path or an explicit non-UI boundary classification;
- stale descriptions no longer contradict implemented capability;
- Access/API compatibility findings are resolved or explicitly assigned;
- guard, replay, conflict, failure, and retry behavior are reconciled across the journey;
- publication, restore, and Audit boundaries are explicit;
- unresolved environment dependencies are precisely assigned to P4-18E or later launch work;
- no repository-only test result is described as live verification.
