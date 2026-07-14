# CryptoPayMap project status

**Last verified:** 2026-07-14

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-05B — Idempotent private Photos intake and quarantine reservation linkage

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
- P5-05B idempotent private Photos intake and quarantine reservation linkage are next.

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

## P5-05B active scope

P5-05B will add:

- idempotent private Photos Submission intake;
- one durable Submission and normalized payload transaction;
- private contact encryption/hash handling through the shared Submission boundary;
- validation that every opaque upload UUID refers to an existing unexpired quarantine reservation owned by the same intake attempt;
- atomic reservation consumption or linkage without public storage-key exposure;
- deterministic replay and changed-content conflicts;
- private status-token issuance without plaintext persistence;
- no Media Asset, Media File, derivative, public URL, review approval, export, or publication creation.

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

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — Completed through #156–#192
3. P5-03 — Payment and problem reports — Completed through #194–#202
4. P5-04 — Business and service claims — Completed through #203–#215
5. P5-05 — Photo and Media submission intake — In progress at P5-05B
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## Next

Implement and validate P5-05B private Photos intake, quarantine reservation ownership and expiry guards, atomic Submission linkage, deterministic replay/conflict handling, private status-token issuance, privacy/leakage tests, and executable schema validation.

## Blocked

No repository blocker is known. R2 upload signing, binary validation, asynchronous image processing, public Media approval, export activation, and production review remain separate later slices.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. A Submission never publishes Media automatically, and opaque quarantine references never expose storage credentials or public object URLs.
