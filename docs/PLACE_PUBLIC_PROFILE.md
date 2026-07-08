# Place public profile contract

**Status:** Active  
**Last updated:** 2026-07-08

## Purpose

This document defines the practical public information contract for a physical Place.

A Place profile is separate from payment-acceptance verification but may be presented together with verified payment Claims. The purpose is to let a user understand where a Place is, what practical public information is available before visiting, and which official or navigation actions are available.

This document must be read with:

- `docs/PLACES_UX_ACCEPTANCE.md`;
- `docs/PLACES_RECOVERY_PLAN.md`;
- `docs/PHASE4_CLOSURE_PLAN.md` while P4-18 remains active;
- `docs/DATA_MODEL.md`;
- `docs/PUBLIC_EXPORT_SCHEMAS.md`;
- `docs/SOURCE_AND_LICENSE_POLICY.md`;
- `docs/SECURITY_AND_PRIVACY.md`.

## Boundary from payment verification

A Confirmed acceptance Claim proves the documented payment route under the verification policy.

Practical Place information does not by itself prove payment acceptance. Conversely, an otherwise valid Confirmed Claim is not invalid merely because optional Place profile information is unavailable.

The two concerns remain distinct:

```text
reviewed practical Place information
+ reviewed payment acceptance Claims
+ approved public Media
→ combined public Place presentation
```

The combined presentation must not erase field-level source, license, provenance, or review boundaries.

## Canonical practical Place fields

The canonical location model may store the following public-eligible practical fields when reviewed and available:

- `name`;
- `addressLine`;
- `locality`;
- `region`;
- `postalCode`;
- `countryCode`;
- `latitude`;
- `longitude`;
- `websiteUrl`;
- `phone`;
- `description`;
- `openingHours`;
- `amenities`;
- `socialLinks`.

Existing canonical status, visibility, OSM identity, timestamps, provenance, Claims, Evidence, and Media remain separate fields or relationships.

## Operational parity requirement

A practical Place field is not considered operationally complete merely because one or more of the following exists:

- a database column;
- a canonical runtime schema;
- a public export field;
- a staging fixture;
- a UI section.

The complete reviewed path must be traceable where applicable:

```text
source observation or submission
    ↓
safe normalized review snapshot
    ↓
Candidate or proposed-change review
    ↓
reviewer-visible value and explicit decision
    ↓
field source or correction provenance
    ↓
atomic canonical create or correction operation
    ↓
public projection allowlist
    ↓
runtime schema and leakage validation
    ↓
staging review data
    ↓
public Place surfaces
```

P4-18B is responsible for closing this path for the practical profile set before Phase 5 public submission work begins.

Required behavior:

- source values and user-submitted values remain non-canonical until reviewed;
- malformed structured values fail closed or remain unavailable to the canonical editor;
- non-empty factual values receive the required provenance assignment;
- arrays and structured links define duplicate, replacement, and removal behavior;
- canonical correction operations use exact current-state guards and record reviewer decisions;
- stale review state conflicts rather than silently overwriting a newer canonical value;
- replay of the same accepted operation is deterministic;
- public projection occurs only through the normal validated export and release boundary.

## Optional-field policy

`description`, `openingHours`, `amenities`, and `socialLinks` are optional reviewed extensions.

Absence means that CryptoPayMap does not currently publish that information. Absence must not be rendered as a negative fact such as “No amenities” or “Closed”.

Public UI rules:

- omit an unavailable optional section;
- do not invent fallback business facts;
- do not infer hours from third-party popularity data;
- do not infer amenities from category;
- do not infer official social accounts from name similarity;
- do not treat an entity-level headquarters address as a branch address.

## Description

`description` is reviewed public text about the physical Place.

Requirements:

- maximum 5,000 characters in the canonical validation contract;
- no private review notes;
- no unsupported promotional claims presented as verified facts;
- source and provenance remain traceable;
- correction must preserve the reviewed previous/current distinction in the operation history;
- UI may show a shorter excerpt but must not change the meaning.

## Opening hours

The current contract stores `openingHours` as reviewed public text rather than forcing a lossy normalized weekly schedule.

This is intentional. Real opening schedules may include:

- split shifts;
- seasonal hours;
- appointment-only periods;
- public-holiday exceptions;
- temporary operating notices;
- locale-specific expressions.

Requirements:

- maximum 2,000 characters;
- reviewed source basis;
- explicit replacement or removal semantics for corrections;
- no automatic “Open now” calculation unless a future normalized-hours contract explicitly supports it;
- UI labels must not imply real-time operating certainty from stale text.

A future normalized schedule model may be added without repurposing the meaning of the current reviewed text field.

## Amenities

`amenities` is a bounded list of reviewed practical attributes.

Requirements:

- maximum 100 entries;
- each entry maximum 80 characters;
- duplicate entries are removed or rejected before public projection;
- canonical update review distinguishes additions, removals, and complete replacement;
- field provenance must remain meaningful when the stored array changes;
- values describe practical Place attributes, not payment acceptance status;
- controlled vocabulary may be introduced later without treating unrecognized historical values as verified new facts.

Examples of possible reviewed attributes include Wi-Fi, outdoor seating, wheelchair access, or parking, but these examples do not authorize inference from category or external popularity metadata.

## Social links

`socialLinks` is a structured list:

```text
platform
url
handle
```

Requirements:

- `platform` uses a stable lowercase key;
- `url` uses HTTPS in the public projection;
- `handle` is nullable because not every platform exposes a stable human-readable handle;
- maximum 30 links;
- duplicate `platform + url` pairs are rejected;
- canonical update review defines add, remove, replace, and handle-change behavior explicitly;
- links must represent reviewed official accounts or another explicitly approved official relationship;
- user-submitted or guessed accounts do not become public automatically.

## Public Place projection

The public Place projection may include:

- all reviewed public location/address fields;
- `websiteUrl`;
- `phone`;
- `description`;
- `openingHours`;
- `amenities`;
- `socialLinks`;
- eligible public Claims;
- approved public Media;
- public provenance metadata.

Public projection rules remain fail closed:

- Candidate records are excluded;
- private submission contacts are excluded;
- internal review notes are excluded;
- private Evidence and storage keys are excluded;
- unapproved Media is excluded;
- strict runtime schemas reject unknown fields;
- leakage validation remains active.

## Selected-Place presentation

P4-17D and P4-17E established the selected-Place presentation baseline. P4-18C may refine information order and density only within its bounded residual scope.

Desktop selected Place and mobile expanded Place may show the practical fields when available. They must not force the user to open the canonical detail page merely to see already-public routine Place information.

The canonical detail page remains responsible for complete Evidence, history, provenance, long-form record context, stable sharing, and indexing.

The mobile peek state remains compact. Practical profile expansion must not turn peek into a second detail page.

## Navigation boundary

Google Maps and Apple Maps navigation actions are derived from public coordinates and/or reviewed public address information.

Navigation handoff is not stored as a separate business fact. CryptoPayMap provides the destination context; the external map provider performs route guidance.

Official website, phone, social links, and payment instructions remain separate actions from navigation handoff.

## Existing-record correction boundary

Existing canonical Places must be correctable without creating duplicate identities or bypassing normal review.

P4-18B4 audits and completes the correction path for:

- address and locality changes;
- phone addition, replacement, or removal;
- website addition, replacement, or removal;
- description correction;
- opening-hours correction or removal;
- amenities addition, removal, or replacement;
- social-link addition, removal, replacement, or handle change.

The correction path must preserve exact current-state expectations, field-level diff information, correction provenance, reviewer decision identity, replay safety, conflict behavior, and the normal public export/release boundary.

Existing-target Candidate linking is not automatically equivalent to an approved canonical profile correction. The audit must verify the actual operation path rather than infer parity from shared UI or schema fields.

## Validation checklist

Before a practical Place field is considered operationally available:

- the canonical field exists in the approved data model and implementation schema;
- source or submission intake preserves the value safely when the input path supports it;
- the protected review projection exposes only allowed values;
- the operator can intentionally review the value;
- provenance is available at the required field or record level;
- canonical create and existing-record correction behavior are defined where applicable;
- stale-state conflicts and replay behavior are tested;
- public projection allowlisting is explicit;
- runtime schema validation passes;
- privacy and leakage validation passes;
- source and license rules are satisfied;
- staging review data exercises representative populated values;
- selected-Place UI treats absence as unknown, not as a negative fact;
- affected representative screenshots are inspected when public presentation changes.
