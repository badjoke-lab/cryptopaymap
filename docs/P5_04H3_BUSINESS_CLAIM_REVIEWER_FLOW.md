# P5-04H3 Business Claim field-application reviewer flow

**Implementation item:** P5-04H3  
**Status:** Active  
**Started:** 2026-07-14

## Purpose

Expose the completed P5-04H1 projection and P5-04H2 durable application transaction through one protected, operator-safe reviewer flow.

## Boundaries

P5-04H3 will:

- require a verified administration identity authorized by `CPM_ADMIN_CLAIM_FIELD_APPLICATION_SUBJECTS`;
- expose only a bounded private administration API;
- require one exact Business Claim Submission UUID and one exact approved relationship-decision UUID;
- require one UUID `Idempotency-Key` for application POST requests;
- present current and submitted values without exposing protected contact, proof, authority statement, provider response, account, or permission material;
- require complete accept/reject partitions for every submitted Entity, Location, and payment proposal;
- copy values only from the normalized Claim projection;
- bind POST decisions to the exact workspace Submission, relationship, Entity, and Location versions;
- return bounded committed or replayed receipts;
- fail closed for stale, malformed, unauthorized, incomplete, leaking, or conflicting operations.

P5-04H3 will not:

- add a public Claim route;
- grant an owner account or editing permission;
- allow arbitrary replacement values;
- create public Evidence or Media;
- convert private payment drafts directly into public acceptance claims;
- trigger export or publication;
- expose protected verification material.

## Completion gate

An authorized operator can load one safe field-application workspace, submit explicit complete field decisions with an exact idempotency key, receive one durable committed or replayed receipt, and cannot bypass any Claim, relationship, canonical-version, privacy, or publication boundary.
