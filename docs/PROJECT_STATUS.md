# CryptoPayMap project status

**Last verified:** 2026-07-13

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-04B — Business claim private intake integration

## Current repository state

- Phase 0 through Phase 4 are complete for the Phase 5 handoff.
- P5-01 shared Submission foundation is complete through #150–#155.
- P5-02 Suggest Place and Online Service is complete through #156–#192.
- P5-03 Payment and problem reports is complete through #194–#202.
- P5-03I fixed-review deployment and live-audit receipts are complete for main commit `bd08118b63feab6349e125db300c6031f2653f84`.
- P5-04A business Claim contract and review-safe normalization are complete through #203.
- P5-04B idempotent private business Claim intake integration is in progress.

## P5-04A completion boundary

P5-04A established:

- existing Entity or Location targets only;
- owner, authorized representative, and authorized employee roles;
- representative, Entity-profile, Location-profile, and payment-information scopes;
- official-domain email, website-code, DNS TXT, official-social, and assisted-verification request methods;
- protected contact and ownership-proof inputs;
- bounded practical-profile and payment proposals;
- review-safe normalization without official contact email or proof URL values;
- no automatic relationship approval, editing right, canonical mutation, export, or publication.

## P5-04B active scope

P5-04B adds:

- Claim-specific parser composition with the shared private intake service;
- atomic private original and review-safe normalized payload persistence;
- separate optional submitter contact protection;
- deterministic status-secret replay;
- changed-content idempotency conflict;
- rate-limit and challenge composition before Claim intake;
- received-only workflow state without verified authority or editing permission.

## Current references

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/P5_04A_BUSINESS_CLAIM_CONTRACT_AND_NORMALIZATION.md`
- `docs/P5_04B_BUSINESS_CLAIM_PRIVATE_INTAKE.md`

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — Completed through #156–#192
3. P5-03 — Payment and problem reports — Completed through #194–#202
4. P5-04 — Business and service claims — In progress at P5-04B
5. P5-05 — Photo and Media submission intake — Planned
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## Next

Complete P5-04B private persistence, replay/conflict behavior, contact separation, abuse-control ordering, focused tests, schema validation, and documentation. Then proceed to P5-04C protected target context and read-only Claim review signals.

## Blocked

No repository blocker is known. Verification adapters, protected relationship decisions, public Claim routing, configured review, and production checks remain separate later slices.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. A committed Claim Submission remains unverified and grants no editing right.
