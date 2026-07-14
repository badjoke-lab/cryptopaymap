# CryptoPayMap project status

**Last verified:** 2026-07-14

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-05A — Photo and Media submission contract and review-safe normalization

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
- P5-04H3 protected reviewer workspace/API, one-time application guard, and integration audit completed through #215.
- Draft #204 was closed as superseded because it predated the #206 privacy boundary and tested nonexistent persistence metadata.
- P5-04 Business and service claims are repository-complete.
- P5-05 Photo and Media submission intake is next.

## P5-04 completion result

P5-04A through P5-04H3 provide:

- existing Entity or Location Claim targets only;
- owner, authorized representative, and authorized employee roles;
- representative, Entity-profile, Location-profile, and payment-information scopes;
- official-domain email, website-code, DNS TXT, official-social, and assisted-verification methods;
- protected contact and proof boundaries without plaintext review payload leakage;
- bounded practical-profile and payment proposals;
- atomic private Claim intake with replay/conflict behavior;
- validated canonical target snapshots and advisory comparison signals;
- a separately authorized protected Claim queue and detail entry;
- exact-state Claim review transitions with atomic audit events;
- separately authorized verification preparation and execution;
- privacy-safe verification outcomes;
- separately authorized relationship approval or non-approval;
- a private active representative relationship without account or editing permission;
- exact-state Submission resolution and deterministic decision replay;
- dedicated field-application authorization separate from relationship decisions;
- complete Entity, Location, and payment accept/reject partitions;
- proposal-only value copying with canonical before/after validation;
- deterministic application fingerprints and stale/no-op rejection;
- durable private application receipts and field-level provenance;
- exact-state atomic Entity and Location updates;
- bounded private payment drafts without direct public-claim creation;
- protected current-versus-proposed reviewer workspace and GET/POST API;
- exact relationship and canonical version binding;
- UUID idempotency-key binding and deterministic replay;
- one durable field application per Claim Submission, enforced before projection and inside the atomic database guard;
- bounded authorization, validation, stale, conflict, and unavailable responses;
- replay recovery and full rollback on conflicts;
- no account permission, unrelated-field mutation, public Claim route, export, or publication.

## P5-05A active scope

P5-05A will establish:

- Photo and Media Submission types and strict request contracts;
- existing Entity or Location targets only;
- evidence-image, owner-verification-proof, and public-gallery-candidate purpose separation;
- photographer, rights-holder, permission, capture-date, description, and Media-role fields;
- bounded image-count and metadata limits by Submission context;
- quarantine storage references without public object exposure;
- review-safe normalization that excludes storage credentials, status secrets, contact data, EXIF, GPS, wallet, receipt, and other protected material;
- no automatic Media creation, public visibility, gallery placement, export, or publication.

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

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — Completed through #156–#192
3. P5-03 — Payment and problem reports — Completed through #194–#202
4. P5-04 — Business and service claims — Completed through #203–#215
5. P5-05 — Photo and Media submission intake — In progress at P5-05A
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## Next

Implement and validate P5-05A Photo and Media submission contracts, purpose and rights separation, target-aware review-safe normalization, private quarantine-reference boundaries, focused privacy and leakage tests, and executable schema validation.

## Blocked

No repository blocker is known. R2 upload signing, binary validation, asynchronous image processing, public Media approval, export activation, and production review remain separate later slices.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. A Submission never publishes Media automatically, and a verified representative relationship grants no account or editing right.
