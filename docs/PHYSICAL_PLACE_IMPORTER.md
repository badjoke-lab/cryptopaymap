# CryptoPayMap physical-place candidate importer

## Purpose

P2-13 imports legacy physical-place rows into the private source and candidate layers. It does not create canonical entities, canonical locations, acceptance claims, verification events, or public export records.

```text
legacy physical row
  -> strict row validation
  -> immutable source-record draft
  -> private physical-place candidate draft
  -> pending legacy-ID mapping
  -> duplicate review signals
```

Promotion remains a separate administrative review action in Phase 3.

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
- HTTP or HTTPS website;
- paired OpenStreetMap type and ID;
- `payment:*` source tags;
- observation time;
- source URL;
- legacy verification label.

HTML-like names, invalid coordinates, unsupported URL schemes, malformed OSM identity pairs, and unknown fields fail row validation.

## Deterministic identity

The importer derives stable UUID-shaped identifiers from SHA-256 material for:

- the private source candidate;
- each immutable source-record observation;
- the pending legacy-ID mapping.

The candidate identity is stable for a legacy source ID. The source-record identity includes the canonical content hash, so a changed observation can be represented separately while an exact replay remains idempotent.

The input checksum covers the validated and rejected batch outcome together with source and importer metadata.

## Candidate-only boundary

Every accepted row produces:

- `candidate_type = physical_place`;
- `candidate_status = new`;
- no canonical entity ID;
- no canonical location ID;
- one origin relationship to its source record;
- one `cryptopaymap_v2` legacy mapping in `pending` state;
- normalized review data for later administration.

The import plan has no acceptance-claim field and reports `automaticConfirmedCount = 0`.

Legacy verification labels and payment tags are preserved as source and review data. They do not map to Confirmed status.

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

- the same legacy ID with identical normalized content is recorded as a replay and does not create a second draft;
- the same legacy ID with different content is rejected as a conflicting legacy identity;
- invalid rows are returned as structured rejections.

Across runs, stable candidate and source-record identities support idempotent persistence by the later database writer.

## Duplicate review signals

The importer emits signals without merging candidates.

```text
shared_osm_identity
  strength: strong

same_name_and_coordinates
  strength: review
```

A signal is evidence for administrative review, not an automatic duplicate decision. Brand and branch identity remain separate.

## Ten-record proof

The runtime check imports ten representative physical rows and verifies:

- all ten remain private new candidates;
- no canonical target is assigned;
- all legacy mappings remain pending;
- no acceptance claim is produced;
- repeated execution produces the same checksum and identifiers;
- invalid rows are rejected independently;
- exact replays are collapsed;
- shared OSM identity creates a review signal rather than a merge.

## Excluded from P2-13

- database writes and transaction handling;
- canonical promotion;
- Evidence threshold evaluation;
- public JSON generation;
- online-service imports;
- live legacy database access;
- Cloudflare or Neon credentials.

P2-14 adds the online-service importer and the Phase 2 integration audit. Phase 3 adds the administrative review and persistence path.
