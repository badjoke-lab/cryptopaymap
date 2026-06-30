# Candidate promotion contract

**Implementation item:** P3-07  
**Current delivery:** P3-07B — durable audit persistence and Drizzle transaction backend  
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
  -> record-level origin provenance
  -> Candidate status promoted
  -> pending legacy mapping resolved
  -> durable replay receipt
```

## Completed in P3-07A

P3-07A established and tested:

- the `candidate:promote` capability;
- physical-place and online-service promotion contracts;
- explicit Entity, Location, Claim, and Claim Asset drafts;
- exact Candidate version and source-record expectations;
- hidden canonical output;
- request replay and conflicting request reuse;
- copy-on-write rollback proof in the in-memory backend;
- legacy mapping behavior.

## P3-07B scope

P3-07B adds the production persistence boundary:

- a private `candidate_promotion_decisions` audit table;
- request, actor, Candidate version, canonical target, source set, and receipt persistence;
- one durable receipt per request UUID;
- one promotion audit record per Candidate;
- a Drizzle backend for Neon HTTP batch transactions;
- transaction guards that lock and recheck the Candidate and its exact source-record set;
- processor identity validation;
- canonical Entity, optional Location, Claim, and Claim Asset insertion;
- record-level origin provenance insertion;
- pending legacy mapping resolution;
- Candidate status and canonical-link updates;
- exact replay after committed requests;
- conflict mapping for stale state, foreign-key, uniqueness, and check failures.

## Supported Candidate types

```text
physical_place
online_service
```

Other Candidate types remain private and are rejected by the promotion input contract.

## Canonical boundaries

Physical-place promotion requires:

- Entity type `merchant`;
- one hidden canonical Location;
- Claim scope `location_specific`;
- canonical path `/place/{location-slug}`.

Online-service promotion requires:

- Entity type `online_service`;
- no Location;
- Claim scope `online_service`;
- canonical path `/service/{entity-slug}`.

## Verification and publication boundary

Every newly promoted record remains private:

```text
Entity visibility       hidden
Location visibility     hidden
Claim status            candidate
Claim visibility        hidden
```

Promotion cannot assign Confirmed, Stale, Ended, public visibility, confirmation timestamps, review deadlines, Evidence decisions, verification events, media decisions, or public exports.

How-to-pay text may be normalized during promotion, but it is not treated as verified until P3-08.

## Transaction boundary

One Neon batch must either commit all of the following or none:

- Candidate version and source-set guards;
- canonical records;
- Claim Asset combinations;
- provenance links;
- legacy mapping changes;
- Candidate status and canonical links;
- durable promotion receipt.

Known PostgreSQL guard, foreign-key, uniqueness, and check failures are returned as promotion conflicts. Unknown infrastructure failures remain backend failures.

## Replay behavior

The request UUID is the idempotency identity.

- exact replay returns the stored receipt with `state = replayed`;
- reuse with different content is a conflict;
- a second request for an already promoted Candidate is a conflict;
- concurrent exact requests converge on the durable receipt;
- stale Candidate state or changed provenance causes the batch to roll back.

## Remaining P3-07 work

Later deliveries add:

- protected Candidate promotion endpoint and editor;
- existing canonical-target linking;
- field-level provenance controls;
- route, component, accessibility, and staging-artifact checks;
- Phase 3 handoff to Evidence review.
