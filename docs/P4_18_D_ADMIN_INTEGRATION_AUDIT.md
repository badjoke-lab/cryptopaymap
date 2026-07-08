# P4-18D administration workflow integration audit

**Implementation item:** P4-18D  
**Status:** Active — D1 completed through #143; D2 completed through #144; D3 guard/replay/failure integration in progress  
**Last updated:** 2026-07-08

## Purpose

P4-18D verifies the protected administration workflow as one operator journey rather than as isolated repository-complete components.

Repository tests, schemas, generated migrations, and built artifacts are evidence for repository behavior only. They do not prove live Cloudflare Access policy, live allowlist values, live database migration state, live R2 conditional writes, or production release/restore behavior.

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
| Candidate detail | `/admin/candidates/detail/?id=<candidate>` | Candidate queue card → detail | D1 completed |
| Duplicate review | `/admin/candidates/duplicates/?groupId=<group>` | Candidate detail contextual group navigation | reachable when applicable |
| New-target promotion | `/admin/candidates/promotion/?id=<candidate>` | eligible Candidate queue card | guard/replay contract reconciled |
| Existing-target linking | `/admin/candidates/existing-target/?id=<candidate>` | eligible Candidate queue card | guard/replay contract reconciled |
| Existing-Location correction | `/admin/candidates/location-correction/?candidateId=<candidate>&locationId=<location>` | selected physical existing target → separate correction workspace | guard/replay contract reconciled |
| Claim operation map | `/admin/claims` | top-level Admin navigation and overview card | D1 completed |
| Evidence queue | `/admin/evidence` | Admin navigation, overview, Claim workflow index | reachable |
| Evidence detail/decision | `/admin/evidence/detail/?id=<evidence>` | Evidence queue item | D3 confirmation guard hardening in progress |
| Reconfirmation queue | `/admin/rechecks` | Admin navigation, overview, Claim workflow index | reachable |
| Reconfirmation detail | `/admin/rechecks/detail/?id=<claim>` | Rechecks queue item | D3 network-failure recovery corrected |
| Media queue | `/admin/media` | Admin navigation and overview | reachable |
| Media detail/decision | `/admin/media/detail/?id=<media>` | Media queue item | guard/replay contract reconciled |
| Export release queue | `/admin/exports` | Admin navigation and overview | reachable |
| Export candidate detail/decision | `/admin/exports/detail/?digest=<digest>` | current candidate card | D4 release/publish boundary audit pending |
| Publication activation | protected `export:publish` boundary | API/non-overview operation | pending D4 non-UI classification |
| Release history | protected release-history read boundary | repository API/read model | pending D4 route/non-UI classification |
| Restore prepare/execute | protected `export:publish` restore boundary | repository workflow exists; public restore controls remain deferred | pending D4 |
| Audit history | `/admin/audit` | Admin navigation, overview, Claim workflow index | reachable; D4 visibility/leakage audit pending |
| Submissions | `/admin/submissions` | explicit future Phase 5 boundary only | intentionally no operation before P5-01 |

## Access and capability result — D2 completed through #144

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
| Reconfirmation read/expiration | `CPM_ADMIN_RECONFIRMATION_SUBJECTS` | Access subject | `claim:recheck` / `claim:expire` |
| Media review | `CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS` | normalized actor ID | `media:review` |
| Export release | `CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS` | normalized actor ID | `export:release` |
| Publication and restore | `CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS` | normalized actor ID | `export:publish` |
| Audit history | `CPM_ADMIN_AUDIT_READ_ACTOR_IDS` | normalized actor ID | `audit:read` |

D2 established:

- subject and actor-ID representations are deterministic but not interchangeable;
- one operator may require both representations in different allowlists;
- swapped representations fail authorization closed;
- every currently reachable mutation UI generates and sends a UUID `Idempotency-Key`;
- Evidence, Media, Promotion, existing-target linking, Location correction, and Export release clients explicitly map invalid, denied, conflict, unavailable, and network-failure states;
- Reconfirmation uses intentional hybrid semantics: Access subject authorization, operator-derived `actorId`, system expiration actor type, and UUID request ID;
- repository migration checks are not live database verification.

## D3 guard and replay matrix

| Operation | Reviewed-state guards | Replay/conflict contract | D3 result |
|---|---|---|---|
| Duplicate resolution | group version/member set and review state | deterministic request fingerprint; identical replay; changed-content conflict | coherent |
| New-target Promotion | Candidate version, exact source set, field provenance plan | identical replay; changed-content conflict; atomic persistence | coherent |
| Existing-target linking | Candidate version, target versions/path/Claim set, exact source set | identical replay; changed-content conflict | coherent |
| Existing-Location correction | Candidate version, Location version, exact source set, changed-field provenance | identical replay; changed-content conflict; stale-state conflict | coherent |
| Evidence review | Evidence version, Claim version/status/visibility, accepted Evidence set | request fingerprint and atomic row guards | **D3 hardening adds exact payment set and current payment prerequisites for confirm** |
| Reconfirmation expiration | Claim version/status/visibility/nextReviewAt | UUID request, stale-state conflict, durable expiration record | retry UI fixed in D3 |
| Media review | Media version/review state/subject expectations | identical replay; changed-content conflict | coherent |
| Export release | candidate digest/status/version assumptions | identical replay; changed-content conflict | D4 publication integration pending |

## D3 finding — Evidence confirmation payment prerequisites were not revalidated

### Finding

Before D3, the Evidence confirmation path verified:

- Evidence threshold;
- Evidence version and pending review status;
- Claim version, status, and visibility;
- complete accepted Evidence ID set;
- `howToPay`;
- `customerPaysCrypto`;
- `merchantExplicitlyAcceptsCrypto`.

However, the protected Evidence workspace and confirm decision path did not load or pin the current Claim Asset / Network / Payment Method set.

Normal Claim creation through new-target Promotion and existing-target linking requires at least one Claim Asset row, but the database cannot express the cross-row rule that every Claim always retains at least one valid current payment combination. A later data change or registry lifecycle change could therefore make the payment set unsuitable for confirmation while the Evidence threshold path still passed.

This was a real repository guard gap relative to the verification policy and public export payment-combination rules.

### D3 correction

D3 adds:

- protected Evidence detail projection of current payment combinations;
- payment prerequisite evaluation using the same route/network/method/registry rules used by the public boundary;
- at least one payment combination requirement;
- exactly one primary combination requirement;
- active asset, network, and payment-method registry requirements;
- Lightning method → Lightning network compatibility;
- on-chain method exclusion from Lightning network;
- processor-checkout method → processor-checkout route compatibility;
- reviewer-visible prerequisite eligibility and issue display;
- confirm action suppression when payment prerequisites are ineligible;
- exact reviewed Claim Asset ID set in the decision input;
- exact set inclusion in the deterministic request fingerprint;
- projection-time exact set comparison and prerequisite validation;
- atomic transaction-time SQL guard that share-locks Claim Asset and registry rows and rechecks exact IDs and prerequisite conditions;
- durable persistence of the reviewed Claim Asset ID set in the Evidence decision receipt table;
- generated migration and migration-drift validation;
- focused evaluator, API, workspace, component, decision-fingerprint, persistence, and integration coverage.

### Conflict semantics

If the reviewed Claim Asset set changes before commit, the operation fails with conflict and the reviewer must reload current state.

If the set is unchanged but current registry or compatibility prerequisites no longer allow confirmation, the operation fails closed. The atomic guard prevents a time-of-check/time-of-use gap between projection and commit.

## D3 finding — Reconfirmation POST network failure recovery

### Finding

The Reconfirmation detail component set `Committing Claim transition…` and awaited the POST without a catch block. A connectivity exception could leave the operator without a terminal failure/retry message.

### D3 correction

D3 wraps the mutation request in `try/catch` and replaces the submitting message with:

`The Claim transition request could not be completed. Retry when connectivity returns.`

Focused component coverage asserts that the submitting message is removed after a rejected network request.

Transition semantics, authorization semantics, and durable expiration behavior are unchanged.

## Reconfirmation actor semantics

The repository intentionally uses a system expiration semantic context:

- the protected manual route verifies a Cloudflare Access identity;
- it authorizes the raw subject through `CPM_ADMIN_RECONFIRMATION_SUBJECTS`;
- it preserves the operator-derived normalized `actorId`;
- it sets `actorType: system` in the expiration mutation context;
- it grants only `claim:expire`;
- it requires a UUID Idempotency-Key;
- the scheduled expiration path also uses the system expiration service contract.

D4 must verify that protected Audit normalization preserves enough attribution for manual protected expiration while keeping scheduled expiration semantics distinguishable.

## Migration boundary

The repository migration journal before D3 ended at `0021_magenta_the_anarchist`. D3 adds a generated migration for durable Evidence decision Claim Asset set storage.

Repository checks can prove only:

- migration files and journal metadata are internally consistent;
- migration drift checks pass against repository expectations;
- schemas and tests compile against repository migration state.

Repository checks do not prove:

- a live Neon environment has applied migrations through repository head;
- the deployed environment points at the intended database;
- the new durable Evidence decision column exists in a specific live environment.

Live migration application remains an environment-specific D5/P4-18E item.

## D1 result — Completed through #143

D1 established:

- durable operator journey matrix;
- accurate Admin Home capability descriptions;
- Claims operation index instead of stale placeholder copy;
- generic placeholder restricted to genuine future Submissions work;
- nested routes preserve owning Admin navigation state;
- current Candidate detail workflow wording;
- built-route and private-marker leakage checks.

## D2 result — Completed through #144

D2 established:

- `docs/ADMIN_ACCESS_CONFIGURATION.md`;
- cross-policy identity mapping coverage across all current authorization families;
- fail-closed coverage for swapped subject and actor-ID forms;
- mutation-UI UUID Idempotency-Key contract coverage;
- explicit Reconfirmation hybrid actor semantics;
- protected UI/API compatibility classification;
- precise repository-versus-live migration boundary wording;
- D3 assignment for Reconfirmation network-failure recovery.

## Execution slices

### D1 — Route reachability and stale copy — Completed through #143

Closed.

### D2 — Access, API compatibility, and migration assumptions — Completed through #144

Closed.

### D3 — Guards, replay, conflict, failure, and retry integration — In progress

- reconcile version, source-set, accepted-Evidence, and payment-set guards;
- preserve identical replay and changed-content conflict behavior;
- close Evidence confirm payment prerequisite gap;
- persist reviewed Claim Asset set durably;
- close Reconfirmation POST network-failure recovery gap;
- run full repository CI and migration drift validation;
- move to D4 only after D3 repository findings are green.

### D4 — Publication, restore, and Audit integration

- classify publication activation as reachable UI path or explicit non-UI protected operation;
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
- live Neon migration application through repository migration head;
- live Location correction operator flow and protected Audit appearance;
- live Evidence confirmation against the current payment prerequisite set;
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
