# P5-05A Photo and Media submission contract and normalization

**Implementation item:** P5-05A  
**Status:** Active  
**Started:** 2026-07-14

## Purpose

Define strict Photo and Media Submission contracts before private intake, object signing, binary validation, processing, review, or publication is connected.

## Purpose separation

Submission Media has three explicit purposes:

```text
evidence_image
owner_verification_proof
public_gallery_candidate
```

Each purpose has a distinct role and publication boundary:

- `evidence_image` uses the `evidence_image` role and never receives public-display permission during intake;
- `owner_verification_proof` uses the `owner_verification_proof` role and never receives public-display permission;
- `public_gallery_candidate` uses a public gallery role and requires an explicitly publishable declared rights basis plus public-display permission.

The `/photos` Submission type accepts `public_gallery_candidate` items only. Evidence and owner proof remain reusable item contracts for their own parent Submission flows but cannot be smuggled through the Photos route.

## Target and limits

A Photos Submission:

- targets exactly one existing Entity or Location UUID;
- contains between one and eight unique quarantine upload references;
- accepts JPEG, PNG, WebP, HEIC, or HEIF declarations;
- limits each declared file to 5,000,000 bytes;
- carries no general Evidence URL list;
- records an explicit submitter relationship;
- remains private and non-canonical.

A declared MIME type and size do not prove the uploaded object is valid. P5-05B and later processing slices must verify object existence, byte size, magic bytes, decoding, dimensions, hash, privacy, and duplication independently.

## Rights declaration

Public gallery candidates require one of:

```text
submitted_with_permission
licensed
public_domain
```

Submitted permission requires a rights-holder or permission-reference presence declaration. Licensed media requires a bounded license name and HTTPS license URL. Unknown or restricted rights cannot enter the Photos public-gallery candidate contract.

Rights declaration is not publication approval. Review, privacy checks, quality checks, metadata removal, derivative generation, and a separate public-Media decision remain required.

## Quarantine reference boundary

The contract accepts only an opaque UUID `quarantineUploadId`.

It does not accept:

- storage keys;
- signed URLs or credentials;
- user-supplied filenames;
- EXIF or GPS payloads;
- wallet addresses;
- receipt/customer data;
- status secrets;
- public object URLs.

The opaque reference is review material, not public data and not proof that an object exists.

## Review-safe projection

Normalization retains only:

- target type and ID;
- submitter relationship;
- opaque quarantine upload ID;
- purpose and role;
- declared MIME type and size;
- optional capture date and safe descriptions;
- photographer-presence declaration;
- bounded rights-status and permission-presence declarations;
- optional public license metadata;
- explicit public-display permission intent.

Normalization excludes contact details and all storage, signing, filename, EXIF, GPS, wallet, receipt, and status-secret material.

## Non-effects

P5-05A does not:

- sign an upload;
- access R2 or any object store;
- trust declared MIME or byte size;
- create a Media Asset or Media File;
- approve rights or privacy;
- approve a Submission;
- create public derivatives;
- choose a cover image;
- change a canonical Entity or Location;
- export or publish Media.

## Completion gate

Strict runtime schemas accept bounded target-aware Photos submissions, preserve purpose/role/rights separation, create a privacy-safe review projection, and reject unsupported, oversized, duplicate, mixed-purpose, non-publishable, or secret-bearing payloads.

## Next

P5-05B will add idempotent private Photos intake and durable linkage to existing quarantine upload reservations without creating Media assets or public object access.
