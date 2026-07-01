# Candidate promotion field provenance

**Implementation item:** P3-07  
**Current delivery:** P3-07G — field-level provenance contract and persistence  
**Status:** In progress

## Purpose

Candidate promotion must preserve not only which source records were reviewed, but which source supports each factual canonical field. P3-07G adds an optional explicit field provenance plan to both promotion paths.

When a plan is supplied, every non-null factual field on newly created records must have at least one source assignment. The assignments are normalized, included in the idempotency fingerprint, and written to `provenance_links.field_path` inside the same atomic transaction as the canonical change.

## Supported subjects

- `entity`
- `location`
- `acceptance_claim`
- `claim_asset`

Operational fields such as IDs, slugs, status, visibility, timestamps, and review state are not treated as source-derived factual fields in this delivery.

## New canonical target

All field assignments use role `origin` because the reviewed Candidate source set is the origin of the newly created private canonical records.

Required coverage includes every non-null supported field on:

- the Entity draft;
- the optional Location draft;
- the hidden candidate Acceptance Claim;
- every Claim Asset combination.

## Existing canonical target

Existing Entity and Location records are not rewritten. Candidate sources may be attached to selected identity fields only with role `attribution`.

The new hidden candidate Claim and Claim Assets use role `origin` and require complete supported-field coverage.

At least one Entity or Location field attribution is required when an explicit existing-target plan is supplied.

## Source boundary

Every assigned source record must belong to the exact Candidate source set that was loaded and rechecked for the atomic transaction. Sources outside that set are rejected.

Duplicate source IDs, duplicate subject-field-role assignments, unknown fields, and subjects outside the reviewed draft are rejected.

## Compatibility boundary

P3-07G keeps the pre-existing record-level provenance behavior when `provenanceAssignments` is omitted. This avoids invalidating unfinished clients and preserves the replay fingerprint of earlier requests.

Once reviewer-facing field controls are integrated and validated, the compatibility path can be retired through a separate reviewed change.

## Atomic persistence

Field-level rows are inserted in the same Drizzle/Neon batch as:

- canonical Entity or target link selection;
- optional Location creation;
- hidden candidate Claim creation;
- Claim Asset creation;
- Candidate canonical-link update;
- pending legacy mapping resolution;
- durable promotion decision receipt.

A provenance constraint failure rolls back the entire operation.

## Exclusions

- no Evidence verification decisions;
- no public visibility or publication;
- no mutation of existing canonical identity fields;
- no live Cloudflare Access or live database verification claim.
