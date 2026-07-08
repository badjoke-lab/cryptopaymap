# Candidate promotion field provenance

**Implementation items:** P3-07G, P4-18B2  
**Status:** Active contract  
**Last updated:** 2026-07-08

## Purpose

Candidate promotion must preserve not only which source records were reviewed, but which source supports each factual canonical field.

P3-07G established the optional core field-provenance contract and atomic persistence. P4-18B2 makes field-level provenance mandatory at the protected reviewer-facing Promotion editor boundary and extends new physical Location promotion to the practical Place profile fields.

The core transaction contract retains its older record-level compatibility behavior for non-editor callers until a separate reviewed compatibility change removes it. The protected editor API does not use that fallback.

## Supported subjects

- `entity`
- `location`
- `acceptance_claim`
- `claim_asset`

Operational fields such as IDs, slugs, status, visibility, timestamps, and review state are not treated as source-derived factual fields.

## New canonical target

All field assignments use role `origin` because the reviewed Candidate source set is the origin of the newly created private canonical records.

Required coverage includes every non-null supported field on:

- the Entity draft;
- the optional Location draft;
- the hidden candidate Acceptance Claim;
- every Claim Asset combination.

For a physical Location, the supported factual field set includes:

- name;
- address line;
- locality;
- region;
- postal code;
- country code;
- latitude and longitude;
- website;
- phone;
- description;
- opening hours;
- amenities;
- social links;
- OSM type and ID.

Empty or unavailable optional practical fields do not require source assignment. Non-empty values, including non-empty amenities and social-link arrays, require at least one explicit source assignment.

## Practical profile editor behavior

The protected Promotion editor may prefill practical fields from the validated B1 physical Candidate source snapshot.

The reviewer can intentionally review:

- phone;
- description;
- opening-hours source text;
- amenities;
- canonical-eligible official social links.

Structured form values are normalized before request construction.

Amenities:

- may be entered one per line or comma-delimited;
- are trimmed;
- empty values are removed;
- exact duplicates are collapsed deterministically;
- bounded item and list limits are enforced.

Social links:

```text
platform | https://url | optional handle
```

- one link per line;
- canonical HTTPS URL required;
- bounded list size;
- duplicate `platform + URL` pairs rejected;
- malformed lines fail closed.

Source-review values that contain only a handle or a non-HTTPS source URL remain visible as source-only review information. They are not silently promoted and the editor does not invent canonical URLs from handles.

## Protected editor API boundary

The reviewer-facing Promotion request schema requires a non-empty `provenanceAssignments` plan.

Therefore:

- omitted plans are rejected before the Promotion transaction service;
- empty plans are rejected before the Promotion transaction service;
- the exact Candidate version and complete source set are still rechecked;
- the transaction service still validates full supported-field coverage;
- malformed structured practical values are rejected before request commit;
- Promotion still creates hidden canonical records and a hidden candidate Claim only;
- Promotion does not verify or publish the Claim.

## Existing canonical target

Existing Entity and Location records are not rewritten by the existing-target link workflow.

Candidate sources may be attached to selected existing identity fields only with role `attribution`. The new hidden candidate Claim and Claim Assets use role `origin` and require complete supported-field coverage.

At least one Entity or Location field attribution is required when an existing-target plan is supplied.

P4-18B2 does not reinterpret existing-target linking as a practical-profile correction operation. Existing practical-profile mutation remains the P4-18B4 correction-path responsibility.

The existing-target search and link UI may continue to present only the bounded identity fields it can safely attribute. Practical profile fields must not be added to that path merely to create the appearance of correction support.

## Source boundary

Every assigned source record must belong to the exact Candidate source set that was loaded and rechecked for the atomic transaction. Sources outside that set are rejected.

Duplicate source IDs, duplicate subject-field-role assignments, unknown fields, and subjects outside the reviewed draft are rejected.

## Compatibility boundary

The core P3-07 transaction contract retains pre-existing record-level provenance behavior when `provenanceAssignments` is omitted. This preserves compatibility for non-editor callers that still use the old core service contract.

P4-18B2 narrows the reviewer-facing boundary:

- `candidatePromotionEditorRequestSchema` requires a non-empty field-level plan;
- the browser editor generates the plan from explicit field-source controls;
- the protected API rejects omitted or empty editor plans.

Removing the core compatibility path remains a separate reviewed change unless a later integration audit proves that no supported caller depends on it.

## Atomic persistence

Field-level rows are inserted in the same Drizzle/Neon batch as:

- canonical Entity or target-link selection;
- optional Location creation;
- hidden candidate Claim creation;
- Claim Asset creation;
- Candidate canonical-link update;
- pending legacy mapping resolution;
- durable Promotion decision receipt.

A provenance constraint failure rolls back the entire operation.

## P4-18B2 completion checks

- B1 practical source values reach the new-target Promotion workspace.
- Reviewer controls exist for supported practical Location fields.
- Amenities and social-link form parsing is deterministic and fail closed.
- New-target field descriptors include practical profile fields.
- Provenance validation allows those canonical field paths.
- Every non-empty practical value requires explicit source coverage.
- Protected editor requests cannot omit the field-level plan.
- Exact Candidate version and complete source-set guards remain unchanged.
- Existing-target linking remains attribution plus new-Claim creation, not practical-profile mutation.
- No verification or publication behavior is added.

## Exclusions

- no Evidence verification decisions;
- no public visibility or publication;
- no mutation of existing canonical identity fields;
- no P4-18B3 end-to-end public projection integration claim;
- no P4-18B4 existing-record correction transaction;
- no live Cloudflare Access or live database verification claim.
