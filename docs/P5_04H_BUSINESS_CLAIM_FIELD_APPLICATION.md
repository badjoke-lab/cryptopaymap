# P5-04H Business Claim field-proposal review and canonical application

**Implementation item:** P5-04H1  
**Status:** Active  
**Started:** 2026-07-14

## Purpose

Review the Entity-profile, Location-profile, and payment-information proposals carried by an approved Business Claim and apply only explicitly accepted proposal fields through a separately authorized canonical transaction.

P5-04H does not treat a verified representative relationship as editing permission. Every canonical change remains an independent review decision.

## Delivery slices

```text
P5-04H1 — strict field-level decision and projection contract
P5-04H2 — durable exact-state canonical persistence and provenance
P5-04H3 — protected reviewer API/workspace and integration audit
```

## Authorization boundary

P5-04H uses a dedicated `submission:claim-fields:apply` capability separate from:

- protected Claim read access;
- Claim workflow transitions;
- verification preparation or execution;
- representative-relationship decisions;
- ordinary Location correction;
- Candidate promotion;
- export and publication.

A caller authorized to approve a representative relationship is not automatically authorized to mutate canonical data.

## Eligible Claim boundary

One application requires:

- one Business Claim Submission resolved as `approved`;
- one exact expected Submission update timestamp;
- one exact P5-04G approved relationship-decision event;
- one valid active private representative relationship owned by the same Submission;
- one valid normalized Claim projection;
- matching target type, target ID, claimant role, preparation ID, and execution ID;
- explicit requested scopes for every reviewed proposal family;
- one application request UUID.

## Field-level decisions

Entity and Location proposal decisions are explicit partitions of the proposed changed fields:

```text
acceptedFields
rejectedFields
```

Every proposed changed field must appear exactly once in the accepted or rejected set. Fields absent from the submitted proposal cannot be introduced by the application request.

Accepted values are copied from the validated normalized Claim projection. The reviewer cannot substitute arbitrary values inside the application request.

Payment proposals are reviewed by stable proposal index. Every submitted payment proposal must be accepted or rejected exactly once. H1 produces bounded canonical payment drafts; durable payment-record persistence is connected in H2.

## Exact canonical state

Accepted Entity or Location changes require the exact canonical `updatedAt` value reviewed by the operator. A stale target fails closed.

Entity and Location updates must preserve the strict canonical schemas, including:

- non-null Entity name;
- non-null Location country code;
- complete latitude and longitude pairs;
- bounded unique amenities;
- bounded unique social links;
- unchanged fields retained exactly;
- no deletion, visibility, lifecycle, OSM identity, or parent-Entity mutation.

## Projection result

H1 produces a bounded application projection containing:

- exact Claim, relationship-decision, and target identity;
- accepted and rejected field paths;
- canonical before and after snapshots for changed profile families;
- accepted and rejected payment proposal indexes;
- accepted payment drafts copied from the normalized Claim;
- deterministic request fingerprint inputs;
- no contact, proof, authority statement, provider response, account, or editing-permission material.

## Persistence boundary

H2 will persist, atomically:

- exact-state Entity and/or Location updates;
- accepted payment records or canonical payment drafts;
- field-level provenance bound to the Claim Submission and relationship decision;
- one durable application receipt;
- one private application audit event.

An identical application UUID replays the stored result. Reuse with changed Claim, relationship, target versions, field decisions, or payment decisions fails as an idempotency conflict.

## Failure behavior

P5-04H fails closed for:

- unauthorized applicants;
- missing, non-Claim, non-approved, or stale Submissions;
- missing or invalid approved representative relationships;
- malformed normalized projections;
- target or relationship mismatches;
- decisions that omit, duplicate, or invent proposal fields;
- accepted fields outside requested scopes;
- stale canonical target versions;
- invalid projected canonical records;
- no-op accepted changes;
- private-value leakage;
- backend or response-validation failure.

## Non-effects

P5-04H does not:

- grant account or editing permission;
- accept fields implicitly because a relationship was approved;
- mutate fields omitted from the submitted Claim proposal;
- mutate lifecycle, visibility, parent, OSM identity, Evidence, or Media fields;
- publish the representative relationship;
- bypass canonical provenance;
- export or publish data directly;
- expose a public Claim route.

## H1 completion gate

An authorized reviewer can create one strict, deterministic application projection that partitions every submitted Entity, Location, and payment proposal into accepted or rejected decisions, copies only submitted values, validates exact canonical before/after records, and rejects stale, malformed, unauthorized, incomplete, invented, or leaking requests.

## Next

P5-04H2 will persist the H1 projection with exact canonical guards, durable provenance, application receipts, replay recovery, and atomic rollback.
