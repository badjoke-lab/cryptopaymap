# Practical Place profile data model extension

**Status:** Active  
**Implementation boundary:** P4-18B  
**Last updated:** 2026-07-08

## Purpose

This document records the additive canonical Location fields and operational requirements introduced for practical Place profiles.

It supplements the `locations` section of `docs/DATA_MODEL.md` and must be read with:

- `docs/DATA_MODEL.md`;
- `docs/PLACE_PUBLIC_PROFILE.md`;
- `docs/PHASE4_CLOSURE_PLAN.md`;
- `docs/PUBLIC_EXPORT_SCHEMAS.md`;
- `docs/SOURCE_AND_LICENSE_POLICY.md`.

The runtime database schema and canonical validation contracts already include these fields. P4-18B is responsible for closing the remaining operator, provenance, correction, and integration path.

## Additive `locations` fields

The canonical `locations` model includes these practical profile fields in addition to the identity, address, coordinate, status, visibility, website, phone, OSM, and timestamp fields already described in `docs/DATA_MODEL.md`.

| Column | Type | Notes |
|---|---|---|
| `description` | text nullable | Reviewed public Place description. |
| `opening_hours` | text nullable | Reviewed public hours text; not a real-time open/closed calculation. |
| `amenities` | text array nullable | Bounded reviewed practical attributes. |
| `social_links` | jsonb nullable | Bounded structured official social-link records. |

`social_links` entries use the canonical shape:

```text
platform
url
handle
```

where `handle` is nullable.

## Canonical and public boundaries

These fields are canonical Location facts only after explicit review. Their presence in a source record, Candidate snapshot, user submission, staging fixture, or public-schema type does not make them canonical.

The required logical flow is:

```text
source or submission value
    ↓
private review projection
    ↓
reviewer decision
    ↓
field provenance
    ↓
canonical Location create or correction transaction
    ↓
validated public projection
```

The following boundaries remain mandatory:

- source material is not canonical data;
- Candidate values are not canonical data;
- submission values are not canonical data;
- canonical values are not automatically public;
- public projection never serializes an operational table directly;
- practical profile facts do not verify payment acceptance;
- ownership verification does not automatically approve practical profile corrections.

## Field provenance

P4-18B must verify field-level provenance coverage for practical Location facts.

For non-empty reviewed values, the review and write path must support the required source or correction provenance for:

- `description`;
- `openingHours` / `opening_hours`;
- `amenities`;
- `socialLinks` / `social_links`;
- existing address, website, and phone fields where the same operation handles them.

Implementation naming may use camelCase in TypeScript contracts and snake_case in database field paths where required. The provenance layer must use a stable documented field-path convention and tests must reject silent mismatches.

Record-level origin provenance may remain useful, but it does not replace field-level review when a workflow presents independent factual values for approval.

## Structured update semantics

### Description and opening hours

Scalar text fields support:

- add when currently absent;
- replace with a reviewed value;
- remove after an explicit reviewed decision.

An empty form value must not silently mean removal unless the operation contract explicitly distinguishes unchanged, set, and clear states.

### Amenities

The canonical operation must distinguish:

- unchanged;
- add one or more reviewed values;
- remove one or more reviewed values;
- replace the complete reviewed set;
- clear the reviewed set.

Duplicate entries must be rejected or normalized deterministically before canonical persistence and before public projection.

### Social links

The canonical operation must distinguish:

- unchanged;
- add a reviewed official link;
- remove an obsolete link;
- replace a URL;
- change or clear a handle;
- replace or clear the complete reviewed set.

Duplicate `platform + url` pairs are not permitted in the public contract.

## Existing-record correction requirements

P4-18B4 must verify or implement a guarded correction operation for already canonical Places.

A correction operation must provide:

- exact current canonical version or equivalent current-state expectation;
- explicit field-level diff;
- reviewer identity and decision time;
- accepted source or correction provenance;
- atomic persistence;
- deterministic request replay;
- conflict on stale expected state;
- an auditable application receipt;
- no direct public publication.

Existing-target Candidate linking must not be assumed to satisfy canonical profile correction requirements merely because it can associate a Candidate with an existing identity.

## Public projection requirements

A practical profile field may enter the public Place projection only when:

- the canonical Location value is eligible for publication;
- the field is explicitly allowlisted;
- the public runtime schema accepts the shape;
- structured duplicates and malformed values are rejected;
- privacy and leakage checks pass;
- source and license requirements are satisfied;
- absence remains absence rather than an inferred negative fact.

## P4-18B completion matrix

P4-18B must record evidence for each practical field class across these boundaries:

| Boundary | Address/contact | Description | Hours | Amenities | Social links |
|---|---|---|---|---|---|
| Source or Candidate review contract | Required | Required | Required | Required | Required |
| Protected operator handling | Required | Required | Required | Required | Required |
| Field provenance | Required where factual value is written | Required | Required | Required | Required |
| New canonical create path | Required | Required | Required | Required | Required |
| Existing canonical correction path | Required | Required | Required | Required | Required |
| Public projection | Required | Required | Required | Required | Required |
| Runtime and leakage validation | Required | Required | Required | Required | Required |
| Staging review fixture | Representative | Representative | Representative | Representative | Representative |
| Public surface review | Required | Required | Required | Required | Required |

A matrix row is not complete because an adjacent layer happens to carry the same TypeScript property. The actual operation and validation path must be demonstrated.
