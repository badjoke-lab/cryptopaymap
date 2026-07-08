# P4-18D administration workflow integration audit

**Implementation item:** P4-18D  
**Status:** Active — D1 completed; D2 Access/API compatibility audit in progress  
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
| Operations overview | `/admin` | top-level protected dashboard and operation map | D1 completed |
| Candidate queue | `/admin/candidates` | top-level Admin navigation and overview card | reachable |
| Candidate detail | `/admin/candidates/detail/?id=<candidate>` | Candidate queue card → detail | reachable; stale copy corrected in D1 |
| Duplicate review | `/admin/candidates/duplicates/?groupId=<group>` | Candidate detail contextual group navigation | reachable when applicable |
| New-target promotion | `/admin/candidates/promotion/?id=<candidate>` | eligible Candidate queue card | reachable |
| Existing-target linking | `/admin/candidates/existing-target/?id=<candidate>` | eligible Candidate queue card | reachable |
| Existing-Location correction | `/admin/candidates/location-correction/?candidateId=<candidate>&locationId=<location>` | selected physical existing target → separate correction workspace | reachable in context |
| Claim operation map | `/admin/claims` | top-level Admin navigation and overview card | D1 completed |
| Evidence queue | `/admin/evidence` | Admin navigation, overview, Claim workflow index | reachable |
| Evidence detail/decision | `/admin/evidence/detail/?id=<evidence>` | Evidence queue item | D2 compatibility coherent; D3 guard/retry audit pending |
| Reconfirmation queue | `/admin/rechecks` | Admin navigation, overview, Claim workflow index | reachable |
| Reconfirmation detail | `/admin/rechecks/detail/?id=<claim>` | Rechecks queue item | D2 semantics classified; D3 network-failure recovery pending |
| Media queue | `/admin/media` | Admin navigation and overview | reachable |
| Media detail/decision | `/admin/media/detail/?id=<media>` | Media queue item | D2 compatibility coherent; D3 guard/retry audit pending |
| Export release queue | `/admin/exports` | Admin navigation and overview | reachable |
| Export candidate detail/decision | `/admin/exports/detail/?digest=<digest>` | current candidate card | D2 compatibility coherent; D4 release/publish boundary audit pending |
| Publication activation | protected `export:publish` boundary | API/non-overview operation | pending D4 non-UI classification |
| Release history | protected release-history read boundary | repository API/read model | pending D4 route/non-UI classification |
| Restore prepare/execute | protected `export:publish` restore boundary | repository workflow exists; public restore controls remain deferred | pending D4 |
| Audit history | `/admin/audit` | Admin navigation, overview, Claim workflow index | reachable; D4 visibility/leakage audit pending |
| Submissions | `/admin/submissions` | explicit future Phase 5 boundary only | intentionally no operation before P5-01 |

## Access and capability matrix

The verified Cloudflare Access identity preserves two deterministic forms:

```text
subject = <verified Access sub>
actorId = cloudflare-access:<verified Access sub>
```

Subject-based configuration keys compare the raw `subject`. Actor-ID-based configuration keys compare the normalized `actorId`. Email is metadata only and is not an authorization identifier.

The public repository configuration contract is recorded in `docs/ADMIN_ACCESS_CONFIGURATION.md`.

| Boundary | Repository configuration key | Allowlist identity | Capability |
|---|---|---|---|
| Dashboard | `CPM_ADMIN_DASHBOARD_SUBJECTS` | Access subject | `dashboard:read` |
| Candidate queue/detail | `CPM_ADMIN_CANDIDATE_SUBJECTS` | Access subject | `candidate:read` |
| Duplicate resolution | `CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS` | Access subject | `candidate:resolve` |
| Promotion and existing-target linking | `CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS` | Access subject | `candidate:promote` |
| Existing-Location correction | `CPM_ADMIN_LOCATION_CORRECT_SUBJECTS` | Access subject | `location:correct` |
| Evidence decision | `CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS` | Access subject | `evidence:review` |
| Reconfirmation read | `CPM_ADMIN_RECONFIRMATION_SUBJECTS` | Access subject | `claim:recheck` |
| Reconfirmation expiration | `CPM_ADMIN_RECONFIRMATION_SUBJECTS` | Access subject authorization | `claim:expire` |
| Media review | `CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS` | normalized actor ID | `media:review` |
| Export release | `CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS` | normalized actor ID | `export:release` |
| Publication and restore | `CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS` | normalized actor ID | `export:publish` |
| Audit history | `CPM_ADMIN_AUDIT_READ_ACTOR_IDS` | normalized actor ID | `audit:read` |

### D2 identity result

D2 classifies the mixed identifier families as an intentional repository contract, not an implicit equivalence:

- the Access parser preserves raw `sub` as `subject`;
- it derives `actorId` deterministically as `cloudflare-access:<sub>`;
- subject-based policies authorize against `identity.subject`;
- actor-ID-based policies authorize against `identity.actorId`;
- one operator may require both representations in different allowlists;
- swapping the forms fails authorization closed;
- live values remain environment-specific and must not be committed.

D2 adds a cross-policy integration test that passes one verified identity through all current subject- and actor-ID-based authorization families and asserts the wrong representation is denied.

## Protected UI/API compatibility matrix

The matrix below records repository client/server behavior. It is not live endpoint verification.

| Reachable mutation UI | UUID Idempotency-Key | Explicit conflict handling | Invalid/denied/unavailable handling | Network exception handling | D2 result |
|---|---|---|---|---|---|
| Duplicate decision | yes | 409 | denied and failed states | catch → failed | coherent |
| New-target Promotion | yes | 409 | 400 / 403 / unavailable | catch → unavailable | coherent |
| Existing-target linking | yes | 409 | 400 / 403 / unavailable | catch → unavailable | coherent |
| Existing-Location correction | yes | 409 | 400 / denied / unavailable | catch → unavailable | coherent |
| Evidence decision | yes | 409 | 400 / 403 / unavailable | catch → unavailable | coherent |
| Reconfirmation stale transition | yes | 409 | generic non-OK failure | **missing POST catch** | D3 finding |
| Media decision | yes | 409 | 400 / 403 / unavailable | catch → unavailable | coherent |
| Export release decision | yes | 409 | 400 / 403 / unavailable | catch → unavailable | coherent |

D2 adds a repository contract test that requires every currently reachable mutation UI to generate a UUID and send it through the `Idempotency-Key` header.

### D-API-01 — Reconfirmation network failure can strand the submitting message

**Finding:** The Reconfirmation detail POST sets `Committing Claim transition…` and awaits `fetch` without a surrounding catch. A network exception can therefore escape without replacing the submitting message with an operator-visible failure state.

**Classification:** Repository finding assigned to D3 failure/retry integration. D2 does not alter transition semantics.

## Reconfirmation actor semantics

D2 reviewed the manual and scheduled expiration paths.

The repository intentionally uses a system expiration semantic context:

- the protected manual route verifies a Cloudflare Access identity;
- it authorizes the raw subject through `CPM_ADMIN_RECONFIRMATION_SUBJECTS`;
- it preserves the operator-derived normalized `actorId`;
- it sets `actorType: system` in the expiration mutation context;
- it grants only `claim:expire`;
- it requires a UUID Idempotency-Key;
- the scheduled expiration path also uses the system expiration service contract.

Existing authorization tests explicitly fix this behavior. D2 therefore does not reclassify the manual transition as an ordinary human review decision. Instead, `docs/ADMIN_ACCESS_CONFIGURATION.md` records the hybrid semantics so the boundary is not inferred incorrectly.

D3/D4 must continue to verify that durable Audit normalization preserves enough attribution for manual protected expiration while keeping scheduled expiration semantics distinct.

## Migration assumptions

The repository migration journal currently ends at `0021_magenta_the_anarchist`.

Repository checks can prove:

- migration files and journal metadata are internally consistent;
- migration drift checks pass against repository expectations;
- schemas and tests compile against the repository migration state.

Repository checks do not prove:

- a live Neon environment has applied every migration through the repository head;
- the live Location correction decision table exists;
- release, activation, restore, reconfirmation, Media, or Audit-related durable tables are present in a specific deployed environment;
- the configured Pages Functions point at the intended database.

Live migration application is therefore an environment-specific item for D5/P4-18E. Repository CI must not be described as live migration verification.

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

### D-COPY-03 — Candidate inspection component retained a historical milestone statement

**Finding:** The Candidate detail component still described duplicate decisions, canonical promotion, Evidence decisions, and publication controls as unavailable in the earlier milestone.

**D1 correction:** Replace historical milestone wording with the current inspection boundary: this component is read-only, while mutations remain separate guarded workspaces or protected operations.

## D1 repository contracts — Completed through #143

D1 adds or updates checks for:

- unique top-level Admin navigation entries;
- nested route ownership for active-state navigation;
- Overview exact-only active matching;
- Admin Home capability copy and stale-copy rejection;
- dedicated Claim workflow markers and stale placeholder rejection;
- explicit future-only Submission boundary markers;
- Candidate detail current workflow wording;
- private and server-only marker leakage checks in built Admin HTML.

## D2 repository contracts

D2 adds:

- `docs/ADMIN_ACCESS_CONFIGURATION.md` with subject and actor-ID format rules;
- one cross-policy identity mapping test covering all current policy families;
- fail-closed tests for swapped subject and actor-ID forms;
- one mutation-UI contract test covering UUID `Idempotency-Key` generation across reachable mutation UIs;
- explicit Reconfirmation hybrid actor semantic documentation;
- API compatibility classification;
- precise migration repository/live boundary wording;
- D3 assignment for the Reconfirmation POST network-failure gap.

## Execution slices

### D1 — Route reachability and stale copy — Completed through #143

- durable operator journey matrix created;
- Admin Home capability descriptions corrected;
- stale Claims placeholder replaced by operation index;
- generic placeholders restricted to genuine future Submissions work;
- nested routes preserve owning Admin navigation state;
- stale Candidate detail workflow copy corrected;
- built-route markers and private-value exclusion validated.

### D2 — Access, API compatibility, and migration assumptions — In progress

- compare read and write authorization policies across the complete operator journey;
- fix the subject versus actor-ID configuration contract in docs and tests;
- verify GET/POST UI-client response compatibility;
- verify UUID idempotency-key supply on reachable mutations;
- classify reconfirmation actor semantics;
- inventory migration assumptions and assign live migration checks precisely;
- hand Reconfirmation network-failure recovery to D3.

### D3 — Guards, replay, conflict, failure, and retry integration

- trace version guards and source-set guards across Candidate, Promotion, correction, Evidence, reconfirmation, and Media;
- verify accepted-Evidence guards and Claim-transition constraints;
- verify identical replay and changed-content conflict behavior;
- verify stale-state conflict behavior;
- fix and verify Reconfirmation POST network-failure recovery;
- verify operator-visible retry or reconciliation state for unavailable and post-mutation failure cases;
- add cross-workspace integration tests where isolated tests leave a material gap.

### D4 — Publication, restore, and Audit integration

- classify publication activation as a reachable UI path or explicit non-UI protected operation;
- classify release history and restore preparation/execution similarly;
- verify release/publish capability separation;
- reconcile post-switch persistence failure handling;
- verify Audit normalization covers durable decisions without private payload leakage;
- verify Location correction Audit integration remains compatible with the cross-domain aggregator;
- verify manual Reconfirmation expiration attribution remains distinguishable from scheduled system expiration.

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
- environment variable propagation to deployed Functions;
- live Access identity claims and their `sub` values;
- live Neon migration application through the repository migration head;
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
