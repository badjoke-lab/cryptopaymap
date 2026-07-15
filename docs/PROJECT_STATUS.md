# CryptoPayMap project status

**Last verified:** 2026-07-15

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-05I — Configured Photos object-storage signing and direct-upload integration audit

## Current repository state

- Phase 0 through Phase 4 are complete for the Phase 5 handoff.
- P5-01 shared Submission foundation is complete through #150–#155.
- P5-02 Suggest Place and Online Service is complete through #156–#192.
- P5-03 Payment and problem reports is complete through #194–#202.
- P5-03I fixed-review deployment and live-audit receipts are complete for main commit `bd08118b63feab6349e125db300c6031f2653f84`.
- P5-04A business Claim contract and normalization were established in #203 and privacy/correction semantics were hardened in #206 at main commit `944773ad8a4c1bcc25de3f3f0745917d37def4e3`.
- P5-04B idempotent private business Claim intake integration completed in #207 at main commit `cb55ad961f213fd8a6e5f86e81a16abd486505cb`.
- P5-04C protected canonical target context and bounded read-only Claim review signals completed in #208 at main commit `80d30b21cb92475b309f7501f2d27c32b06935f3`.
- P5-04D protected business Claim reviewer queue and detail entry completed in #209 at main commit `ec2048faea97ce3efdc4710d42ea9cf83135d0b6`.
- P5-04E exact-state review transitions and verification-request preparation completed in #210 at main commit `e1369049529055939dc955318e76a2a3005df7b4`.
- P5-04F verification execution and bounded result recording completed in #211 at main commit `3ffe59c0e2d773c11cff066adcaf1cb1d099e76d`.
- P5-04G representative-relationship decisions completed in #212 at main commit `dc1649cea5731bf12dd8a86ec6fba894be6c1def`.
- P5-04H1 strict field-level decision and canonical projection completed in #213 at main commit `3d1b2f65101dd0b4a432e52b5ad32476cbcf8467`.
- P5-04H2 durable exact-state canonical persistence, private payment drafts, provenance, receipts, replay, and rollback completed in #214 at main commit `01beaf5b7fa0611f77730bd5ff6e5a0855616bf3`.
- P5-04H3 protected reviewer workspace/API, one-time application guard, and integration audit completed in #215 at main commit `5a8d6a1d40db415931a11941e2a23869157eacfd`.
- P5-04 Business and service claims are repository-complete.
- P5-05A Photo and Media contracts and review-safe normalization completed through #216.
- P5-05B idempotent private Photos intake and quarantine reservation linkage completed in #217.
- P5-05C photo quarantine upload authorization and durable reservation issuance completed in #218.
- P5-05D private object existence and byte-level validation completed in #219.
- P5-05E controlled private processing and protected Media handoff completed in #220.
- P5-05F exact original-hash review signals and retention-safe private object cleanup completed in #221.
- P5-05G public upload-authorization and private-intake HTTP boundaries completed in #222.
- P5-05H browser `/photos` form and direct-upload orchestration completed in #223.
- P5-05I is next; its bounded scope is configured private object-storage signing and binding plus a synthetic direct-upload integration audit without automatic processing, Media approval, or publication.

## P5-05A completion result

P5-05A provides:

- explicit evidence-image, owner-verification-proof, and public-gallery-candidate purposes;
- strict purpose-to-role compatibility;
- Photos-route restriction to public-gallery candidates only;
- exact existing Entity or Location UUID targets;
- one to eight unique opaque quarantine upload UUIDs;
- declared JPEG, PNG, WebP, HEIC, and HEIF types;
- a 5,000,000-byte declared per-item limit;
- submitted-permission, licensed, and public-domain gallery rights declarations;
- explicit public-display permission intent without publication approval;
- privacy-safe review normalization;
- rejection of storage keys, signed URLs, original filenames, EXIF, GPS, wallet, receipt, status-secret, and undeclared fields;
- no R2 access, Media creation, canonical mutation, export, or publication.

## P5-05B completion result

P5-05B provides:

- idempotent private Photos Submission intake;
- one durable Submission and normalized payload transaction;
- private contact encryption/hash handling through the shared Submission boundary;
- validation that every opaque upload UUID refers to an existing unexpired quarantine reservation owned by the same intake attempt;
- atomic reservation consumption or linkage without public storage-key exposure;
- deterministic replay and changed-content conflicts;
- private status-token issuance without plaintext persistence;
- no Media Asset, Media File, derivative, public URL, review approval, export, or publication creation.

## P5-05C completion result

P5-05C provides:

- a strict one-to-eight item Photos upload-authorization request;
- deterministic opaque reservation UUIDs bound to canonical request content;
- durable reservation creation through the existing P5-05B table;
- transaction-serialized exact replay and changed-content conflict behavior;
- short-lived provider-neutral HTTPS PUT authorization;
- signed content-type and private validation metadata headers;
- signer-failure retry without duplicate reservation creation;
- no signed URL persistence, R2 credentials, binary validation, Media creation, or publication.

## P5-05D completion result

P5-05D provides:

- exact active Entity or Location target validation;
- exact unexpired and unconsumed quarantine reservation-set validation;
- bounded private object reads that reject oversized provider metadata before body allocation;
- exact private key, content-type, signed metadata, and byte-size matching;
- structural JPEG, PNG, WebP, HEIC, and HEIF inspection;
- rejection of corrupted, animated, executable, archive, document, unsupported, and disguised files;
- 20,000-pixel axis and 100,000,000-pixel total safety limits;
- SHA-256 content hashes and a leakage-safe validation receipt;
- injectable decoding and R2-compatible storage boundaries;
- no production R2 binding, EXIF removal, derivative generation, Media creation, canonical mutation, export, or publication.

## P5-05E completion result

P5-05E provides:

- exact Photos Submission, target, normalized item, validated byte, and consumed reservation matching;
- immediate SHA-256 re-verification before processing;
- an injectable controlled processor contract requiring metadata removal and orientation normalization;
- bounded, structurally revalidated JPEG or WebP display and thumbnail derivatives;
- canonical private derivative keys and idempotent R2-compatible writes;
- deterministic Media Asset/File and private handoff-event identities;
- one private pending `public_gallery_candidate` Media Asset per submitted item;
- quarantine original plus private display and thumbnail Media Files;
- Submission-scoped atomic persistence and one-handoff-per-Submission protection;
- replay that remains stable after later Submission workflow updates;
- cleanup of newly staged derivatives after failed database handoff;
- no production codec or R2 binding, Media approval, public storage copy, canonical mutation, export, or publication.

## P5-05F completion result

P5-05F provides:

- exact original SHA-256 matches as protected Media review signals;
- same-target and different-target match context without contributor or storage disclosure;
- a strict maximum of 25 unique matches and no automatic duplicate, misuse, rights, or rejection decision;
- retention candidates for expired unconsumed authorization objects;
- 30-day terminal cleanup for closed Photos Submissions without a Media handoff;
- 30-day terminal cleanup for rejected or superseded P5-05 Media;
- canonical quarantine/private object-key validation before deletion;
- explicit rejection of public-scope, pending, accepted, or unrelated Media cleanup;
- idempotent R2-compatible deletion and partial-failure reporting;
- limited database hash, decision, target, and audit metadata retention after object deletion;
- no perceptual hashing, known-abuse provider, scheduler, production R2 binding, public route, canonical mutation, export, or publication.

## P5-05G completion result

P5-05G provides:

- `POST /api/photos/upload-authorizations` and `POST /api/photos`;
- strict JSON media type and a streamed 128 KiB request limit;
- UUID idempotency identities and exact upload-authorization request matching;
- trusted Cloudflare edge identity and opaque distributed rate-limit buckets;
- rate limiting before Turnstile verification and private service invocation;
- separate upload-authorization and private-intake runtime composition;
- reuse of protected contact, status-secret, reservation, and private Submission persistence boundaries;
- bounded `no-store` responses and privacy-safe error mapping;
- no browser form, binary proxy, configured production object binding, automatic processing, Media approval, canonical mutation, export, or publication.

## P5-05H completion result

P5-05H provides:

- the public `/photos` page and an available Photos entry from `/contribute`;
- client-safe Turnstile configuration through `GET /api/photos/config`;
- strict browser file, metadata, rights, contact, and acknowledgement contracts;
- one stable opaque request UUID across authorization, direct upload, retry, and final intake;
- separate Turnstile verification for upload authorization and final private intake;
- exact returned `PUT` method and required-header direct uploads;
- local byte-size and content-type consistency checks before each upload;
- final Submission JSON containing only opaque reservation UUIDs and declared review metadata;
- private Submission reference and status secret retained only in the in-memory receipt UI;
- Photos-specific Turnstile and bounded R2 endpoint CSP;
- no binary proxy, configured production signer, automatic processing, Media approval, canonical mutation, export, or publication.

## Current references

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/MEDIA_POLICY.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/P5_04A_BUSINESS_CLAIM_CONTRACT_AND_NORMALIZATION.md`
- `docs/P5_04B_BUSINESS_CLAIM_PRIVATE_INTAKE.md`
- `docs/P5_04C_BUSINESS_CLAIM_TARGET_CONTEXT.md`
- `docs/P5_04D_BUSINESS_CLAIM_REVIEWER_ENTRY.md`
- `docs/P5_04E_BUSINESS_CLAIM_REVIEW_TRANSITIONS.md`
- `docs/P5_04F_BUSINESS_CLAIM_VERIFICATION_EXECUTION.md`
- `docs/P5_04G_BUSINESS_CLAIM_RELATIONSHIP_DECISIONS.md`
- `docs/P5_04H_BUSINESS_CLAIM_FIELD_APPLICATION.md`
- `docs/P5_04H3_BUSINESS_CLAIM_REVIEWER_FLOW.md`
- `docs/P5_05A_PHOTO_MEDIA_CONTRACT_AND_NORMALIZATION.md`
- `docs/P5_05B_PHOTO_PRIVATE_INTAKE.md`
- `docs/P5_05C_PHOTO_UPLOAD_AUTHORIZATION.md`
- `docs/P5_05D_PHOTO_OBJECT_VALIDATION.md`
- `docs/P5_05E_PHOTO_PRIVATE_PROCESSING_AND_MEDIA_HANDOFF.md`
- `docs/P5_05F_PHOTO_DUPLICATE_SIGNALS_AND_PRIVATE_LIFECYCLE.md`
- `docs/P5_05G_PHOTO_PUBLIC_HTTP_BOUNDARIES.md`
- `docs/P5_05H_PHOTO_BROWSER_UPLOAD_ORCHESTRATION.md`

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — Completed through #156–#192
3. P5-03 — Payment and problem reports — Completed through #194–#202
4. P5-04 — Business and service claims — Completed through #203–#215
5. P5-05 — Photo and Media submission intake — In progress at P5-05I; P5-05H completed #223
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## Next

Define and implement P5-05I configured private object-storage signing and binding plus a bounded direct-upload integration audit. The configured path must produce browser-compatible, short-lived HTTPS `PUT` authorizations for only the deterministic private quarantine object, bind the exact content type and required private validation metadata, and prove one synthetic upload plus private intake without logging credentials, signed URLs, file bytes, contact data, or status secrets. Successful audit must not automatically validate, process, approve, copy publicly, mutate canonical records, export, or publish Media.

## Blocked

No repository blocker is known. Configured image codec and processing execution, privacy-content analysis, protected Media reviewer execution, public Media approval, export activation, production deployment, and production review remain separate later slices.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. A browser Photos success creates only private quarantine uploads and one private Submission receipt; it does not create approved or public Media automatically.
