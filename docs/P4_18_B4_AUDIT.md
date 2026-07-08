# P4-18B4 existing-record practical profile correction audit

**Implementation item:** P4-18B4  
**Status:** Active — B4A completed through #135; B4B completed through #136; B4C protected operator path in progress  
**Last updated:** 2026-07-08

## Purpose

P4-18B4 audits and completes the guarded correction path for practical profile fields on already canonical Places.

The work is separate from Candidate existing-target linking. Existing-target linking reuses an identity and creates a new hidden Claim; it does not edit canonical Entity or Location profile fields.

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

Name, category, coordinates, country reassignment, Claim state, Evidence, and Media remain outside this bounded correction operation unless a later audit finds a direct dependency that cannot be separated safely.

## Required semantics

### Scalar fields

Scalar corrections distinguish:

- unchanged — field absent from the change plan;
- set — assign a reviewed value;
- clear — explicitly remove the current optional value.

An empty form value must never silently mean clear.

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

B4B did not add a reviewer-facing workspace or Audit history normalization.

## B4C protected operator boundary

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

Existing-target linking remains a separate operation. Selecting a physical canonical target exposes a separate correction-workspace route instead of silently rewriting Location profile fields during linking.

The protected API uses a dedicated subject allowlist and UUID `Idempotency-Key`. Publication remains outside the correction operation.

## Execution slices

### B4A — Correction contract and atomic semantics — Completed through #135

- strict mutation context and capability boundary;
- explicit scalar and structured change operations;
- exact field-provenance coverage;
- deterministic request fingerprints;
- canonical patch application;
- copy-on-write in-memory backend;
- committed replay, changed-content conflict, stale-version conflict, source validation, structured operation, no-op, and rollback coverage.

### B4B — Durable correction persistence — Completed through #136

- durable correction decision storage;
- before/after field-level diff and reviewed source IDs;
- exact Location version guard;
- source-record existence guard;
- atomic Location, current correction provenance, and durable decision persistence;
- deterministic replay and stale-state conflict behavior;
- production Drizzle persistence coverage;
- generated migration and migration-drift validation.

### B4C — Protected operator path — In progress

- protected correction authorization and workspace/read model;
- current canonical values and bounded reviewed Candidate source choices;
- Candidate-version, Location-version, exact-source-set, and eligibility revalidation before write;
- field operation controls and per-field correction source assignments;
- protected GET/POST API authorization and idempotency boundary;
- reviewer-visible set/clear and structured list operation controls;
- explicit navigation from selected physical existing target to the separate correction workspace;
- publication remains separate.

### B4D — Audit integration and closure

- normalize durable correction decisions into protected Audit history;
- verify operator reachability and failure/retry states;
- reconcile the B4 completion matrix;
- record any environment-specific checks for P4-18D/E;
- move tracking to P4-18C only after B4 repository requirements are closed.

## Non-goals

- changing Claim verification status;
- directly publishing corrected values;
- accepting public submissions;
- widening existing-target Candidate linking into a profile edit operation;
- broad Place identity or coordinate editing;
- Media correction.
