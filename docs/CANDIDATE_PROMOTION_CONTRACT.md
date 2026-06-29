# Candidate promotion contract

**Implementation item:** P3-07  
**Current delivery:** P3-07A — canonical promotion service contract and atomic test backend  
**Status:** In progress

## Purpose

P3-07 promotes one reviewed private Candidate into hidden canonical records. Promotion is not verification and is not publication.

```text
reviewed Candidate
  -> explicit promotion authorization
  -> exact Candidate and provenance version checks
  -> hidden canonical Entity and optional Location
  -> hidden candidate Acceptance Claim
  -> normalized Claim Asset combinations
  -> Candidate status promoted
  -> pending legacy mapping resolved
```

## P3-07A scope

P3-07A defines and tests:

- the `candidate:promote` capability;
- request UUID, actor identity, and actor type;
- exact Candidate type and update-time expectations;
- physical-place and online-service promotion boundaries;
- explicit canonical Entity, Location, Claim, and Claim Asset drafts;
- exact source-record provenance expectations;
- request replay and conflicting request reuse;
- copy-on-write rollback proof;
- hidden canonical output and candidate claim status;
- legacy path mapping behavior.

P3-07A uses an in-memory atomic backend for contract tests. It does not claim production persistence.

## Supported Candidate types

This delivery supports:

```text
physical_place
online_service
```

Other Candidate types remain private and are rejected by the promotion input contract until a later reviewed extension.

## Canonical boundaries

Physical-place promotion requires:

- Entity type `merchant`;
- one canonical Location;
- Claim scope `location_specific`;
- Claim location ID matching the new Location;
- canonical path `/place/{location-slug}`.

Online-service promotion requires:

- Entity type `online_service`;
- no Location;
- Claim scope `online_service`;
- canonical path `/service/{entity-slug}`.

## Verification and publication boundary

Every newly promoted record must remain private:

```text
Entity visibility       hidden
Location visibility     hidden
Claim status            candidate
Claim visibility        hidden
```

Promotion cannot assign:

- Confirmed, Stale, Ended, or public status;
- confirmation timestamps;
- review deadlines;
- ending timestamps or reasons;
- Evidence decisions;
- verification events;
- media decisions;
- public exports.

How-to-pay text may be normalized during promotion, but it is not treated as verified until P3-08.

## Asset, network, and payment method boundary

Every Claim Asset draft must explicitly identify:

- asset ID;
- network ID;
- payment method ID;
- optional contract address;
- one primary combination.

The backend must reject unknown registry references. Asset symbols never imply networks.

## Provenance

The promotion request includes the exact reviewed source-record set. The backend must reject promotion if current Candidate provenance differs.

P3-07A creates record-level origin provenance for:

- Entity;
- Location when present;
- Acceptance Claim;
- every Claim Asset.

Field-level provenance editing is added with the protected editor before P3-07 is completed.

## Atomicity

One promotion operation must either commit all of the following or none:

- canonical records;
- provenance links;
- Candidate status and canonical links;
- legacy mapping resolution;
- replay receipt.

The in-memory backend proves this with copy-on-write state and injected pre-commit failure.

## Replay and conflict behavior

The request UUID is the idempotency identity.

- exact replay returns the original result with `state = replayed`;
- reuse with different content is a conflict;
- stale Candidate type, status, update time, canonical links, or provenance is a conflict;
- existing canonical IDs or slugs are conflicts;
- unknown processor, asset, network, or payment method references are conflicts.

## Deferred P3-07 work

Later P3-07 deliveries add:

- durable promotion audit schema and migration;
- Drizzle and Neon atomic backend;
- protected Candidate promotion editor;
- existing canonical target linking;
- field-level provenance controls;
- endpoint, component, accessibility, and artifact tests;
- Phase 3 handoff to Evidence review.
