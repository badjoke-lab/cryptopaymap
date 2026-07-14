# P5-05B private Photos intake and quarantine linkage

**Implementation item:** P5-05B  
**Status:** Completed through #217
**Started:** 2026-07-15
**Completed:** 2026-07-15

## Purpose

Persist a valid P5-05A Photos Submission privately and consume its upload reservations in the same database transaction. This slice does not sign uploads, access R2, validate image bytes, create Media records, or publish content.

## Existing reservation investigation

The P5-05B baseline contained no quarantine upload reservation table, service, migration, or durable ownership/expiry state. Existing `media_assets` and `media_files` model reviewed Media metadata and storage files; they are not upload reservations and were not reused as if they were.

P5-05B therefore adds the minimum replaceable private reservation model. A reservation contains only its opaque UUID, owning intake request UUID, explicit purpose, expiry, optional consuming Submission, and consumption timestamps. It contains no storage key, URL, filename, credential, or object payload. Upload signing and object validation remain later work.

## Transaction boundary

The shared Submission persistence batch now optionally receives opaque reservation UUIDs. For Photos intake, one transaction writes:

- the Submission envelope and status-token hash;
- original private payload and review-safe normalized projection;
- protected contact ciphertext and hash when contact is present;
- the private `submission_received` event;
- conditional consumption of every requested reservation.

The conditional update requires every reservation to exist, belong to the same intake request, have `public_gallery_candidate` purpose, remain strictly unexpired, and remain unconsumed. An affected-row guard aborts the transaction unless the complete requested set is consumed. PostgreSQL row locking and the conditional update prevent concurrent reassignment.

## Replay and conflicts

The existing shared canonical fingerprint and deterministic status-secret provider remain authoritative. An identical request UUID and body returns the original public reference, timestamp, and deterministically reproduced status secret without another write or consume. Reusing the UUID with changed content returns the existing generalized idempotency conflict and does not mutate prior state.

Reservation absence, ownership mismatch, purpose mismatch, expiry, prior consumption, or concurrent loss produces a generalized private persistence conflict. The response does not identify which private reservation property failed.

## Privacy boundary

Status-secret plaintext is returned only on accepted intake or deterministic replay; only its verifier hash is stored. Contact plaintext passes through the shared encryption/hash boundary. Review projection and errors contain no contact plaintext, storage location, signed URL, filename, EXIF, GPS, wallet, receipt, ownership secret, object URL, encryption material, or raw request body.

## Explicit non-effects

P5-05B does not add R2 signing or access, binary upload, MIME-byte inspection, image decoding, EXIF processing, derivative generation, Media Asset or Media File creation, approval, gallery ordering, canonical mutation, export, publication, or deployment.

## Completion evidence

Pull request #217 adds the private Photos intake, minimum reservation model, migration 0024, atomic conditional consumption, shared contact and status-secret handling, executable schema validation, and focused commit, replay, changed-content conflict, ownership, expiry, purpose, prior-consumption, concurrency, rollback, and leakage tests.

The final implementation validation passed `npm run quality` with a sandbox-safe Wrangler log path. This covered format, lint, Astro type checking, executable schemas, migration drift, 216 test files and 1,064 tests, build, accessibility, and staging validation. GitHub Actions results for the final documentation head are recorded on #217.

## Next bounded item

P5-05C is the next bounded Photo and Media intake item after P5-05B is merged. Its exact scope remains controlled by the Phase 5 implementation sequence and must not be started as part of this change.
