# Candidate detail and provenance contract

**Implementation items:** P3-05, P4-18B1  
**Status:** Active contract  
**Visibility:** Repository-public implementation contract; no private Candidate values are included

## Purpose

The Candidate detail workspace lets an authorized administrator inspect one private Candidate and its bounded source relationships before later review decisions.

P3-05 established the read-only Candidate detail boundary. P4-18B1 extends the allowlisted physical-place source snapshot so practical Place source values can be reviewed before the later Promotion, provenance, canonical, and public-projection work.

Candidate detail remains read-only. It does not add Candidate mutation, duplicate resolution, canonical promotion, Evidence decisions, Media decisions, or publication controls.

## Protected routes

```text
/admin/candidates/detail/?id=<candidate-uuid>
GET /admin/api/candidates/<candidate-uuid>
```

The static page contains no Candidate values. The browser requests the protected API after Cloudflare Access verification and exact-subject authorization.

## Authorization

- a verified administration identity is required;
- authorization uses the exact Access subject, not an email address;
- the required capability is `candidate:read`;
- Candidate detail authorization is the same explicit read capability used by the Candidate queue;
- unauthorized requests are rejected before Candidate lookup;
- an unauthorized response does not reveal whether a Candidate exists;
- absent authorization configuration fails closed.

## Candidate fields

The detail response may include only:

- protected Candidate UUID;
- normalized Candidate name;
- Candidate type and status;
- priority;
- first-seen, last-seen, created, and updated times;
- whether a duplicate group is attached;
- duplicate-group status when attached;
- whether a canonical entity or location link exists.

Canonical entity and location identifiers are not returned.

## Import origin

When the Candidate is linked to an import batch, the response may include:

- import kind;
- source name and source type;
- source schema version;
- importer version;
- completion time.

The request ID, checksum, actor identity, rejection summary, and batch counts are not returned.

## Source relationship limit

- source relationships are ordered by fetched time and source-record UUID;
- at most 100 source relationships are returned;
- a separate `sourcesTruncated` value indicates that additional records exist;
- no partial or unvalidated source item is rendered.

## Source metadata and effective license

A source item may include only:

- protected source-record UUID;
- relationship to the Candidate;
- source name and source type;
- source active state;
- HTTP or HTTPS source and archive URLs;
- observed, published, and fetched times;
- effective license name, slug, version, attribution requirement, and share-alike flag;
- a supported allowlisted source snapshot.

The effective license is the source-record-specific license when present, otherwise the source default license. Only the bounded license metadata needed for protected review is returned.

The source-record external ID, content hash, generic database row, and unrestricted payload are not returned.

## Allowlisted source snapshots

A snapshot is produced only when the stored payload contains a `normalizedRecord` that validates again against a supported import schema.

Supported projections are:

- physical-place legacy import;
- online-service, payment-processor, payment-program, and platform legacy import.

The Candidate type must match the validated source record type. Unknown, mismatched, or malformed payloads produce `snapshot: null`.

The projector creates a new object from an explicit allowlist. It never serializes the stored payload directly.

### Physical-place snapshot

The validated physical-place source snapshot contains a stable review shape for:

- source name;
- address components and country code;
- coordinates;
- category;
- website;
- phone;
- description;
- opening-hours source text;
- normalized unique amenities or `null` when absent;
- normalized bounded social-link review entries;
- OSM type and ID;
- bounded payment tags;
- legacy verification label.

The practical source fields are review values only. Candidate detail does not approve or write them to canonical Location fields.

#### Amenities

Amenities in a physical source snapshot are:

- trimmed;
- empty values removed;
- bounded by item and list limits;
- exact duplicates removed before projection;
- rejected if malformed values remain.

The Candidate detail response validator rejects a backend response that claims to be normalized but still contains duplicate amenities.

#### Social-link review entries

The protected review shape is:

```text
platform
url
handle
```

Requirements:

- platform is a stable lowercase key;
- `url` is nullable in the source-review contract and, when present, must use HTTP or HTTPS;
- `handle` is nullable;
- at least one of URL or handle is required;
- exact duplicate entries are normalized before projection;
- the Candidate detail response validator rejects duplicate normalized entries.

A handle-only source value remains handle-only. Candidate detail does not invent a URL. Later canonical and public boundaries apply the stricter canonical social-link contract.

### Online snapshot

May include:

- source name and importable record type;
- website and country code;
- category;
- acceptance scope and route type;
- processor name and URL;
- bounded asset, network, and payment-method labels;
- scope notes and How to pay;
- bounded Evidence URLs;
- legacy verification label.

P4-18B1 does not change the online-source snapshot contract.

## Explicit exclusions

The response must not include:

- unrestricted raw JSON;
- original raw record;
- unknown payload fields;
- legacy alias fields after normalized review projection;
- import actor identity;
- submission contacts;
- internal notes;
- private Evidence content;
- private Media or storage keys;
- canonical record identifiers;
- duplicate resolution notes;
- write controls;
- publication controls.

## Response validation

The browser validates the full detail response before displaying any Candidate value.

The interface provides explicit states for:

- loading;
- ready;
- missing or invalid identifier;
- access denied;
- not found;
- unavailable backend;
- invalid response;
- retry;
- no attached source relationships;
- truncated source relationships.

For physical source snapshots, malformed practical profile values fail the source snapshot closed rather than exposing a partial unvalidated object.

## HTTP behavior

```text
200  validated Candidate detail
400  invalid Candidate identifier
403  identity missing or not authorized
404  authorized request for an unavailable Candidate
503  authorization configuration or backend unavailable
```

All responses use private, no-store administration headers and noindex directives.

## P4-18B1 boundary

P4-18B1 completes only the source-to-protected-review path:

```text
legacy or supported source value
    ↓
strict source validation
    ↓
normalized immutable source payload
    ↓
private Candidate review data
    ↓
allowlisted source snapshot
    ↓
protected Admin display
```

P4-18B1 does not add:

- Promotion inputs;
- field-source assignment controls;
- canonical Location writes;
- existing-record corrections;
- public projection changes.

Those remain P4-18B2 through P4-18B4.

## Deferred environment verification

P4-18D and P4-18E will reconcile live Cloudflare Access and live database workflow checks. Repository contracts, tests, static artifact checks, and fail-closed behavior must not be described as live environment verification.
