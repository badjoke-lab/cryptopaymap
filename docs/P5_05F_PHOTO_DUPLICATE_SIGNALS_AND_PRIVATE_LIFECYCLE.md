# P5-05F photo duplicate signals and private lifecycle cleanup

**Implementation item:** P5-05F  
**Status:** Completed through #221  
**Started:** 2026-07-15  
**Completed:** 2026-07-15

## Purpose

Complete the remaining private-media safeguards in the P5-05 repository sequence before public Photos route wiring. This slice exposes exact original-image hash matches only as protected review signals and deletes retention-eligible quarantine or private objects without deleting audit, decision, relationship, or limited hash metadata.

## Duplicate review signals

The existing protected Media detail workspace now derives duplicate signals from the SHA-256 hash of the `original` Media File.

A signal contains only:

- the current original content hash;
- the matching opaque Media Asset UUID;
- the matching Media subject identity;
- whether the match belongs to the same subject;
- the matching review status and visibility;
- the matching Media creation timestamp;
- bounded `hasMore` and manual-review indicators.

The query:

- excludes the current Media Asset;
- excludes deleted Media Assets;
- returns at most 25 unique matching Media Assets;
- orders matches deterministically;
- distinguishes same-target and different-target reuse;
- exposes no storage key, original filename, object URL, contact, status secret, or contributor identity.

An exact hash match does not automatically reject Media, prove infringement, prove spam, or establish a rights decision. `automaticDecision` is always `false`, and a non-empty match set requires manual review.

P5-05F does not add perceptual hashing or a known-abuse hash service.

## Private cleanup reasons

The cleanup contract accepts only these reasons:

- `expired_authorization`;
- `closed_submission_without_handoff`;
- `rejected_media`;
- `superseded_media`.

Each candidate is validated before any object deletion.

### Expired authorization

An unconsumed quarantine reservation becomes eligible when its authorization expiry has passed. The candidate can delete only the deterministic quarantine object derived from that opaque reservation UUID.

### Closed Photos Submission without Media handoff

A terminal Photos Submission becomes eligible after the 30-day terminal retention boundary when:

- it is duplicate, rejected as spam, withdrawn, or resolved with a non-approval, duplicate, no-change, or withdrawal outcome;
- it has no `photo_media_handoff_created` event;
- its consumed quarantine reservations can be identified exactly.

This prevents abandoned or rejected uploads from remaining indefinitely while protecting active review material.

### Rejected or superseded photo Media

A P5-05 Media Asset becomes eligible after both the Media Asset and its Photos Submission have remained terminal for at least 30 days.

The candidate must:

- have `rejected` or `superseded` Media review status;
- belong to a Photos Submission through the strict P5-05E handoff event;
- retain only quarantine or private Media Files;
- match the exact handoff payload and Submission;
- use canonical quarantine or private derivative object keys.

Pending, accepted, public, restricted-but-active, or unrelated operator-managed Media is never selected by this cleanup reader.

## Canonical-key and scope guard

Before deletion, every object must satisfy one of two shapes:

1. a quarantine `original` using the deterministic reservation key; or
2. a private `display` or `thumbnail` derivative using the existing canonical Media derivative key, exact Media File UUID, content hash, and JPEG or WebP type.

A `public` storage scope, arbitrary path, original filename path, mismatched Media identifier, or malformed hash is rejected before deletion.

## Execution and replay

The provider-neutral cleanup service:

- loads at most 100 candidates and honors the requested lower limit;
- rejects duplicate candidate references;
- validates each retention boundary before deletion;
- caches an object result within one run so one physical object is not deleted twice;
- treats an already missing object as an idempotent replay;
- continues independent deletions after one failure;
- returns `partial` when any deletion fails;
- exposes counts and opaque reference identities without returning storage keys.

The R2-compatible adapter checks object existence, deletes from the correct quarantine or private bucket, and verifies that the object is absent afterward. The in-memory adapter supports deterministic unit tests.

P5-05F does not add a scheduler, production bucket binding, or automatic retry worker.

## Persistence boundary

No database migration is required.

P5-05F deliberately leaves existing rows in place so lawful and necessary limited metadata can continue to support:

- audit history;
- review decision history;
- content-hash duplicate control;
- target relationships;
- deletion and retention evidence.

Private object deletion does not mutate canonical Entity, Location, Claim, Evidence, or public export state.

## Explicit non-effects

P5-05F does not add:

- perceptual or near-duplicate hashing;
- a malware or known-abuse hash provider;
- an automatic duplicate, infringement, spam, or rights decision;
- public duplicate signals;
- cleanup of pending, accepted, or public Media;
- public-object deletion or cache invalidation;
- production R2 bindings or scheduled cleanup execution;
- public Photos HTTP routes or browser form;
- protected Media decision execution;
- canonical mutation, export, publication, or deployment.

## Completion evidence

Implementation head `93efec323a9003efd50c0b8191a4d593a64adbdd` passed:

- format and lint;
- Astro and TypeScript;
- executable runtime and submission schema checks;
- migration history and drift;
- 224 test files and 1,105 tests;
- build, accessibility, Phase 1, and staging artifact checks;
- Foundation validation, Migration drift, Staging review validation, and representative screenshot capture.

No migration was required.

## Next bounded item

P5-05G will add the public Photos upload-authorization and private-intake HTTP boundaries. It must reuse the common Turnstile, rate-limit, status-secret, contact-protection, and safe-response conventions while keeping direct object upload, private Submission creation, processing, Media review, and publication as separate authenticated or asynchronous boundaries.

The browser `/photos` form, configured object-storage and processing composition, and final P5-05 integration audit remain later bounded slices.
