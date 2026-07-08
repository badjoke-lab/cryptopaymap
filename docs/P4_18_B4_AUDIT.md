# P4-18B4 existing-record practical profile correction audit

**Implementation item:** P4-18B4  
**Status:** Active — B4A contract implementation in progress  
**Last updated:** 2026-07-08

## Purpose

P4-18B4 audits and completes the guarded correction path for practical profile fields on already canonical Places.

The work is separate from Candidate existing-target linking. Existing-target linking reuses an identity and creates a new hidden Claim; it does not edit canonical Entity or Location profile fields.

## Audit finding

The current repository does not contain a dedicated existing canonical Location practical-profile correction transaction that satisfies the P4-18B4 requirements.

The existing-target Candidate link path explicitly does not update Entity or Location values. It creates a hidden Claim and Claim Assets, adds attribution/origin provenance, updates Candidate and legacy mapping state, and records a replay receipt.

Therefore B4 requires an explicit correction operation rather than widening existing-target linking.

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

B4 persistence must record correction provenance at field level and preserve an auditable decision receipt. Clear operations still require reviewed correction provenance even when the resulting canonical field has no current value.

## Execution slices

### B4A — Correction contract and atomic semantics

- define strict mutation context and capability boundary;
- define explicit scalar and structured change operations;
- validate exact field-provenance coverage;
- normalize deterministic request fingerprints;
- implement canonical patch application;
- implement copy-on-write in-memory backend;
- cover committed replay, changed-content conflict, stale-version conflict, source-set validation, structured add/remove/replace/clear behavior, and rollback.

### B4B — Durable correction persistence

- add durable correction decision storage;
- preserve before/after field-level diff and reviewed source IDs;
- add exact Location version guard;
- add source-record existence guard;
- update the Location and correction provenance atomically;
- preserve deterministic request replay and stale-state conflict behavior;
- add production Drizzle persistence coverage.

### B4C — Protected operator path

- add protected correction workspace/read model;
- expose current canonical values and bounded reviewed source choices;
- add field diff and correction provenance controls;
- add protected API authorization and idempotency boundary;
- add reviewer-visible set/clear and structured list operation controls;
- keep publication separate.

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
