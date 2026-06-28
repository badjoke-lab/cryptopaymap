# CryptoPayMap online-service candidate importer

## Purpose

P2-14 imports legacy online acceptance records into the private source and candidate layers. It does not create canonical entities, acceptance claims, claim assets, verification events, or public export records.

```text
legacy online row
  -> strict row validation
  -> scope classification
  -> immutable source-record draft
  -> private candidate draft
  -> pending legacy-ID mapping
  -> duplicate review signals
```

Promotion remains a separate administrative review action.

## Importable candidate types

The main candidate directory accepts these legacy record types:

- `online_service`
- `payment_processor`
- `payment_program`
- `platform`

The type is a review proposal. It does not establish a canonical entity or prove merchant acceptance.

## Explicitly out-of-scope types

These types are rejected from the main Places and Online Services candidate directory:

- `crypto_card`
- `gift_card`
- `bill_payment`
- `exchange`
- `atm`

They represent indirect spending, conversion, or infrastructure rather than a merchant or service checkout that directly accepts a user's crypto payment. A later guide may model them separately.

## Input envelope

Each import run supplies:

- registered source UUID;
- optional license UUID;
- import-batch UUID;
- fetch time;
- semantic importer version;
- one or more untrusted legacy rows.

The envelope is validated separately from each row. Invalid or out-of-scope rows do not abort valid rows in the same batch.

## Accepted source fields

A legacy online row may contain:

- legacy ID and path;
- proposed record type;
- name and official website;
- optional country and category;
- proposed acceptance scope;
- proposed route type;
- processor name and URL;
- source asset labels;
- source network labels;
- source payment-method labels;
- scope notes and How-to-pay source text;
- Evidence URLs;
- observation time and source URL;
- legacy verification label.

HTML-like names, non-HTTP URLs, unknown fields, and internally contradictory direct-wallet processor fields fail validation.

## Raw and normalized values

The source record retains both forms:

```text
rawRecord
  original accepted source object

normalizedRecord
  trimmed and normalized review object
```

Examples include preserving a lower-case source country code while exposing the normalized upper-case value to review. SHA-256 content identity and the batch checksum are derived from the original source row.

## Deterministic identity

The importer derives stable UUID-shaped identifiers for:

- the private candidate;
- the immutable source-record observation;
- the pending legacy-ID mapping.

The candidate identity is stable for a legacy source ID. The source-record identity includes the original-row content hash, so an exact replay is idempotent while changed content remains a distinct observation.

## Candidate-only boundary

Every accepted row produces:

- a private candidate with `candidate_status = new`;
- no canonical entity ID;
- no canonical location ID;
- one origin relationship to its source record;
- one `crypto_acceptance_registry` legacy mapping in `pending` state;
- normalized review data;
- `automaticConfirmedCount = 0` for the batch.

The import plan has no acceptance-claim, claim-asset, verification-event, or public-export field.

## Payment proposal fields

Asset, network, payment-method, route, processor, acceptance-scope, and How-to-pay values remain source proposals.

The importer does not:

- resolve labels to canonical registry IDs;
- infer a network from an asset symbol;
- infer a payment method from a route;
- treat processor capability as merchant acceptance;
- treat legacy verification labels as current verification;
- create a Confirmed claim.

Administrative review must resolve identity, scope, route, asset, network, payment method, Evidence, and current checkout behavior before promotion.

## Replay and conflict handling

Within one batch:

- the same legacy ID with identical original content is recorded as a replay;
- the same legacy ID with different content is rejected as a conflicting identity;
- repeated out-of-scope rows remain out of scope;
- malformed rows return structured validation issues.

Stable identifiers support later idempotent database persistence.

## Duplicate review signals

The importer emits signals without merging candidates:

```text
shared_official_domain
  strength: strong

same_normalized_name
  strength: review
```

The official domain is normalized to lower case and removes a leading `www.`. A shared domain still requires review because one domain may contain multiple products, regions, or service identities.

## Ten-record proof

The runtime check imports ten representative online records and verifies:

- all ten remain private new candidates;
- no canonical target is assigned;
- all legacy mappings remain pending;
- no acceptance claim is produced;
- repeated execution produces the same checksum and identifiers;
- indirect spending and exchange types are excluded;
- shared official domains create review signals rather than merges.

## Excluded from P2-14

- database writes and transactions;
- canonical promotion;
- registry-label resolution;
- Evidence threshold evaluation;
- public artifact generation;
- live legacy database access;
- Cloudflare or Neon credentials.

Phase 3 adds protected review, persistence, promotion, and export controls.
