# CryptoPayMap media policy

## Purpose

This document defines how CryptoPayMap receives, stores, validates, reviews, transforms, publishes, retains, and removes images and other supported media.

Media serves three distinct purposes:

```text
evidence_image
owner_verification_proof
public_gallery_candidate
```

These purposes are never interchangeable by default.

The central rules are:

> Submission approval does not approve media for public display.

> Evidence access does not grant public-gallery rights.

---

## 1. Media principles

1. **Private by default.** New uploads enter private quarantine and are not public URLs.
2. **Purpose is explicit.** Evidence, ownership proof, and public gallery media follow different review and retention paths.
3. **Rights and privacy are separate checks.** A useful image may still be unpublishable.
4. **Originals remain private.** Only reviewed, privacy-safe derivatives may become public.
5. **Metadata is removed before publication.** Public derivatives do not retain EXIF or GPS metadata.
6. **File extensions are not trusted.** The system validates file signatures and decodes or re-encodes accepted files.
7. **No artificial storefront evidence.** AI-generated or unrelated stock imagery must not represent a real business or payment route.
8. **No unauthorized scraping.** Images are not copied from map platforms, business sites, social media, or directories without a documented rights basis.
9. **Public listings do not require images.** A category placeholder is preferable to misleading or unlicensed media.
10. **Removal can be urgent.** Rights, privacy, or safety issues may temporarily hide media before final review.

---

## 2. Media purposes

### 2.1 Evidence image

Evidence images help review a factual claim.

Examples:

- payment sign;
- current checkout screen;
- terminal or invoice flow;
- dated payment receipt with unnecessary information removed;
- storefront context needed to identify a location;
- screenshot showing an applicable payment option.

Evidence images are private or restricted by default. A reviewed factual conclusion may be public even when the original image remains private.

### 2.2 Owner-verification proof

Ownership proof helps verify that a claimant controls or represents a business or service.

Examples:

- temporary website code;
- DNS verification evidence;
- official account confirmation;
- private business correspondence;
- official-domain email verification artifacts.

Ownership proof is never public gallery material by default and has a shorter retention period.

### 2.3 Public-gallery candidate

A public-gallery candidate is offered for public display on a place or service record.

Examples:

- exterior;
- interior;
- product;
- menu;
- payment sign;
- checkout terminal;
- approved cover image.

Public display requires rights review, privacy review, quality review, target matching, metadata removal, and generation of an approved public derivative.

### 2.4 Dual-purpose media

One uploaded image may appear relevant both as evidence and as gallery material, but each purpose receives a separate decision and rights basis.

The system records separate relationships or creates separate reviewed derivatives rather than treating one approval as universal.

---

## 3. Media roles

Supported public or review roles include:

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

### 3.1 Cover image

- zero or one active cover per public record;
- suitable for responsive crops;
- accurately represents the target;
- not dependent on small embedded text;
- no unresolved privacy or trademark confusion.

### 3.2 Gallery image

- may show relevant context beyond the cover;
- display order is reviewed;
- duplicate or near-duplicate images may be rejected;
- galleries remain optional.

### 3.3 Payment sign and checkout terminal

These may provide useful payment context but require special review for:

- QR codes;
- wallet addresses;
- transaction identifiers;
- customer information;
- screen reflections;
- device serial numbers;
- obsolete payment instructions.

---

## 4. Accepted input formats and limits

Initial accepted upload formats:

```text
JPEG
PNG
WebP
HEIC
HEIF
```

Initial public derivative formats:

```text
WebP
JPEG
```

### 4.1 File limits

```text
maximum per file: 5 MB
regular submission total: 20 MB
claim or photos submission total: 40 MB
```

These are product safeguards and may be revised through a documented policy change.

### 4.2 Submission count limits

| Submission route | Evidence or proof | Public-gallery candidates |
|---|---:|---:|
| Suggest | 4 | 2 |
| Payment report | 3 | 0 |
| Problem report | 4 | 0 |
| Claim | 3 | 8 |
| Photos | 0 | 8 |

Limits prevent accidental overcollection and abuse. A reviewer may request a specific replacement rather than encouraging additional bulk uploads.

### 4.3 Unsupported content

Unsupported or rejected content includes:

- executable files;
- archives;
- vector files with active content unless a later controlled path is added;
- animated media unless explicitly supported;
- corrupted files;
- disguised file types;
- oversized images that cannot be processed safely;
- content outside the selected target or purpose.

---

## 5. Upload and storage architecture

### 5.1 Private quarantine

User uploads go directly to private object storage through a short-lived, scoped upload authorization.

The upload authorization limits:

- object path;
- file count;
- file size;
- content type where possible;
- expiration;
- submission relationship.

A successful object upload does not create an approved media record.

### 5.2 Storage responsibilities

```text
Neon
- media metadata
- rights basis
- review status
- target relationships
- hashes
- dimensions
- retention dates
- public derivative references

Private R2 or equivalent
- original uploads
- evidence media
- ownership proof
- quarantine derivatives

Public R2 or equivalent
- approved public derivatives only
```

### 5.3 Object keys

Object keys must not contain:

- email addresses;
- business secrets;
- wallet addresses;
- public status tokens;
- user-supplied filenames;
- unnecessary target names;
- predictable private references.

### 5.4 Original filenames

Original filenames are not used as public URLs. They may be discarded or stored only as restricted metadata when needed for review.

### 5.5 Direct public access

Original and quarantine objects are never made public through object-bucket permissions.

Review access uses authenticated application paths or short-lived signed URLs with no-store behavior.

---

## 6. Validation pipeline

An upload moves through these states:

```text
uploaded
→ validated
→ pending_review
→ approved_private | approved_public | rejected
→ deleted when retention ends
```

### 6.1 Initial validation

The system checks:

- object exists;
- size is within limit;
- magic bytes match a supported format;
- image decoder can read the file;
- pixel dimensions are within safe processing limits;
- file is not an archive or executable;
- content hash is computed;
- duplicate and known-abuse hashes are checked;
- submission and purpose relationships are valid.

### 6.2 Safe decoding and re-encoding

Before public use, the image is decoded and re-encoded through the approved processing pipeline.

Re-encoding:

- removes hidden payloads not needed for display;
- strips metadata;
- normalizes orientation;
- creates bounded dimensions;
- produces supported public formats.

### 6.3 Metadata removal

Public derivatives remove:

- EXIF;
- GPS coordinates;
- device model and serial data;
- capture software metadata;
- embedded thumbnails;
- unnecessary color-profile or comment metadata where safe.

The reviewed capture date may remain as structured database metadata when useful and permitted.

### 6.4 Duplicate detection

Exact and perceptual hashes may identify:

- repeated uploads;
- near-duplicate gallery candidates;
- previously rejected material;
- reuse across unrelated targets.

A duplicate flag requires review; it does not automatically prove misuse.

---

## 7. Privacy and safety review

Before public approval, reviewers check for:

- recognizable faces;
- children;
- vehicle license plates;
- addresses unrelated to the listed business;
- receipts and order details;
- names, email addresses, phone numbers, or account identifiers;
- wallet addresses;
- transaction hashes;
- QR codes;
- payment links;
- private screens or messages;
- access badges;
- security systems;
- sensitive medical, religious, political, or other contextual information;
- dangerous or unlawful content.

### 7.1 Redaction

When a useful public image contains limited removable private information, a reviewer may approve a redacted derivative.

Redaction is applied to a derivative. The private original remains restricted until deletion under the applicable retention schedule.

### 7.2 QR codes and wallet addresses

A public image containing a payment QR or wallet address requires confirmation that:

- it is intended for public payment use;
- it belongs to the correct target;
- it is current;
- publication does not expose a personal or temporary address;
- displaying it will not cause users to bypass the intended checkout flow.

When these conditions are not clearly met, the QR or address is obscured in the public derivative.

### 7.3 Faces and license plates

Incidental faces and plates are removed, blurred, cropped, or otherwise made non-identifiable unless a documented rights and privacy basis permits public display.

### 7.4 Evidence minimization

Reviewers should request the least sensitive evidence sufficient for the decision.

A submitter should not be asked to provide a seed phrase, private key, full wallet history, identity document, full bank record, or unnecessary personal account access.

---

## 8. Rights review

### 8.1 Accepted rights bases

Public media requires one of these documented bases:

- submitted by the copyright holder;
- submitted by an authorized business representative with authority over the media;
- written permission from the rights holder;
- compatible open license;
- public-domain status with documented basis;
- created by CryptoPayMap.

### 8.2 Unaccepted sources

CryptoPayMap does not publish media copied without permission from:

- Google Maps or similar map services;
- business websites;
- social-media posts;
- review platforms;
- delivery platforms;
- third-party directories;
- processor marketing pages;
- other businesses;
- stock-photo sites without a compatible license.

Linking to a source page does not grant republication rights.

### 8.3 Evidence-only permission

Evidence-only permission authorizes CryptoPayMap to:

- receive;
- store privately;
- validate;
- process for review;
- create internal review derivatives;
- retain according to policy;
- use the reviewed factual conclusion.

It does not authorize public gallery display or open-data redistribution of the original.

### 8.4 Public-gallery permission

A contributor offering public-gallery media confirms that they own the media or are authorized to license it and grants CryptoPayMap a non-exclusive, worldwide, royalty-free permission to:

- host;
- display;
- resize;
- crop;
- re-encode;
- create responsive derivatives;
- use the media on the applicable listing and in project promotion;
- remove the media when required.

The contributor retains ownership.

The media is not automatically licensed to third parties under ODC-By or CC BY.

### 8.5 Open-licensed media

An open-licensed item records:

- license name and version;
- source URL;
- creator;
- attribution text;
- modification notice;
- compatibility with the intended use.

A license label without a traceable source is insufficient.

### 8.6 Business claims and media authority

Verified business representation does not automatically prove rights in every supplied image. The claimant confirms authority for each media item or provides a separate rights basis.

---

## 9. Accuracy and target review

A public image must accurately represent the target.

Reviewers verify:

- correct business or service;
- correct branch where location-specific;
- reasonable capture date;
- current branding where materially relevant;
- no unrelated storefront or product;
- no misleading crop;
- no representation of temporary payment material as permanent acceptance;
- no image from another branch presented as the listed location.

### 9.1 AI-generated and stock imagery

AI-generated or generic stock imagery must not be used to represent a real place, real terminal, real payment sign, or real acceptance route.

A neutral category illustration may be used as a clearly non-photographic placeholder when it cannot reasonably be mistaken for the real business.

### 9.2 Historic media

Historic images may be retained as evidence or history but are not used as the active cover unless clearly labeled and still accurate.

---

## 10. Public derivative pipeline

Initial public derivatives may include:

```text
cover-large   1600 × 900
cover-medium   960 × 540
card           480 × 320
thumbnail      160 × 160
```

### 10.1 Processing requirements

- preserve useful subject content;
- avoid stretching;
- apply reviewed crop rules;
- generate bounded dimensions;
- use reasonable compression;
- remove private metadata;
- maintain color and orientation;
- record output hash, dimensions, MIME type, and creation time;
- keep the processing engine replaceable.

### 10.2 Cover crops

A cover may require multiple responsive crops. The original is never exposed as a fallback public URL.

### 10.3 Alt text

Public media requires concise alt text that describes relevant visible content without asserting unverified payment facts.

Preferred:

> Exterior of Example Café with a Bitcoin payment sign near the entrance.

Avoid:

> This café always accepts Bitcoin.

Verification claims belong in structured record content, not image alt text.

### 10.4 Processing failure

If processing fails:

- the original remains private;
- no public URL is generated;
- the media cannot become `approved_public`;
- the reviewer may request a replacement;
- the public listing continues with another approved image or placeholder.

---

## 11. Review decisions

### 11.1 Approved private

`approved_private` means the media may be retained for evidence or ownership review but is not public.

### 11.2 Approved public

`approved_public` requires:

- target match;
- public-purpose selection;
- valid rights basis;
- privacy review;
- safe derivative;
- public storage key;
- alt text;
- attribution where required;
- no unresolved safety issue.

### 11.3 Rejected

Rejection reasons may include:

```text
unsupported_format
corrupt_file
file_too_large
malware_or_active_content
wrong_target
duplicate_or_low_value
insufficient_quality
no_rights_basis
privacy_risk
sensitive_payment_information
misleading_or_outdated
ai_or_stock_misrepresentation
prohibited_content
```

### 11.4 Deleted

`deleted` records the removal outcome. The object is removed according to storage operations, while limited decision and hash metadata may remain when lawful and necessary for audit or duplicate control.

---

## 12. Submission and media decision separation

A submission resolution and media resolution are independent.

Examples:

- a suggestion is accepted as a candidate while all images are rejected;
- a payment report is accepted as evidence while its screenshot remains private;
- a business claim is verified while its gallery images require rights clarification;
- a problem report causes an image takedown without changing the acceptance claim;
- a listing is confirmed with no image and uses a category placeholder.

The status page displays each public media decision separately from the submission's factual resolution.

---

## 13. Retention

Initial retention rules:

| Media category | Retention |
|---|---|
| Rejected or duplicate upload | Delete object 30 days after submission closure |
| Private evidence media | Delete object 180 days after final resolution unless a documented review, dispute, or legal basis requires longer retention |
| Owner-verification proof | Delete object 90 days after verification completion, rejection, expiry, or revocation unless a documented basis requires longer retention |
| Approved public media | Retain while published and until removal, replacement, rights expiry, or record retirement requires review |

### 13.1 Retention metadata

Each private object has:

- media purpose;
- review status;
- final resolution date;
- `delete_after` date;
- hold or exception reason where applicable;
- deletion result.

### 13.2 Audit retention

After an object is deleted, the system may retain limited metadata such as:

- content hash;
- decision;
- reason code;
- rights outcome;
- deletion timestamp;
- target relationship;
- audit event.

The retained metadata must not reconstruct the deleted personal or private content.

### 13.3 Retention extensions

An extension requires a documented reason, such as:

- active rights dispute;
- active privacy request;
- unresolved submission;
- security investigation;
- legal preservation requirement.

Extensions are reviewed and are not indefinite by default.

---

## 14. Removal and takedown

### 14.1 Request channels

A person may report:

- unauthorized image use;
- personal information;
- incorrect attribution;
- wrong business or branch;
- misleading or outdated image;
- trademark confusion;
- safety concern;
- private evidence exposure.

### 14.2 Urgent hiding

A credible privacy, rights, or safety report may immediately set:

```text
visibility = restricted
```

or remove the public derivative while review continues.

This media action does not automatically change the underlying acceptance claim.

### 14.3 Review target

Removal requests are reviewed promptly, with a normal target of completing the initial decision within 30 days. Urgent exposure may be hidden immediately.

This target is an operational goal, not a guarantee.

### 14.4 Replacement

When the issue affects only one image, the record may continue using another approved image or a category placeholder.

### 14.5 Cached copies

After removal, the system invalidates or replaces accessible cached copies under project control and records the action.

---

## 15. MVP-A and MVP-B media scope

### 15.1 MVP-A

MVP-A supports operator-managed media only.

- operator uploads through an authenticated path;
- processing uses an internal controlled script or service;
- originals remain private;
- only approved derivatives are public;
- public listings support placeholders when no media exists.

### 15.2 MVP-B

MVP-B adds user uploads.

- short-lived scoped upload authorization;
- direct upload to quarantine;
- asynchronous or controlled processing;
- per-file validation;
- submission and media review queues;
- public status decisions;
- retention and deletion jobs.

The processing engine remains replaceable and does not require one proprietary image-transformation provider.

---

## 16. Public presentation

### 16.1 No-image state

A listing with no approved media uses a category-based placeholder or neutral interface treatment.

The placeholder is clearly illustrative and does not depict a fabricated version of the real business.

### 16.2 Gallery behavior

Suggested behavior:

```text
0 images   placeholder
1 image    large cover
2–4        cover plus grid
5+         cover, selected thumbnails, and View all
```

Mobile galleries use touch-friendly horizontal navigation and accessible controls.

### 16.3 Attribution

Required media attribution appears near the image, in the gallery detail, or through an accessible attribution control appropriate to the license.

Attribution is not hidden only in source code or inaccessible metadata.

### 16.4 Download and reuse

Public display does not imply a general download or reuse license. The interface and data manifest distinguish media rights from public data and text licenses.

---

## 17. Security requirements

- quarantine objects are private;
- signed review URLs are short-lived;
- file signatures are validated;
- image decoding runs with bounded resources;
- dimensions and decompression limits prevent image bombs;
- user filenames are not executed or trusted;
- HTML and SVG active content are not accepted through the initial image path;
- logs redact storage secrets and signed URLs;
- public object keys are unguessable enough to avoid exposing review history;
- deletion jobs are idempotent;
- a failed public derivative cannot fall back to the private original;
- upload and processing events are auditable.

Detailed security controls are defined in the security architecture.

---

## 18. Media checklist

Before public approval, verify:

- [ ] The target and branch are correct.
- [ ] The media purpose is explicit.
- [ ] The file passed signature, decode, dimension, and size validation.
- [ ] The source and rights basis are documented.
- [ ] Public-gallery permission is present.
- [ ] Faces, plates, receipts, QR codes, wallet addresses, and personal information were reviewed.
- [ ] Metadata and GPS were removed from the public derivative.
- [ ] The image is not unauthorized third-party material.
- [ ] The image is not AI-generated or stock media presented as the real target.
- [ ] The public derivative was re-encoded and stored separately from the original.
- [ ] Alt text is accurate and does not make unverified claims.
- [ ] Attribution is visible where required.
- [ ] Retention and deletion dates are assigned to private material.
- [ ] Submission resolution and media resolution remain separate.
