# Place public profile contract

**Status:** Active  
**Last updated:** 2026-07-07

## Purpose

This document defines the practical public information contract for a physical Place.

A Place profile is separate from payment-acceptance verification but may be presented together with verified payment Claims. The purpose is to let a user understand where a Place is, what practical public information is available before visiting, and which official or navigation actions are available.

This document must be read with:

- `docs/PLACES_UX_ACCEPTANCE.md`;
- `docs/PLACES_RECOVERY_PLAN.md`;
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
- UI may show a shorter excerpt but must not change the meaning.

## Opening hours

The initial recovery contract stores `openingHours` as reviewed public text rather than forcing a lossy normalized weekly schedule.

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
- no automatic “Open now” calculation unless a future normalized-hours contract explicitly supports it;
- UI labels must not imply real-time operating certainty from stale text.

A future normalized schedule model may be added without repurposing the meaning of the current reviewed text field.

## Amenities

`amenities` is a bounded list of reviewed practical attributes.

Requirements:

- maximum 100 entries;
- each entry maximum 80 characters;
- duplicate entries are removed or rejected before public projection;
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

P4-17D and P4-17E consume this profile contract.

Desktop selected Place and mobile expanded Place may show the practical fields when available. They must not force the user to open the canonical detail page merely to see already-public routine Place information.

The canonical detail page remains responsible for complete Evidence, history, provenance, long-form record context, stable sharing, and indexing.

## Navigation boundary

Google Maps and Apple Maps navigation actions are derived from public coordinates and/or reviewed public address information.

Navigation handoff is not stored as a separate business fact. CryptoPayMap provides the destination context; the external map provider performs route guidance.

Official website, phone, social links, and payment instructions remain separate actions from navigation handoff.

## Validation checklist

Before a practical Place field is considered publicly available:

- the canonical field exists in the approved data model;
- ingestion or promotion preserves the field intentionally;
- provenance is available at the required field or record level;
- public projection allowlisting is explicit;
- runtime schema validation passes;
- privacy and leakage validation passes;
- source and license rules are satisfied;
- selected-Place UI treats absence as unknown, not as a negative fact.
