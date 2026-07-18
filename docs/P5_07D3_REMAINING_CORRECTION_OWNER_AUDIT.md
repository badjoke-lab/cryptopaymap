# P5-07D3 remaining correction owner audit

**Implementation item:** P5-07D3  
**Status:** Active  
**Last updated:** 2026-07-18

## Purpose

P5-07D3 fixes the canonical ownership boundary for Problem Report correction classes that were deliberately excluded from P5-07D1.

The audit adds no canonical mutation. It prevents asset, network, payment-instruction, country, coordinate, and generic-other corrections from being routed through an incompatible owner merely because a reviewed Submission exists.

## Current reviewed correction kinds

The strict Problem Report contract supports:

```text
asset
network
instructions
location_profile
other
```

`location_profile` contains both practical profile fields and identity-sensitive fields. P5-07D1 owns only:

```text
addressLine
locality
region
postalCode
websiteUrl
phone
description
openingHours
amenities
socialLinks
```

It intentionally rejects:

```text
countryCode
latitude
longitude
```

## Canonical owner matrix

| Correction class | Canonical subject | Required owner | P5-07D3 result |
|---|---|---|---|
| `instructions` | Acceptance Claim | guarded Claim instruction correction transaction | next bounded write slice |
| `asset` | complete Claim Asset set | guarded set replacement transaction with registry validation | separate later slice |
| `network` | complete Claim Asset set | guarded set replacement transaction with registry validation | separate later slice |
| `location_profile.countryCode` | Location identity | guarded identity correction transaction | separate later slice |
| `location_profile.latitude/longitude` | Location identity | guarded coordinate-pair correction transaction | separate later slice |
| `other` | no predetermined canonical subject | explicit specialized classification or no-change outcome | never generic field mutation |

## Why instructions are next

`howToPay` is one bounded Acceptance Claim field. The existing schema already requires non-empty How-to-pay text for confirmed Claims and supports field-level provenance on `acceptance_claim` subjects.

A P5-07D4 transaction can therefore be defined without replacing Claim Assets or changing Entity/Location identity. It must:

- validate the exact common application, Submission, decision event, normalized projection, target Claim, and reviewed version;
- require `wrong_instructions` plus `proposedCorrection.kind = instructions`;
- derive the new `howToPay` value only from the retained approved decision chain;
- create a deterministic private user-submission Source Record;
- replace correction provenance for `acceptance_claim / howToPay`;
- update only the exact non-deleted Claim row;
- create one durable correction receipt;
- commit canonical and provenance writes atomically;
- keep publication pending;
- support exact replay and changed-content conflict.

It must not alter Claim status, visibility, confirmation dates, review deadlines, route, processor, restrictions, Claim Assets, Entity, Location, Evidence, export, or release.

## Asset and network boundary

An asset or network report does not identify a safe row-level operation by itself.

`claim_assets` represents a complete tuple:

```text
asset + network + payment method + optional contract + primary flag
```

Silently editing one component can create an invalid tuple, duplicate a row, remove the only primary row, or falsely imply a payment method. The later owner must operate on an exact before/after set and validate:

- Asset and Network registry identities;
- valid Asset/Network combination policy;
- payment method identity;
- contract-address compatibility;
- primary-row uniqueness;
- complete current set version;
- field-level or row-level Claim Asset provenance;
- no unsupported client-selected deletion.

Asset and network corrections must not be implemented as independent `UPDATE claim_assets SET asset_id = ...` or `network_id = ...` calls.

## Country and coordinate boundary

Country and coordinates are Location identity fields, not practical profile text. They affect geography, generated country/city pages, map position, legacy resolution, duplicate detection, and public export.

A later identity owner must require:

- exact Location version;
- country-code registry validation;
- latitude and longitude supplied and committed as one pair;
- geographic range validation;
- identity and duplicate review implications;
- field-level provenance;
- public export remaining pending after commit.

The Business Claim field-application path is not reused for Problem Reports because it is bound to a different Submission type, relationship decision, one-time receipt, and reviewer contract.

## Generic other boundary

`other` is an intake and review category, not permission for an arbitrary canonical patch.

A reviewed `other` correction may only proceed after it is mapped to a separately specified canonical owner. Otherwise it must remain an approved handoff awaiting classification, or be resolved as no change. No JSON path, table name, field name, SQL fragment, or client-selected patch is accepted.

## Executable audit

The repository audit is enforced by:

```text
node scripts/check-p5-07d3-correction-owner-audit.mjs
```

It verifies:

- all reviewed correction kinds remain explicit;
- P5-07D1 continues to exclude identity-sensitive Location fields;
- Acceptance Claim, Claim Asset, and provenance schemas retain the required ownership primitives;
- Problem Report application code does not directly update Claim Assets or Location identity fields;
- this document and project status preserve the D4 handoff.

## Completion condition

P5-07D3 is complete when:

1. the executable audit runs in the normal `schema:check` chain;
2. all normal repository workflows pass;
3. no database schema or canonical row changes are introduced;
4. P5-07D4 is fixed as the next bounded instruction-correction transaction;
5. asset, network, country, coordinate, and generic-other work remains separately owned.
