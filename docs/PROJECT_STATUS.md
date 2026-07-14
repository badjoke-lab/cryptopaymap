# CryptoPayMap project status

**Last verified:** 2026-07-14

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-04F — Business Claim verification execution and bounded result recording

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
- Draft #204 was closed as superseded because it predated the #206 privacy boundary and tested nonexistent persistence metadata.
- P5-04F verification execution and bounded result recording are now active.

## P5-04 completed foundations

P5-04A through P5-04E now provide:

- existing Entity or Location Claim targets only;
- owner, authorized representative, and authorized employee roles;
- representative, Entity-profile, Location-profile, and payment-information scopes;
- official-domain email, website-code, DNS TXT, official-social, and assisted-verification methods;
- protected contact and proof boundaries without plaintext review payload leakage;
- bounded practical-profile and payment proposals;
- explicit changed-field semantics and complete coordinate-pair requirements;
- atomic private Claim intake with replay/conflict behavior;
- validated canonical target snapshots and advisory comparison signals;
- a separately authorized protected Claim queue and detail entry;
- exact-state Claim review transitions with atomic audit events;
- separately authorized, idempotent verification-request preparation;
- method-specific protected prerequisites and privacy-safe preparation receipts;
- no verified authority, representative relationship, canonical mutation, export, or publication.

## P5-04F active scope

P5-04F adds:

- a dedicated verification-execution authorization capability;
- strict prepared-request loading and expiry validation;
- bounded adapters for all five verification methods;
- privacy-safe outcomes: passed, failed, inconclusive, and provider error;
- idempotent execution UUIDs and changed-content conflict handling;
- atomic private result-event persistence;
- adapter output validation and private-value leakage rejection;
- no representative relationship, editing right, terminal workflow decision, canonical mutation, export, or publication.

## Current references

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/P5_04A_BUSINESS_CLAIM_CONTRACT_AND_NORMALIZATION.md`
- `docs/P5_04B_BUSINESS_CLAIM_PRIVATE_INTAKE.md`
- `docs/P5_04C_BUSINESS_CLAIM_TARGET_CONTEXT.md`
- `docs/P5_04D_BUSINESS_CLAIM_REVIEWER_ENTRY.md`
- `docs/P5_04E_BUSINESS_CLAIM_REVIEW_TRANSITIONS.md`
- `docs/P5_04F_BUSINESS_CLAIM_VERIFICATION_EXECUTION.md`

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — Completed through #156–#192
3. P5-03 — Payment and problem reports — Completed through #194–#202
4. P5-04 — Business and service claims — In progress at P5-04F
5. P5-05 — Photo and Media submission intake — Planned
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## Next

Implement and validate P5-04F execution authorization, prepared-request loading, strict adapter contracts, expiration and method checks, idempotent private result persistence, leakage rejection, focused tests, and executable schema validation. Representative-relationship decisions remain a later separately authorized slice.

## Blocked

No repository blocker is known. Provider configuration, protected relationship decisions, public Claim routing, configured review, and production checks remain separate later slices.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. A passed verification result remains review material only and grants no authority or editing right.
