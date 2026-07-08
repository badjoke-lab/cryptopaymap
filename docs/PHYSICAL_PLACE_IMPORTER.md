# CryptoPayMap physical-place candidate importer

## Purpose

P2-13 imports legacy physical-place rows into the private source and candidate layers. P4-18B1 extends the private review contract so supported practical Place values are preserved and normalized for protected review.

The importer does not create canonical entities, canonical locations, acceptance claims, verification events, or public export records.

```text
legacy physical row
  -> strict row validation
  -> raw source preservation
  -> normalized immutable source-record payload
  -> private physical-place candidate draft
  -> normalized private review data
  -> pending legacy-ID mapping
  -> duplicate review signals
```

Promotion remains a separate protected review action. Practical source values do not become canonical or public because the importer accepted them.

## Input envelope

Each import run supplies:

- registered source UUID;
- optional license UUID;
- import-batch UUID;
- fetch time;
- semantic importer version;
- one or more untrusted legacy rows.

The batch envelope is validated separately from each row. A malformed row is rejected without aborting valid rows in the same batch.

## Accepted legacy fields

A physical row may contain:

- legacy ID and legacy path;
- name;
- address fields;
- ISO country code;
- latitude and longitude;
- category candidate;
- HTTP or HTTPS website or supported legacy website aliases;
- phone;
- description, `about`, or compatible short-description alias;
- opening-hours text when supplied by a compatible source adapter;
- amenities as a string list, JSON list string, or comma/newline-delimited source string;
- bounded structured social-link proposals;
- supported legacy X/Twitter, Instagram, and Facebook URL or handle fields;
- paired OpenStreetMap type and ID;
- `payment:*` source tags;
- observation time;
- source URL;
- legacy verification label.

HTML-like names, invalid coordinates, unsupported URL schemes, malformed OSM identity pairs, malformed practical fields, and unknown row fields fail row validation.

Private or unrelated source payload fields are not accepted into the normalized row contract.

## Raw and normalized source separation

The source record keeps the unmodified accepted input row separately from its normalized review record:

```text
rawRecord
normalizedRecord
```

Normalization does not make a source value canonical. It only creates a stable private review shape.

The normalized practical review shape includes:

- `websiteUrl`;
- `phone`;
- `description`;
- `openingHours`;
- `amenities`;
- `socialLinks`.

Legacy aliases are removed from the normalized record after their value is mapped. The raw source row remains available inside the private source record boundary.

## Practical-field normalization

### Website

Supported website aliases are resolved to one normalized `websiteUrl` source value using the documented compatibility precedence. Only HTTP or HTTPS source URLs are accepted.

### Description

The normalized source description uses the first available compatible source field in this order:

1. `description`;
2. `about`;
3. `aboutShort`;
4. `about_short`.

This is a review-source compatibility rule, not a canonical approval rule.

### Opening hours

`openingHours` and `opening_hours` may supply reviewed source text. The importer does not calculate real-time open or closed state.

### Amenities

Amenities are normalized by:

- accepting bounded arrays or compatible legacy source strings;
- trimming values;
- removing empty values;
- preserving first-seen order;
- collapsing exact duplicates;
- rejecting malformed non-text values;
- enforcing the bounded item and list limits used by the practical profile review contract.

### Social values

The private review social shape is:

```text
platform
url
handle
```

At least one of `url` or `handle` is required.

Supported legacy X/Twitter, Instagram, and Facebook values are normalized into this review shape. Exact duplicate normalized entries are collapsed while conflicting or distinct entries remain visible for later reviewer judgment.

A handle-only legacy value remains a handle-only review value. The importer does not invent a public URL from a handle. HTTP and HTTPS source social URLs are preserved for review; the stricter HTTPS canonical/public requirement is enforced by later review and public projection boundaries.

## Deterministic identity

The importer derives stable UUID-shaped identifiers from SHA-256 material for:

- the private source candidate;
- each immutable source-record observation;
- the pending legacy-ID mapping.

The candidate identity is stable for a legacy source ID. The source-record identity includes the source content hash, so a changed observation can be represented separately while an exact replay remains idempotent.

The input checksum covers the validated and rejected batch outcome together with source and importer metadata.

## Candidate-only boundary

Every accepted row produces:

- `candidate_type = physical_place`;
- `candidate_status = new`;
- no canonical entity ID;
- no canonical location ID;
- one origin relationship to its source record;
- one `cryptopaymap_v2` legacy mapping in `pending` state;
- normalized private review data for later administration.

The import plan has no acceptance-claim field and reports `automaticConfirmedCount = 0`.

Legacy verification labels and payment tags are preserved as source and review data. They do not map to Confirmed status.

Practical profile source values are also review data only. They do not create or update canonical Location fields automatically.

## Payment tags

Affirmative `payment:*` tags are surfaced as review signals only.

The importer does not infer:

- a network from an asset symbol;
- an on-chain method from a Bitcoin tag;
- a Lightning invoice method from a generic Lightning tag;
- a merchant's current asset set from processor capability;
- a How-to-pay instruction.

A reviewer must resolve asset, network, route, payment method, Evidence, and instructions before canonical promotion.

## Replay and conflict handling

Within one batch:

- the same legacy ID with identical source content is recorded as a replay and does not create a second draft;
- the same legacy ID with different source content is rejected as a conflicting legacy identity;
- invalid rows are returned as structured rejections.

Across runs, stable candidate and source-record identities support idempotent persistence by the later database writer.

## Duplicate review signals

The importer emits signals without merging Candidates.

```text
shared_osm_identity
  strength: strong

same_name_and_coordinates
  strength: review
```

A signal is Evidence for administrative review, not an automatic duplicate decision. Brand and branch identity remain separate.

Practical-field similarity does not automatically merge Candidates.

## P4-18B1 regression boundary

P4-18B1 must cover:

- populated practical source values;
- absent practical values;
- alias normalization;
- amenities duplicate normalization;
- exact social-link duplicate normalization;
- handle-only social preservation without URL invention;
- malformed practical-value rejection;
- unknown/private field rejection from the normalized source contract;
- raw/normalized source separation;
- Candidate safe snapshot allowlisting;
- unchanged replay and duplicate-signal behavior;
- unchanged source and effective-license metadata boundaries.

## Excluded from this importer boundary

- database writes and transaction handling;
- canonical promotion UI and field-source assignment;
- canonical Location create or correction operations;
- Evidence threshold evaluation;
- public JSON generation;
- online-service imports;
- live legacy database access;
- live infrastructure verification.

P4-18B2 continues with Promotion editor and field provenance parity. P4-18B3 continues through canonical persistence and public projection integration. P4-18B4 audits and completes the existing-record correction path.
