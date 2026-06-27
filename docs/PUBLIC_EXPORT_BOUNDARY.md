# CryptoPayMap public export boundary

## Purpose

CryptoPayMap does not publish database rows directly. A generated release must pass a fail-closed validation boundary before it can be considered eligible to replace the last valid public snapshot.

P2-11 defines the shape of each public JSON and GeoJSON file. P2-12 validates the complete release as one coordinated set.

## Validation order

A candidate release is checked in the following order:

1. every path must be on the public export allowlist;
2. all required public files must be present;
3. each file must pass its strict public schema;
4. nested content must not contain fields or URI schemes outside the public contract;
5. dataset versions, schema versions, and generation timestamps must agree;
6. the manifest must contain exactly one entry for every inventory file;
7. manifest media types, record counts, and SHA-256 digests must match the files;
8. only after all checks pass is an immutable validated release set returned.

Any failure rejects the whole candidate release. Partial validation is not publication approval.

## Public path allowlist

The allowlist is the exact set declared by `publicExportPaths`:

```text
/data/locations-osm.json
/data/acceptance-claims.json
/data/place-pins.json
/data/places.json
/data/places.geojson
/data/online-services.json
/data/stats.json
/data/updates.json
/data/assets.json
/data/networks.json
/data/manifest.json
/version.json
```

An extra file is rejected even when its JSON is otherwise valid. A missing file also rejects the release.

## Strict schema layer

Every file is parsed through its P2-11 schema. Public objects reject unknown keys rather than stripping them silently.

This prevents an operational record from becoming publishable merely because it can be serialized. Export builders must construct named public projections and provide only the fields defined by the contract.

## Recursive content scan

After schema parsing, the validator walks every nested object and array.

It rejects field-name patterns associated with operational-only material, including internal, candidate, submission, review, contact, audit, storage, payload, credential, and secret-bearing fields. It also rejects non-public URI schemes such as local files, object-storage references, embedded data, and private bucket identifiers.

The recursive scan is defense in depth. The strict schemas remain the primary field allowlist.

## Stable canonical JSON

Hashes use a deterministic JSON representation:

- object keys are sorted recursively;
- array order is preserved;
- the serialized document ends with a newline;
- SHA-256 is calculated with the platform Web Crypto implementation.

The same logical object therefore produces the same digest regardless of object insertion order.

## Manifest inventory

The manifest inventories every public file except the manifest itself. Each entry contains:

- exact public path;
- JSON or GeoJSON media type;
- schema version;
- public record count;
- SHA-256 digest;
- applicable public licenses.

The validator rejects:

- missing entries;
- duplicate entries;
- entries for files outside the release inventory;
- incorrect media types;
- incorrect counts;
- incorrect schema versions;
- incorrect hashes.

`version.json` is included in the manifest inventory. The manifest is excluded because including its own digest would create a circular value.

## Release consistency

All files in one release must use the same:

- `schemaVersion`;
- `generatedAt` value.

The manifest and version file must also use the same `datasetVersion`.

A file produced by a different build or generation time cannot be mixed into the release without failing validation.

## Record counts

Counts are calculated from the actual artifact:

- record files use `records.length`;
- GeoJSON uses `features.length`;
- Stats and Version each count as one document;
- the manifest is not part of its own inventory.

Counts are public dataset counts only. Candidate queues and operational review totals remain outside this layer.

## Immutable validated result

A successful call returns a deeply frozen artifact map. Publication code can calculate a stable release digest from this validated map.

The validator has no publication side effects. It does not write to the final public directory, deploy to Cloudflare, or update a database publication state. A later publisher must preserve this sequence:

```text
build candidate files
→ validate complete set
→ stage validated snapshot
→ atomically switch public pointer
→ record successful publication
```

A failed candidate must leave the previous valid public snapshot unchanged.

## Automated checks

The repository checks a complete representative release and confirms that it succeeds. It also confirms failure for cases including:

- an extra unapproved path;
- a missing required file;
- a candidate acceptance status;
- an unexpected operational field;
- a wrong manifest hash;
- a wrong manifest count;
- a generation-time mismatch.

The checks run through the unit-test workflow and are independent of Cloudflare or a live database.

## Scope boundary

P2-12 provides validation and release-set integrity. It does not yet provide:

- database queries that construct the projections;
- physical or online legacy importers;
- a filesystem or object-storage publisher;
- live public data;
- publication scheduling.

Those later components must call this boundary rather than bypass it.
