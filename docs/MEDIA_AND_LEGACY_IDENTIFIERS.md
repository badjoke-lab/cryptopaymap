# CryptoPayMap media metadata and legacy identifiers

## Purpose

CryptoPayMap stores media metadata in PostgreSQL and stores image binaries outside the database. Media review, rights review, public distribution, and canonical-record approval remain separate decisions.

```text
media asset
  -> original file in quarantine or private storage
  -> reviewed display derivative
  -> optional thumbnail derivative
```

Legacy identifiers preserve migration and redirect history without treating old records as confirmed under the new verification policy.

## Media assets and files

A media asset describes the reviewed object:

- purpose and role;
- review status;
- rights status and license;
- visibility;
- exactly one canonical or private subject;
- attribution and alt text;
- rights holder or consent reference;
- display order;
- capture, publication, and deletion times.

A media file describes one stored binary variant:

- original, display, or thumbnail;
- quarantine, private, or public storage scope;
- object-storage key;
- original filename when applicable;
- MIME type, byte size, dimensions, and SHA-256 hash.

The database never contains the image bytes.

## Media purposes

```text
evidence
owner_verification
public_gallery_candidate
public_gallery
canonical_logo
```

These purposes are not interchangeable.

- Evidence media remains separate from gallery media.
- Owner-verification proof is private verification material.
- A public-gallery candidate is not public merely because the related claim or submission was accepted.
- A gallery candidate must be reviewed and promoted to the `public_gallery` purpose.
- A canonical logo is reviewed independently from other gallery images.

## Media roles

Public gallery roles are:

```text
cover
gallery
exterior
interior
product
menu
payment_sign
checkout_terminal
```

Special roles are:

```text
logo
evidence_image
owner_verification_proof
```

Purpose and role must agree. Evidence and owner-verification media cannot use public gallery roles, and public gallery media cannot use verification-proof roles.

## Subjects

A media asset targets exactly one of:

```text
entity
location
acceptance claim
evidence
submission
source record
```

Entity, location, claim, evidence, and source-record references use foreign keys. Submission references remain UUID-only until the submission tables are introduced in Phase 5.

A source record supporting media attached to a location or entity is linked through the provenance layer rather than by assigning two media subjects.

## Review, rights, and visibility

Review statuses are:

```text
pending
accepted
rejected
superseded
```

Rights statuses are:

```text
unknown
submitted_with_permission
licensed
public_domain
restricted
```

Visibility values are:

```text
private
public
restricted
```

Public visibility requires all of the following:

- accepted review status;
- `public_gallery` or `canonical_logo` purpose;
- publishable rights;
- publication time;
- non-empty alt text;
- no deletion time.

Licensed media requires a license record. Submitted media requires a rights holder or consent reference. Evidence, owner-verification, and gallery-candidate media cannot be public.

When a license requires attribution, the publication validator requires attribution text before a public file can be emitted.

## File variants and storage scopes

Variants are:

```text
original
display
thumbnail
```

Storage scopes are:

```text
quarantine
private
public
```

Rules:

- Original uploads are never public.
- Original filenames are retained only on original files.
- A media asset has at most one file for each variant.
- Public files are reviewed display or thumbnail derivatives.
- Public derivatives use JPEG or WebP.
- HEIC and HEIF are accepted only as original uploads and require conversion before publication.
- File metadata includes a lowercase SHA-256 content hash.
- Storage keys are relative object-storage keys and cannot contain directory traversal.

P2-10 defines metadata and validation only. R2 bucket creation, upload credentials, and binary processing are introduced in later media and submission work.

## Legacy identifiers

Legacy source systems are:

```text
cryptopaymap_v2
crypto_acceptance_registry
```

Migration statuses are:

```text
pending
mapped
unresolved
retired
```

### Pending

The legacy record has not been resolved. It has no canonical target, canonical path, or resolution time.

### Mapped

The legacy record has exactly one canonical target, a canonical path, and a resolution time.

```text
cryptopaymap_v2
  -> physical location

crypto_acceptance_registry
  -> online or other canonical entity
```

### Unresolved

No safe canonical target can be identified. The record has a resolution time and explanatory note but no canonical path or target.

### Retired

The legacy identifier is intentionally retired. It has a resolution time and explanatory note but no target.

Legacy IDs are unique within their source system. Legacy paths are unique when present and contain no query string or fragment. A mapped canonical path must differ from the legacy path.

## Verification boundary

Legacy mappings preserve identity and redirect history only. They do not:

- create a Confirmed acceptance claim;
- copy an old verification state;
- expose an old candidate publicly;
- bypass Evidence, network, route, payment-method, or How-to-pay requirements.

Legacy imports still enter through source records and private candidates before reviewed canonical promotion.

## Public boundary

Later public exports may include explicitly allowlisted public derivative metadata and canonical redirect targets.

Public output must never include:

- quarantine or private storage keys;
- original filenames;
- original uploads;
- owner-verification proof;
- private or restricted evidence media;
- consent references;
- private rights-review metadata;
- unresolved legacy source payloads;
- internal migration notes.

P2-11 defines public export schemas. P2-12 adds the allowlist and leakage validator that enforce this boundary.
