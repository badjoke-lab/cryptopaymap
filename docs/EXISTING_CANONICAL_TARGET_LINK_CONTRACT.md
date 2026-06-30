# Existing canonical target link contract

**Implementation item:** P3-07  
**Current delivery:** P3-07D — existing canonical target link contract and atomic test backend  
**Status:** In progress

## Purpose

A reviewed Candidate may correspond to a canonical Entity or Location that already exists. P3-07D defines the alternative promotion path that reuses that target instead of creating duplicate canonical identity records.

```text
reviewed Candidate
  -> explicit candidate:promote authorization
  -> exact Candidate and source-set checks
  -> exact canonical Entity / Location version checks
  -> exact existing Claim-set check
  -> create one hidden candidate Claim and Claim Assets
  -> attribute Candidate sources to the existing identity target
  -> update Candidate and pending legacy mappings
  -> durable replay receipt in the production delivery
```

## Supported target shapes

Physical-place Candidate:

- existing Entity type `merchant`;
- existing non-deleted Location belonging to that Entity;
- Location status `active`, `temporarily_closed`, or `unknown`;
- canonical path `/place/{location-slug}`;
- new Claim scope `location_specific`.

Online-service Candidate:

- existing Entity type `online_service`;
- no Location target;
- non-null Entity slug;
- canonical path `/service/{entity-slug}`;
- new Claim scope `online_service`.

Inactive, ended, closed, or deleted targets are not linkable.

## Exact review snapshot

The request fixes all mutable review inputs:

- Candidate type and `updatedAt`;
- complete Candidate source-record ID set;
- Entity `updatedAt`;
- optional Location `updatedAt`;
- canonical path;
- complete existing non-deleted Claim ID set for the selected target.

Any mismatch is a conflict. This prevents a reviewer from linking against a target that changed after it was inspected.

## Creation boundary

Existing-target linking does not create or edit:

- Entity identity fields;
- Location identity or coordinates;
- existing Acceptance Claims;
- existing Claim Assets;
- Evidence, verification events, or media.

It creates only:

- one hidden `candidate` Acceptance Claim;
- its explicit Claim Asset combinations;
- provenance links;
- Candidate canonical links;
- legacy mapping changes;
- the replay receipt in the durable backend.

## Provenance roles

Candidate source records are attached to existing identity targets with role `attribution`. They are not treated as the origin of pre-existing Entity or Location fields.

The same source records are attached to the newly created Claim and Claim Assets with role `origin`.

## Atomicity and replay

The operation is all-or-nothing. Exact request replay returns the original receipt. Reusing the request UUID with different content is a conflict. Target version, target Claim set, Candidate state, registry references, canonical path, and source provenance are all checked before commit.

P3-07D proves these semantics with a copy-on-write in-memory backend. The Drizzle/Neon backend, target search workspace, protected endpoint, and editor controls follow in the next delivery.

## Exclusions

- no verification or publication;
- no field-level provenance editing;
- no merge of existing Claims;
- no change to existing canonical identity records;
- no live Cloudflare Access or database claim.
