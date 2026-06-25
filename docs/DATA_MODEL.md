# CryptoPayMap data model

## Purpose

This document defines the public repository contract for CryptoPayMap's source records, candidates, canonical identities, locations, acceptance claims, evidence, verification history, submissions, media, provenance, migration, audit, and public projections.

The model preserves three mandatory boundaries:

1. source material is not canonical data;
2. canonical data is not automatically public data;
3. public data never includes private review, contact, ownership-proof, or submission material.

Verification thresholds, source-quality rules, licensing policy, submission operations, media policy, and security implementation are defined in separate documents. This model provides the fields and relationships required to enforce those policies.

---

## 1. Logical data layers

CryptoPayMap uses four logical layers.

### 1.1 Source layer

External records, imports, reports, crawled observations, and legacy data are stored without being treated as accepted facts.

Examples:

- OpenStreetMap objects;
- legacy CryptoPayMap records;
- processor directories;
- business websites;
- archived pages;
- user suggestions;
- payment reports.

### 1.2 Review layer

Candidates, evidence, proposed changes, reviewer decisions, holds, and media review exist here.

Nothing in this layer becomes public merely because it was imported or submitted.

### 1.3 Canonical layer

Reviewed entities, locations, acceptance claims, asset and network relationships, verification events, approved media, and provenance form the operational source of truth.

### 1.4 Public projection layer

Validated public views and export files contain only publishable fields from eligible canonical records.

```text
source records
    ↓
source candidates
    ↓
review and evidence
    ↓
canonical records
    ↓
public eligibility validation
    ↓
public JSON / GeoJSON / pages
```

---

## 2. Global conventions

### 2.1 Identifiers

- Internal primary keys use UUIDs.
- Public pages use stable human-readable slugs.
- Public submission references use opaque public IDs.
- Secret access tokens are never stored in plaintext.
- Internal UUIDs do not appear in canonical public URLs.

### 2.2 Time

- Database timestamps use `timestamptz` and UTC.
- Public dates are rendered in an appropriate user-facing format.
- Observation time, publication time, confirmation time, ingestion time, and record-creation time remain distinct.

### 2.3 Country and language

- Countries use ISO 3166-1 alpha-2 codes.
- Canonical country codes are stored uppercase in the database and rendered as lowercase route segments.
- Text language uses BCP 47 language tags where needed.

### 2.4 Slugs

- Slugs use lowercase ASCII and hyphens.
- Slugs are stable after publication unless a strong reason requires a change.
- Previous public slugs are preserved in a redirect alias table.

### 2.5 Deletion

Records with audit, verification, rights, or migration value normally use status changes or soft deletion.

Hard deletion is reserved for data that must be removed, expired private payloads, or material whose retention is no longer permitted.

### 2.6 Public and private fields

Every table containing both public and private material must expose a reviewed public projection rather than being serialized directly.

Application code must never export an entire operational table as public JSON.

---

## 3. Controlled state values

Controlled values may be implemented as PostgreSQL enums, constrained text, or versioned registry tables. Values exposed publicly must remain stable.

### 3.1 Entity type

```text
merchant
online_service
payment_processor
payment_program
platform
```

### 3.2 Entity status

```text
active
inactive
ended
unknown
```

Entity status describes the organization or service, not whether one payment method remains available.

### 3.3 Location status

```text
active
temporarily_closed
closed
unknown
```

Location status is independent from acceptance-claim status.

### 3.4 Acceptance-claim status

```text
candidate
confirmed
stale
ended
rejected
```

### 3.5 Canonical record visibility

```text
public
hidden
temporarily_hidden
```

This visibility set applies to canonical entities, locations, and acceptance claims. It is separate from evidence and media visibility.

### 3.6 Claim scope

```text
location_specific
brand_region
brand_global
online_service
platform_capability
```

### 3.7 Acceptance scope

```text
all_checkout
selected_products
new_purchase_only
renewal_only
region_limited
temporary
```

### 3.8 Payment route

```text
direct_wallet
processor_checkout
```

### 3.9 Payment method

Initial registry values:

```text
onchain
lightning_invoice
lightning_nfc
wallet_qr
processor_checkout
pos_terminal
invoice
payment_link
```

Payment route and payment method are separate concepts.

### 3.10 Merchant receives

```text
crypto
fiat
crypto_or_fiat
not_publicly_confirmed
```

### 3.11 Evidence class

```text
A
B
C
```

### 3.12 Evidence visibility

```text
public
private
restricted
```

### 3.13 Evidence review status

```text
pending
accepted
rejected
superseded
```

### 3.14 Candidate intake status

```text
new
triaged
linked
promoted
duplicate
rejected
archived
```

This is an intake workflow state. It is not an acceptance-claim status.

### 3.15 Submission type

```text
suggest
payment_report
problem_report
claim
photos
```

### 3.16 Submission workflow status

```text
received
triage
in_review
needs_information
on_hold
resolved
duplicate
rejected_spam
withdrawn
```

### 3.17 Submission resolution

```text
approved
partially_approved
accepted_as_candidate
not_approved
duplicate
no_change
withdrawn
```

### 3.18 Media role

```text
cover
gallery
exterior
interior
product
menu
payment_sign
checkout_terminal
evidence_image
owner_verification_proof
```

### 3.19 Media review status

```text
uploaded
validated
pending_review
approved_private
approved_public
rejected
deleted
```

### 3.20 Media visibility

```text
private
restricted
public
deleted
```

Media visibility is not interchangeable with canonical record visibility.

### 3.21 Ownership-verification status

```text
pending
verified
rejected
expired
revoked
```

### 3.22 Publication-run status

```text
pending
validating
published
failed
superseded
```

---

## 4. Source and provenance model

### 4.1 `sources`

Defines a source organization, dataset, website, contributor type, or import channel.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `source_type` | text | Examples: `osm`, `official_site`, `official_social`, `processor`, `directory`, `user_submission`, `legacy_import`. |
| `name` | text | Human-readable source name. |
| `base_url` | text nullable | Canonical source root. |
| `license_id` | uuid nullable | Default source license. |
| `attribution_text` | text nullable | Required attribution where applicable. |
| `is_active` | boolean | Whether new records may be ingested. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 4.2 `licenses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `slug` | text unique | Stable public identifier. |
| `name` | text | Human-readable name. |
| `version` | text nullable | License version where applicable. |
| `url` | text nullable | Canonical license URL. |
| `attribution_required` | boolean | |
| `share_alike` | boolean | |
| `notes` | text nullable | Public-safe notes. |

### 4.3 `source_records`

Stores an observed external record without asserting canonical truth.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `source_id` | uuid | References `sources`. |
| `external_id` | text nullable | Source-native identifier. |
| `source_url` | text nullable | Exact source record URL. |
| `raw_payload` | jsonb | Internal-only original or safely normalized source payload. |
| `observed_at` | timestamptz nullable | When the source claim was observed to apply. |
| `published_at` | timestamptz nullable | Source publication time if known. |
| `fetched_at` | timestamptz | Ingestion time. |
| `content_hash` | text nullable | Detects repeated or changed source content. |
| `archive_url` | text nullable | Approved archive URL where permitted. |
| `license_id` | uuid nullable | Overrides the source default when necessary. |
| `created_at` | timestamptz | |

Uniqueness should normally cover `(source_id, external_id)` when `external_id` exists.

### 4.4 `source_candidates`

Represents a reviewable candidate derived from one or more source records.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `candidate_type` | text | `physical_place`, `online_service`, `processor`, or another approved type. |
| `normalized_name` | text | Review and duplicate-detection aid. |
| `candidate_status` | text | Uses the candidate-intake status set. |
| `priority` | integer nullable | Internal ordering only. |
| `duplicate_group_id` | uuid nullable | Groups suspected duplicates. |
| `first_seen_at` | timestamptz | |
| `last_seen_at` | timestamptz | |
| `import_batch_id` | uuid nullable | References an import batch. |
| `canonical_entity_id` | uuid nullable | Set only when linked to canonical identity. |
| `canonical_location_id` | uuid nullable | Set only when linked to canonical location. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 4.5 `candidate_source_records`

Many-to-many link between candidates and source observations.

| Column | Type |
|---|---|
| `candidate_id` | uuid |
| `source_record_id` | uuid |
| `relationship` | text |
| `created_at` | timestamptz |

### 4.6 `provenance_links`

Attaches source and license metadata to a canonical record or field.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `subject_type` | text | Controlled values such as `entity`, `location`, `acceptance_claim`, `claim_asset`, or `media`. |
| `subject_id` | uuid | Canonical subject. |
| `field_path` | text nullable | Optional field-level provenance, such as `address_line` or `latitude`. |
| `source_record_id` | uuid | References `source_records`. |
| `license_id` | uuid nullable | License applying to this contribution. |
| `provenance_role` | text | Examples: `origin`, `verification`, `correction`, `attribution`. |
| `effective_from` | timestamptz nullable | |
| `effective_to` | timestamptz nullable | |
| `created_at` | timestamptz | |

The application validates that `subject_type` is approved and `subject_id` exists in the corresponding canonical table.

This layer allows OpenStreetMap-derived location fields and CryptoPayMap-authored verification fields to remain distinguishable in combined exports.

---

## 5. Registry tables

### 5.1 `assets`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `symbol` | text unique | Canonical display symbol. |
| `slug` | text unique | Public route slug. |
| `name` | text | Canonical name. |
| `asset_type` | text | Native, token, stablecoin, or another approved class. |
| `decimals` | integer nullable | Informational. |
| `status` | text | Active, deprecated, or disabled. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 5.2 `asset_aliases`

| Column | Type |
|---|---|
| `asset_id` | uuid |
| `alias` | text unique |
| `alias_type` | text nullable |

Example: `XBT` resolves to `BTC`.

### 5.3 `networks`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `slug` | text unique | Examples: `bitcoin`, `lightning`, `ethereum`, `base`, `tron`, `solana`, `xrpl`. |
| `name` | text | Display name. |
| `network_type` | text | Layer 1, Layer 2, payment network, or another approved class. |
| `native_asset_id` | uuid nullable | Informational relationship. |
| `status` | text | Active, deprecated, or disabled. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 5.4 `network_aliases`

| Column | Type |
|---|---|
| `network_id` | uuid |
| `alias` | text unique |
| `alias_type` | text nullable |

Examples: `LN` resolves to `lightning`; `TRC20` resolves to `tron`.

### 5.5 `payment_methods`

| Column | Type |
|---|---|
| `id` | uuid |
| `slug` | text unique |
| `name` | text |
| `status` | text |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

### 5.6 `categories`

| Column | Type |
|---|---|
| `id` | uuid |
| `slug` | text unique |
| `name` | text |
| `parent_id` | uuid nullable |
| `record_type` | text | Physical, online, or both. |
| `status` | text |

Registries are versioned public contracts. An asset never implies a network; both are stored explicitly.

---

## 6. Canonical identity model

### 6.1 `entities`

Represents a merchant brand, independent business, online service, processor, program, or platform.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `entity_type` | text | Uses the entity-type set. |
| `name` | text | Public display name. |
| `slug` | text nullable unique | Stable public slug when the entity has a public route. |
| `legal_name` | text nullable | Public only when appropriate. |
| `website_url` | text nullable | Canonical official website. |
| `country_code` | char(2) nullable | Headquarters or primary jurisdiction, not a location substitute. |
| `entity_status` | text | Independent from payment acceptance. |
| `visibility` | text | Uses canonical record visibility. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz nullable | Soft deletion where required. |

### 6.2 `entity_categories`

| Column | Type |
|---|---|
| `entity_id` | uuid |
| `category_id` | uuid |
| `is_primary` | boolean |
| `created_at` | timestamptz |

### 6.3 `locations`

Represents a physical place associated with an entity.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `entity_id` | uuid | References `entities`. |
| `name` | text nullable | Branch-specific public name. |
| `slug` | text unique | Public place slug. |
| `address_line` | text nullable | Public canonical address. |
| `locality` | text nullable | City or locality. |
| `region` | text nullable | State, prefecture, province, or region. |
| `postal_code` | text nullable | |
| `country_code` | char(2) | |
| `latitude` | numeric | Valid latitude. |
| `longitude` | numeric | Valid longitude. |
| `location_status` | text | Independent from payment acceptance. |
| `visibility` | text | Uses canonical record visibility. |
| `website_url` | text nullable | Branch-specific official page. |
| `phone` | text nullable | Public only when appropriate. |
| `osm_type` | text nullable | `node`, `way`, or `relation`. |
| `osm_id` | bigint nullable | Source identity, not public canonical identity. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz nullable | |

Constraints:

- latitude is between -90 and 90;
- longitude is between -180 and 180;
- `(osm_type, osm_id)` is unique when both exist;
- an online service does not require a location row.

### 6.4 `location_categories`

Optional location-specific category overrides.

| Column | Type |
|---|---|
| `location_id` | uuid |
| `category_id` | uuid |
| `is_primary` | boolean |

### 6.5 `slug_aliases`

Preserves old public slugs after a rename.

| Column | Type |
|---|---|
| `id` | uuid |
| `route_type` | text |
| `old_slug` | text |
| `target_entity_id` | uuid nullable |
| `target_location_id` | uuid nullable |
| `redirect_status` | integer |
| `created_at` | timestamptz |

---

## 7. Acceptance-claim model

### 7.1 `acceptance_claims`

Represents a reviewed claim that cryptocurrency can be used through a defined checkout route.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `entity_id` | uuid | Required canonical entity. |
| `location_id` | uuid nullable | Required for `location_specific`. |
| `claim_scope` | text | Uses the claim-scope set. |
| `route_type` | text | `direct_wallet` or `processor_checkout`. |
| `acceptance_scope` | text | Product, renewal, regional, or temporary scope. |
| `claim_status` | text | Candidate, confirmed, stale, ended, or rejected. |
| `visibility` | text | Uses canonical record visibility. |
| `customer_pays_crypto` | boolean | Must be true for normal public acceptance. |
| `merchant_explicitly_accepts_crypto` | boolean | Distinguishes merchant acceptance from indirect spending. |
| `processor_id` | uuid nullable | References an entity whose type is `payment_processor`. |
| `how_to_pay` | text nullable | Required before confirmation. |
| `instructions_language` | text | BCP 47 language tag for the canonical instructions. |
| `merchant_receives` | text | Never inferred from processor capability alone. |
| `restrictions` | text nullable | Public restrictions summary. |
| `first_confirmed_at` | timestamptz nullable | |
| `last_confirmed_at` | timestamptz nullable | |
| `next_review_at` | timestamptz nullable | |
| `ended_at` | timestamptz nullable | Required when ended. |
| `ended_reason` | text nullable | Public-safe reason. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz nullable | |

Core constraints:

- `location_specific` requires `location_id`;
- `online_service` requires an `online_service` entity and no physical location;
- `processor_checkout` requires `processor_id`;
- `direct_wallet` normally requires `processor_id` to be null;
- `processor_id` must reference an entity with `entity_type = payment_processor`;
- `platform_capability` cannot by itself create a public place pin;
- `ended` requires `ended_at`;
- `confirmed` requires public instructions, confirmation date, eligible asset/network rows, and qualifying evidence;
- public visibility is not permitted for rejected or unreviewed candidate claims.

### 7.2 `claim_regions`

Defines regional applicability for brand or online claims.

| Column | Type |
|---|---|
| `claim_id` | uuid |
| `country_code` | char(2) |
| `region_code` | text nullable |
| `inclusion_type` | text | Include or exclude. |
| `notes` | text nullable |

The combination `(claim_id, country_code, region_code, inclusion_type)` is unique.

### 7.3 `claim_assets`

Defines accepted asset, network, and payment-method combinations.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `claim_id` | uuid | References `acceptance_claims`. |
| `asset_id` | uuid | Required. |
| `network_id` | uuid | Required for a publishable row. |
| `payment_method_id` | uuid | Required for a publishable row. |
| `contract_address` | text nullable | Normalized token contract where useful. |
| `is_primary` | boolean | Preferred or prominently displayed option. |
| `notes` | text nullable | Public-safe method note. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique constraint:

```text
(claim_id, asset_id, network_id, payment_method_id, contract_address)
```

No asset-to-network inference is permitted. USDT, USDC, and other multi-network assets require an explicit network row.

### 7.4 `claim_translations`

Optional future-ready localization without changing canonical identifiers.

| Column | Type |
|---|---|
| `claim_id` | uuid |
| `language_tag` | text |
| `how_to_pay` | text |
| `restrictions` | text nullable |
| `review_status` | text |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

Only reviewed translations may enter public projections.

---

## 8. Evidence and verification history

### 8.1 `evidence`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `claim_id` | uuid nullable | Canonical claim under review. |
| `submission_id` | uuid nullable | Originating submission where applicable. |
| `source_record_id` | uuid nullable | Originating source observation. |
| `evidence_kind` | text | Examples: official page, live checkout, owner verification, payment proof, official social post, processor case study, dated OSM observation, user report. |
| `evidence_class` | text | A, B, or C. |
| `source_url` | text nullable | Public or private according to visibility. |
| `observed_at` | timestamptz nullable | When the evidence applied. |
| `published_at` | timestamptz nullable | Source publication time. |
| `summary` | text | Reviewed summary. |
| `visibility` | text | Uses evidence visibility. |
| `review_status` | text | Uses evidence review status. |
| `archive_url` | text nullable | Where permitted. |
| `content_hash` | text nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Private payment URLs, receipts, transaction details, owner proof, and personal material remain private even when their reviewed conclusion supports a public claim.

### 8.2 `verification_events`

Stores the append-only public and internal history of claim-state decisions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `claim_id` | uuid | References `acceptance_claims`. |
| `event_type` | text | Confirmed, reconfirmed, marked stale, ended, restored, corrected, hidden, unhidden, or another approved event. |
| `from_status` | text nullable | |
| `to_status` | text nullable | |
| `reason_code` | text | Stable machine-readable reason. |
| `effective_at` | timestamptz | When the state change applies. |
| `public_summary` | text nullable | Publishable explanation. |
| `internal_note` | text nullable | Never public. |
| `created_at` | timestamptz | |

### 8.3 `verification_event_evidence`

Avoids storing evidence IDs as an array.

| Column | Type |
|---|---|
| `verification_event_id` | uuid |
| `evidence_id` | uuid |
| `relationship` | text |

The current `claim_status` is stored on the claim for efficient reads. `verification_events` remains the auditable history and must agree with the current status.

---

## 9. Media model

### 9.1 `media`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. |
| `entity_id` | uuid nullable | |
| `location_id` | uuid nullable | |
| `claim_id` | uuid nullable | |
| `evidence_id` | uuid nullable | |
| `submission_id` | uuid nullable | |
| `role` | text | Uses the media-role set. |
| `source_type` | text | Owner, user, operator, licensed source, or another approved source. |
| `rights_basis` | text | Reviewed rights basis. |
| `license_id` | uuid nullable | Where an open license applies. |
| `attribution` | text nullable | Public attribution when required. |
| `alt_text` | text nullable | Required for public display. |
| `review_status` | text | Uses media review status. |
| `visibility` | text | Uses media visibility. |
| `original_storage_key` | text nullable | Private storage reference; never exported. |
| `public_storage_key` | text nullable | Approved derivative reference. |
| `display_order` | integer nullable | |
| `width` | integer nullable | Public derivative dimensions. |
| `height` | integer nullable | |
| `mime_type` | text nullable | Validated MIME type. |
| `file_size` | bigint nullable | |
| `content_hash` | text | Duplicate and audit control. |
| `captured_at` | timestamptz nullable | |
| `published_at` | timestamptz nullable | |
| `delete_after` | timestamptz nullable | Retention scheduler. |
| `deleted_at` | timestamptz nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Constraints:

- public media requires `review_status = approved_public` and `visibility = public`;
- public media also requires a public derivative, reviewed rights basis, and alt text;
- original private storage keys never enter public exports;
- owner proof cannot be converted to public gallery media without a separate rights and privacy decision;
- submission approval does not imply media approval.

---

## 10. Submission model

### 10.1 `submissions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Internal primary key. |
| `public_id` | text unique | Safe reference such as `CPM-S-2026-000123`. |
| `submission_type` | text | Uses the submission-type set. |
| `target_type` | text nullable | Entity, location, claim, or new record. |
| `target_id` | uuid nullable | Internal target. |
| `workflow_status` | text | Uses submission workflow status. |
| `resolution` | text nullable | Uses submission resolution. |
| `priority` | integer nullable | Internal only. |
| `status_token_hash` | text unique | Hash only; plaintext secret is not stored. |
| `submitted_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `resolved_at` | timestamptz nullable | |
| `withdrawn_at` | timestamptz nullable | |

### 10.2 `submission_payloads`

| Column | Type | Notes |
|---|---|---|
| `submission_id` | uuid | Primary and foreign key. |
| `original_payload` | jsonb | Immutable received payload after safe parsing. |
| `normalized_payload` | jsonb nullable | Reviewer-normalized values. |
| `proposed_changes` | jsonb nullable | Field-level canonical proposal. |
| `schema_version` | text | Payload schema version. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

The original payload is never overwritten by normalization.

### 10.3 `submission_evidence`

| Column | Type |
|---|---|
| `id` | uuid |
| `submission_id` | uuid |
| `evidence_kind` | text |
| `source_url` | text nullable |
| `observed_at` | timestamptz nullable |
| `summary` | text nullable |
| `visibility` | text |
| `review_status` | text |
| `created_at` | timestamptz |

Accepted evidence may be copied or linked into canonical evidence without exposing private original material.

### 10.4 `submission_contacts`

| Column | Type | Notes |
|---|---|---|
| `submission_id` | uuid | |
| `encrypted_email` | bytea nullable | Never public. |
| `email_hash` | text nullable | Duplicate and abuse controls. |
| `contact_allowed` | boolean | |
| `delete_after` | timestamptz nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 10.5 `submission_events`

Append-only workflow history.

| Column | Type |
|---|---|
| `id` | uuid |
| `submission_id` | uuid |
| `from_status` | text nullable |
| `to_status` | text |
| `action` | text |
| `reason_code` | text nullable |
| `public_message` | text nullable |
| `internal_note` | text nullable |
| `created_at` | timestamptz |

### 10.6 `submission_decisions`

| Column | Type |
|---|---|
| `id` | uuid |
| `submission_id` | uuid |
| `decision` | text |
| `approved_fields` | jsonb nullable |
| `rejected_fields` | jsonb nullable |
| `held_fields` | jsonb nullable |
| `public_reason` | text nullable |
| `internal_reason` | text nullable |
| `reviewed_by` | text nullable |
| `reviewed_at` | timestamptz |

### 10.7 `submission_holds`

| Column | Type |
|---|---|
| `id` | uuid |
| `submission_id` | uuid |
| `hold_reason` | text |
| `required_action` | text nullable |
| `placed_on_hold_at` | timestamptz |
| `next_review_at` | timestamptz |
| `released_at` | timestamptz nullable |
| `resolution` | text nullable |

A hold requires a future review date. Indefinite holds are not permitted.

---

## 11. Ownership verification

### 11.1 `ownership_verifications`

Stores an approved or pending relationship between a claimant and a business record without requiring a public user account.

| Column | Type |
|---|---|
| `id` | uuid |
| `entity_id` | uuid |
| `location_id` | uuid nullable |
| `submission_id` | uuid |
| `verification_method` | text |
| `verification_status` | text | Uses ownership-verification status. |
| `verified_at` | timestamptz nullable |
| `expires_at` | timestamptz nullable |
| `revoked_at` | timestamptz nullable |
| `internal_note` | text nullable |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

Ownership verification authorizes a reviewed relationship. It does not permit automatic publication or bypass acceptance-verification requirements.

---

## 12. Legacy migration model

### 12.1 `legacy_place_ids`

| Column | Type |
|---|---|
| `id` | uuid |
| `legacy_system` | text |
| `legacy_id` | text |
| `entity_id` | uuid nullable |
| `location_id` | uuid nullable |
| `new_slug` | text nullable |
| `migration_status` | text |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

Unique constraint:

```text
(legacy_system, legacy_id)
```

Legacy mapping resolves redirects but does not grant confirmed status.

### 12.2 `import_batches`

| Column | Type |
|---|---|
| `id` | uuid |
| `source_id` | uuid |
| `batch_name` | text |
| `schema_version` | text |
| `started_at` | timestamptz |
| `completed_at` | timestamptz nullable |
| `status` | text |
| `record_count` | integer nullable |
| `error_summary` | text nullable |
| `content_hash` | text nullable |

Imports are repeatable and auditable. Re-importing the same source must not create uncontrolled duplicates.

---

## 13. Audit and publication model

### 13.1 `audit_events`

| Column | Type |
|---|---|
| `id` | uuid |
| `actor_type` | text |
| `actor_id` | text nullable |
| `action` | text |
| `subject_type` | text |
| `subject_id` | uuid nullable |
| `before_value` | jsonb nullable |
| `after_value` | jsonb nullable |
| `correlation_id` | uuid nullable |
| `created_at` | timestamptz |

Audit events are private by default. Public history is generated from reviewed verification events and public summaries, not raw audit payloads.

### 13.2 `publication_runs`

Tracks generation and release of public artifacts.

| Column | Type |
|---|---|
| `id` | uuid |
| `status` | text | Uses publication-run status. |
| `schema_version` | text |
| `started_at` | timestamptz |
| `validated_at` | timestamptz nullable |
| `published_at` | timestamptz nullable |
| `artifact_hash` | text nullable |
| `record_counts` | jsonb nullable | Public-category counts only. |
| `failure_summary` | text nullable | Private operational summary. |
| `created_at` | timestamptz |

A submission or canonical change is not reported as publicly published until its publication run succeeds.

---

## 14. Relationship summary

```text
sources
  └─ source_records
       ├─ source_candidates
       ├─ provenance_links
       └─ evidence

entities
  ├─ locations
  ├─ acceptance_claims
  │    ├─ claim_assets
  │    ├─ claim_regions
  │    ├─ evidence
  │    └─ verification_events
  ├─ media
  └─ ownership_verifications

submissions
  ├─ submission_payloads
  ├─ submission_evidence
  ├─ submission_contacts
  ├─ submission_events
  ├─ submission_decisions
  ├─ submission_holds
  └─ media

canonical public eligibility
  └─ publication_runs
       └─ public JSON / GeoJSON / pages
```

---

## 15. Canonical invariants

The application and database validation must preserve these rules.

### 15.1 Candidate and public separation

- `source_candidates` never enter public exports.
- candidate acceptance claims never enter public exports.
- public counts never include candidates.

### 15.2 Claim and submission separation

- acceptance-claim status is not a submission workflow status;
- resolving a submission does not directly set claim state without an explicit canonical transaction;
- original submission payloads remain distinguishable from reviewer normalization.

### 15.3 Route and method separation

- payment route describes direct versus processor checkout;
- payment method describes the customer interaction;
- both are required where the public verification contract requires them.

### 15.4 Asset and network separation

- every publishable accepted-asset row has an explicit network;
- aliases normalize input but do not replace canonical values;
- no network is inferred solely from asset symbol.

### 15.5 Brand and location separation

- a brand claim does not automatically create location-specific public pins;
- a franchise or branch inherits acceptance only through an approved location claim or explicitly reviewed coverage rule;
- platform capability alone does not create merchant acceptance.

### 15.6 Evidence and state

- confirmed status requires qualifying accepted evidence;
- stale or ended transitions create verification events;
- current claim status and latest state-changing verification event must agree;
- newer contradictory evidence may supersede older positive evidence according to the verification policy.

### 15.7 Media

- private originals are not public URLs;
- evidence media and gallery media are separate review purposes;
- rights and privacy approval are required before public visibility.

### 15.8 Publication

- public projections contain only approved fields;
- export validation fails closed;
- failed exports do not replace the last valid public snapshot;
- public artifacts include a schema or version identifier.

---

## 16. Public projection rules

Public views or export builders are explicit, named projections rather than generic table serialization.

### 16.1 `public_acceptance_claims`

Includes only claims that:

- have an eligible canonical status;
- have public visibility;
- reference publishable entities and locations;
- satisfy required asset, network, method, instruction, evidence, and date validations;
- contain no private fields.

### 16.2 `public_places`

Combines publishable entity, location, and eligible location-specific claim data.

### 16.3 `public_place_pins`

A minimal map payload containing only fields needed for initial map rendering and selection.

It excludes full evidence bodies, private metadata, contacts, internal IDs, and review history.

### 16.4 `public_online_services`

Contains publishable online-service identities and eligible online acceptance claims, including public restrictions.

### 16.5 `public_updates`

Generated from reviewed public verification events and public summaries.

### 16.6 `public_stats`

Generated only from public-eligible canonical projections. It never queries candidates or private queues for public totals.

### 16.7 Provenance in combined exports

Combined records include enough metadata to distinguish:

- OpenStreetMap-derived location fields;
- CryptoPayMap-authored verification and payment instructions;
- other licensed source contributions;
- image-specific rights and attribution.

---

## 17. Public-file mapping

| Public file | Primary projection |
|---|---|
| `/data/locations-osm.json` | OSM-derived publishable location layer. |
| `/data/acceptance-claims.json` | Project-reviewed public acceptance claims. |
| `/data/place-pins.json` | Minimal physical-place map projection. |
| `/data/places.json` | Combined physical-place public records with provenance. |
| `/data/places.geojson` | Geographic projection of eligible physical places. |
| `/data/online-services.json` | Eligible online-service records. |
| `/data/stats.json` | Aggregate public dataset metrics. |
| `/data/updates.json` | Public record-change feed. |
| `/data/assets.json` | Public asset registry. |
| `/data/networks.json` | Public network registry. |
| `/data/manifest.json` | File inventory, schemas, counts, licenses, and timestamps. |
| `/version.json` | Dataset and schema version information. |

---

## 18. Validation categories

### 18.1 Referential integrity

- no orphan claim, location, asset, network, evidence, or media references;
- processors reference processor entities;
- public slugs are unique within their route type;
- controlled polymorphic references validate their subject type and subject existence.

### 18.2 Geographic integrity

- valid coordinates;
- country code present for public physical locations;
- city and region normalization where available;
- no public pin from a non-location claim without approved location coverage.

### 18.3 Verification integrity

- required instructions and confirmation dates;
- qualifying evidence;
- explicit asset, network, route, and method;
- ended claims have an end date and reason;
- stale claims remain distinguishable from ended claims.

### 18.4 Privacy integrity

Public output must not contain:

- submission emails;
- IP addresses;
- status-token hashes or secrets;
- private transaction URLs;
- receipt originals;
- wallet addresses supplied as evidence;
- owner-verification material;
- internal notes;
- private storage keys;
- private audit payloads.

### 18.5 License integrity

- source and license metadata remain traceable;
- required attribution is present;
- public images have a reviewed rights basis;
- combined exports do not erase field-level or record-level provenance.

---

## 19. Schema and migration rules

- Schema changes use reviewed migrations.
- A migration must be reversible where practical or include an explicit recovery plan.
- Destructive migrations require a verified backup and staged rollout.
- Public schema changes require versioning and Changelog review after public release.
- Importers are idempotent or detect replayed input.
- Registry values are deprecated rather than silently repurposed.
- Public enum values are not renamed without a compatibility and migration plan.
- A failed migration must not corrupt the last valid public export.

---

## 20. Example lifecycle

### 20.1 Physical-place candidate

```text
OSM or legacy source record
→ source candidate
→ canonical entity and location match or creation
→ candidate acceptance claim
→ evidence review
→ claim asset/network/method rows
→ confirmed verification event
→ public eligibility validation
→ public place and map-pin export
```

### 20.2 Payment report

```text
submission
→ immutable original payload
→ evidence review
→ proposed canonical change
→ field-level decision
→ canonical transaction
→ verification event
→ successful publication run
→ public update
```

### 20.3 Negative report

```text
problem report
→ private submission and evidence
→ review
→ no change, stale, ended, or temporary-hide decision
→ verification and audit events
→ validated public export
```

### 20.4 Owner claim

```text
claim submission
→ private verification material
→ ownership-verification decision
→ approved relationship
→ reviewed proposed corrections
→ canonical transaction
→ public export
```

Ownership approval does not bypass acceptance verification.

---

## 21. Deferred implementation details

The following are intentionally defined later without changing the logical boundaries in this document:

- exact PostgreSQL enum versus registry-table choices;
- partitioning and archival strategy for large event tables;
- vector-tile or viewport API projections;
- account-based business management;
- notification subscriptions;
- commercial API authentication;
- multilingual translation workflow beyond the reviewable translation table;
- detailed encryption-key and token-transport implementation.

These details may evolve, but candidate, canonical, public, private, evidence, submission, media, and provenance boundaries remain mandatory.
