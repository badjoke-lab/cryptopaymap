# CryptoPayMap public export schemas

## Purpose

CryptoPayMap publishes reviewed payment-acceptance data through explicit JSON and GeoJSON contracts. Operational database tables are never serialized directly.

The public contracts provide four guarantees:

1. source candidates and submission material are not public records;
2. every acceptance claim identifies the payment asset, network, route, method, instructions, evidence, and confirmation dates;
3. internal identifiers and private review fields are not part of public records;
4. each generated artifact identifies its schema version and generation time.

The runtime definitions are in `src/schemas/public-exports.ts`. CI exercises representative valid and invalid payloads through `scripts/check-public-export-schemas.ts`.

## Planned public files

| Path | Purpose |
|---|---|
| `/data/locations-osm.json` | Publishable OpenStreetMap-derived location fields with attribution. |
| `/data/acceptance-claims.json` | Reviewed public acceptance claims and their payment combinations. |
| `/data/place-pins.json` | Minimal physical-place payload for initial map rendering. |
| `/data/places.json` | Combined physical-place records, claims, practical Place profile fields, media, and provenance. |
| `/data/places.geojson` | GeoJSON point features for eligible physical places. |
| `/data/online-services.json` | Eligible online-service records and payment claims. |
| `/data/stats.json` | Aggregates calculated only from public-eligible records. |
| `/data/updates.json` | Reviewed public changes to places and online services. |
| `/data/assets.json` | Public asset registry. |
| `/data/networks.json` | Public network registry. |
| `/data/manifest.json` | File inventory, counts, hashes, schema versions, and licenses. |
| `/version.json` | Dataset identity and canonical-only verification marker. |

P2-11 defines the contracts. It does not publish live files or introduce database export jobs.

## Common envelope

Dataset files use a common header:

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-06-27T00:00:00Z"
}
```

Record files add a `records` array. GeoJSON uses a `FeatureCollection`. Stats uses a named `stats` object. The manifest and version files add dataset-level metadata.

All objects are strict. An unknown property fails validation instead of being silently discarded.

## Public identifiers

Public records use stable slugs and public keys. Internal UUID-shaped values are rejected where a public identifier is required.

Examples:

```text
example-coffee-tokyo
example-coffee-lightning
bitcoin
lightning
```

Internal database IDs remain available to operational code but are not part of these contracts.

## Public acceptance claims

A public claim contains:

- a stable public claim key;
- entity and optional location slugs;
- claim scope and acceptance scope;
- `confirmed`, `stale`, or `ended` status;
- direct-wallet or processor-checkout route;
- processor identity when applicable;
- customer-facing payment instructions and language;
- merchant receipt state and public restrictions;
- first, last, next-review, and end dates where applicable;
- one or more explicit asset, network, and payment-method combinations;
- one or more reviewed public evidence summaries.

The schema rejects:

- candidate or rejected claims;
- location-specific claims without a location;
- non-location claims that expose a location;
- processor checkout without a processor;
- a processor on a direct-wallet route;
- ended claims without an end time and reason;
- duplicate payment combinations;
- confirmation dates in an impossible order;
- unknown or private fields.

The schema validates public shape, not database review workflow. Export builders must select only eligible canonical rows before constructing the payload.

## Payment combinations

Every public payment combination explicitly includes:

```text
assetSlug
assetSymbol
networkSlug
paymentMethod
contractAddress
isPrimary
notes
```

A network is never inferred from the asset symbol. Multi-network assets therefore remain unambiguous in public data.

## Evidence

Public evidence is a reviewed summary. It may include:

- evidence kind and A/B/C class;
- source type and polarity;
- public source name;
- source or archive URL;
- observation and publication times;
- a public summary.

At least one source or archive URL is required. Review status, reviewer identity, internal notes, source-record UUIDs, submission IDs, private transaction URLs, and private evidence bodies are not fields in the public schema.

## Media

Public media contains only reviewed derivatives:

- public role;
- HTTPS URL;
- JPEG or WebP MIME type;
- dimensions;
- alt text;
- optional attribution and public license slug.

The public contract does not contain:

- object-storage keys;
- original filenames;
- quarantine or private file locations;
- original HEIC or HEIF uploads;
- evidence images;
- owner-verification proof;
- consent references or private rights-review notes.

Media eligibility and binary processing remain separate from acceptance-claim approval.

## Physical places and map pins

`places.json` combines a publishable entity and location with eligible location-specific claims, reviewed practical Place profile information, public media, and public provenance.

The base location fields remain:

- public Place and entity slugs;
- name and category;
- entity and location status;
- address line, locality, region, postal code, and country;
- coordinates;
- branch-specific website when available.

P4-17C adds optional reviewed practical profile fields:

- `phone`;
- `description`;
- `openingHours`;
- `amenities`;
- `socialLinks`.

These fields are additive and optional. Existing public Place records remain valid when they do not contain them. Absence means that CryptoPayMap does not currently publish that information; UI code must not render absence as a negative fact such as “No amenities”, “No phone”, or “Closed”.

`amenities` is a bounded string array. Duplicate values are rejected in the public projection.

`socialLinks` is a bounded structured array containing:

```text
platform
url
handle
```

Public social links require a stable lowercase platform key and an HTTPS URL. Duplicate `platform + url` pairs are rejected.

Practical Place information is distinct from payment acceptance verification. A phone number, business description, opening-hours text, amenity, or social account does not prove that a payment Claim is Confirmed. Conversely, a valid Confirmed Claim does not imply that optional practical profile fields are available.

`place-pins.json` is deliberately smaller. It contains only the fields needed to render and select a map result:

- public place slug and name;
- category and coarse address labels;
- coordinates;
- confirmed or stale status;
- asset, network, and route facets;
- last confirmation time;
- optional public thumbnail.

Ended records are not map pins. Candidate records are not fallback results.

`places.geojson` represents the same eligible pin set as GeoJSON `Point` features. Coordinates are ordered as longitude, latitude and are range checked.

The complete practical profile contract is documented in `docs/PLACE_PUBLIC_PROFILE.md`.

## Online services

An online-service record contains only `online_service` claims for that same service. It has no location slug or map coordinates.

Public restrictions remain available so records can state conditions such as selected products, new purchases only, renewals only, regional limits, or temporary availability.

## OpenStreetMap location layer

`locations-osm.json` is a separate publishable location layer. It contains:

- public location slug;
- publishable address and coordinates;
- OSM element type and decimal-string identifier;
- source URL;
- required attribution;
- the `odbl-1-0` license marker.

Separating this layer allows combined records to preserve the distinction between OpenStreetMap-derived location data and CryptoPayMap-authored payment verification.

## Stats and updates

Public stats are calculated only from public-eligible projections. The schema does not contain candidate counts, review-queue counts, source-intake totals, or sponsor rankings.

Public updates are reviewed changes such as:

```text
newly_confirmed
reconfirmed
payment_method_changed
marked_stale
ended
new_online_service
```

Raw audit events and ordinary internal processing events are not public updates.

## Manifest and version

The manifest lists recognized public paths only. Each entry includes:

- media type;
- schema version;
- public record count;
- lowercase SHA-256 digest;
- applicable public licenses.

`version.json` includes a literal canonical-only marker:

```json
{
  "projectId": "cryptopaymap",
  "siteName": "CryptoPayMap",
  "registryType": "crypto_payment_acceptance",
  "canonicalOnly": true,
  "verificationMarker": "reviewed_public_records_only"
}
```

This marker describes the publication boundary. It is not a guarantee that every historical fact can never change; confirmation and stale-state rules still apply.

## Validation responsibility

P2-11 validates the explicit shape and cross-field rules for each public file.

P2-12 adds a separate fail-closed publication layer that will:

- build explicit field allowlists;
- scan generated values recursively for forbidden keys and private data classes;
- verify agreement between manifest counts, hashes, and generated files;
- prevent a failed export from replacing the last valid public snapshot.

The two layers are intentionally separate. A strict schema defines what a public record may contain. The leakage validator verifies what an actual generated artifact does contain.

## Change management

Public schema changes require:

1. a reviewed code change;
2. updated validation samples;
3. an explicit schema-version decision;
4. compatibility or migration notes when existing consumers may be affected;
5. a public Changelog review when the changed schema has been released.

P4-17C treats the practical Place profile additions as optional additive fields, so existing records remain valid and no immediate schema-version bump is required before the fields are populated. A future change that makes any of these fields mandatory, changes their meaning, or changes the social-link shape requires an explicit schema-version decision.

Repository-only schema work does not create a public product Changelog entry before the files are released.
