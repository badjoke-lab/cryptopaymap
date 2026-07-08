# P4-18B4 existing-record practical profile correction audit

**Implementation item:** P4-18B4  
**Status:** Repository completed through #135, #136, #137, and #138  
**Last updated:** 2026-07-08

## Purpose

P4-18B4 audits and completes the guarded correction path for practical profile fields on already canonical Places.

The work is separate from Candidate existing-target linking. Existing-target linking reuses an identity and creates a new hidden Claim; it does not edit canonical Entity or Location profile fields.

## Closure result

Repository B4 requirements are complete through #135, #136, #137, and #138.

The repository now provides:

- an explicit bounded `location:correct` operation;
- scalar set, clear, and unchanged semantics;
- Amenities add, remove, replace, clear, and unchanged semantics;
- Social Link add, remove, replace, clear, and unchanged semantics;
- exact changed-field correction provenance coverage;
- deterministic replay and changed-content conflict behavior;
- exact canonical Location version guards;
- no-op rejection and atomic rollback coverage;
- durable before/after correction history and reviewer decision receipts;
- current correction provenance maintenance separated from durable correction history;
- generated database migration and migration-drift validation;
- protected Candidate-source-set and canonical-Location workspace binding;
- protected GET/POST API with dedicated subject allowlist and UUID idempotency key;
- Candidate-version, Location-version, exact-source-set, and eligibility revalidation immediately before write;
- reviewer controls for all bounded correction operation classes;
- explicit navigation from selected physical existing target to the separate correction workspace;
- protected Audit history normalization of durable correction decisions;
- operator reachability, conflict, unavailable, and retry recovery coverage;
- built artifact checks for the Location correction admin page and server-only marker leakage.

Repository B4 completion does not claim that the live database migration, Cloudflare Access allowlist, live operator workflow, release generation path, or production publication flow has been verified. Those environment-specific checks remain for P4-18D/E according to their scopes.

## Audit finding

The repository did not contain a dedicated existing canonical Location practical-profile correction transaction that satisfied the P4-18B4 requirements.

The existing-target Candidate link path explicitly does not update Entity or Location values. It creates a hidden Claim and Claim Assets, adds attribution/origin provenance, updates Candidate and legacy mapping state, and records a replay receipt.

Therefore B4 implements an explicit correction operation rather than widening existing-target linking.

## Required field scope

The bounded B4 practical profile correction scope is:

- `addressLine`;
- `locality`;
- `region`;
- `postalCode`;
- `websiteUrl`;
- `phone`;
- `description`;
- `openingHours`;
- `amenities`;
- `socialLinks`.

Name, category, coordinates, country reassignment, Claim state, Evidence, and Media remain outside this bounded correction operation.

## Required semantics

### Scalar fields

Scalar corrections distinguish:

- unchanged — field absent from the change plan;
- set — assign a reviewed value;
- clear — explicitly remove the current optional value.

An empty form value never silently means clear.

### Amenities

Amenities corrections distinguish:

- add reviewed values;
- remove reviewed values;
- replace the complete set;
- clear the complete set;
- unchanged when omitted from the change plan.

### Social links

Social-link corrections distinguish:

- add reviewed official links;
- remove links by stable `platform + url` identity;
- replace the complete set, including URL or handle corrections;
- clear the complete set;
- unchanged when omitted from the change plan.

Duplicate canonical `platform + url` pairs remain invalid.

## Provenance boundary

Every changed field requires an explicit correction provenance assignment.

The correction request contains:

- the complete reviewed source-record set available to the operation;
- one field assignment for every changed field;
- one or more source-record IDs for each changed field;
- no assignment to unchanged fields;
- no source reference outside the exact reviewed source-record set.

B4 persistence records correction provenance at field level and preserves an auditable decision receipt. Clear operations still require reviewed correction provenance even when the resulting canonical field has no current value.

The persistence model separates:

- current field basis in `provenance_links`;
- complete correction history in durable Location correction decision receipts.

For a changed field, active prior non-correction provenance is ended. Prior current correction rows for that field are replaced by the accepted correction source assignments. When a field is explicitly cleared, no current correction provenance row is inserted for the absent value, while the durable decision receipt preserves the clear operation, before/after values, reviewer identity, and reviewed source assignments.

## B4A result — #135

B4A established:

- dedicated `location:correct` capability and mutation context;
- strict bounded Location correction field set;
- explicit scalar `set` and `clear` operations;
- Amenities add, remove, replace, clear, and unchanged semantics;
- Social Link add, remove by stable identity, replace, clear, and unchanged semantics;
- exact changed-field provenance coverage;
- rejection of source references outside the reviewed source set;
- deterministic request fingerprint normalization;
- strict canonical patch application;
- copy-on-write in-memory atomic backend;
- committed replay, changed-content conflict, stale-version conflict, source validation, no-op rejection, and rollback coverage.

## B4B result — #136

B4B established:

- durable Location profile correction decision storage;
- reviewer identity, exact expected Location version, change plan, changed field set, before/after values, reviewed source set, field provenance assignments, reason, notes, decision time, and request fingerprint persistence;
- exact Location version and source-record existence SQL guards;
- atomic Location update, current correction provenance replacement, and durable decision receipt persistence;
- explicit clear-operation history without inventing current provenance for an absent value;
- deterministic replay and changed-content conflict behavior;
- generated migration `0021_magenta_the_anarchist` and migration-drift validation;
- production Drizzle backend and persistence foundation coverage.

## B4C result — #137

B4C keeps the Candidate and Location roles distinct:

```text
physical Candidate under review
    ↓
exact protected Candidate source set
    +
selected canonical Location current version
    ↓
reviewer chooses explicit field operations
    ↓
reviewer assigns correction sources per changed field
    ↓
POST revalidates Candidate version, Location version, exact source set, and eligibility
    ↓
independent location:correct transaction
```

B4C established:

- dedicated `CPM_ADMIN_LOCATION_CORRECT_SUBJECTS` authorization policy;
- isolated correction read and mutation contexts;
- UUID `Idempotency-Key` requirement;
- protected workspace/read model;
- bounded canonical Location current values and reviewed Candidate source choices;
- Candidate-version, Location-version, exact-source-set, and eligibility revalidation before write;
- field operation controls and per-field correction source assignments;
- explicit decision reason, public summary, and internal note controls;
- separate navigation from selected physical existing-target review;
- explicit invalid, denied, not-found, conflict, unavailable, and success states;
- publication kept outside the correction operation.

Existing-target linking remains a separate operation and does not silently rewrite Location profile fields.

## B4D result — #138

B4D closes the repository correction path by establishing:

- `canonical` as a protected Audit history domain;
- `location_profile_correction` as the durable correction source kind;
- `location` as an exact Audit target type;
- bounded metadata-only normalization of durable correction decisions;
- exclusion of internal note, before/after payloads, request fingerprint, and private correction payloads from normalized Audit items;
- Drizzle Audit source filtering by actor, time, pagination cursor, and Location target;
- protected Audit API aggregation of correction history;
- operator reachability from selected physical existing-target review;
- unavailable-workspace retry recovery coverage;
- built artifact presence and server-only marker leakage checks for the correction admin page.

## Completion matrix

| Requirement | Repository result |
|---|---|
| Address/locality/region/postal correction | Covered by bounded scalar set/clear contract |
| Phone add/replace/remove | Covered |
| Website add/replace/remove | Covered |
| Description correction/removal | Covered |
| Opening-hours correction/removal | Covered |
| Amenities add/remove/replace/clear | Covered |
| Social link add/remove/replace/handle change | Covered |
| Exact canonical state guard | Covered by Location `updatedAt` guard plus SQL lock guard |
| Explicit before/after diff | Durable decision receipt |
| Correction provenance | Field-level reviewed-source assignments plus current provenance maintenance |
| Reviewer decision | Durable decision table and protected operator path |
| Identical replay | Covered |
| Changed-content conflict | Covered |
| Stale-state conflict | Covered |
| Atomic rollback | Covered |
| Separate publication boundary | Covered |
| Protected Audit record | Covered through #138 |
| Operator reachability | Covered through explicit existing-target route |
| Failure/retry states | Covered through API and component tests |
| Built admin artifact boundary | Covered by staging artifact check |

## Environment-specific checks carried forward

P4-18D/E must verify or classify, without treating repository tests as live evidence:

- migration `0021_magenta_the_anarchist` applied in the configured database environment;
- `CPM_ADMIN_LOCATION_CORRECT_SUBJECTS` configured for intended live reviewers;
- protected correction page and API reachable only through intended Access policy;
- one representative live correction can load exact Candidate sources and canonical Location version;
- stale Candidate, stale Location, and changed source-set conflicts fail closed in the configured environment;
- correction decision appears in live protected Audit history after a successful live correction;
- corrected canonical values enter the configured candidate-generation and release-review path assigned by the B3 audit before any public activation.

## Closure decision

P4-18B4 repository requirements are closed through #135, #136, #137, and #138.

The next implementation item is P4-18C bounded UI residual closure. B4 live/environment checks remain assigned to P4-18D/E and must not be represented as completed by repository CI alone.

## Non-goals

- changing Claim verification status;
- directly publishing corrected values;
- accepting public submissions;
- widening existing-target Candidate linking into a profile edit operation;
- broad Place identity or coordinate editing;
- Media correction.
