# CryptoPayMap project status

**Last verified:** 2026-07-13

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-04A — Business claim contract and review-safe normalization

## Current repository state

- Phase 0 through Phase 4 are complete for the Phase 5 handoff.
- P5-01 shared Submission foundation is complete through #150–#155.
- P5-02 Suggest Place and Online Service is complete through #156–#192.
- P5-03 Payment and problem reports is complete through #194–#202.
- P5-03I fixed-review deployment and live-audit receipts are complete for main commit `bd08118b63feab6349e125db300c6031f2653f84`.
- P5-04A business Claim contract and review-safe normalization are in progress.

## P5-03 configured completion evidence

The fixed-review receipt proves:

- `/payment-report`, `/report`, and report client configuration returned HTTP 200 with required security boundaries;
- synthetic payment and problem reports returned HTTP 202 with strict private receipt shapes;
- exact payment and problem replay returned the same public references and status secrets;
- changed payment content under the same request UUID returned HTTP 409;
- configured Neon contained matching payment/problem normalized projections;
- `/data/manifest.json` and `/version.json` remained unchanged;
- retained evidence contains only bounded statuses and booleans.

## P5-04A active scope

P5-04A defines:

- existing Entity or Location targets only;
- owner, authorized representative, and authorized employee roles;
- representative, Entity-profile, Location-profile, and payment-information scopes;
- official-domain email, website-code, DNS TXT, official-social, and assisted-verification request methods;
- protected contact and ownership-proof inputs;
- bounded practical-profile and payment proposals;
- review-safe normalization without contact email or proof URL values;
- no automatic relationship approval, editing right, canonical mutation, export, or publication.

## Current references

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/P5_03I_CONFIGURED_REVIEW_AND_INTEGRATION_AUDIT.md`
- `docs/P5_04A_BUSINESS_CLAIM_CONTRACT_AND_NORMALIZATION.md`

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — Completed through #156–#192
3. P5-03 — Payment and problem reports — Completed through #194–#202
4. P5-04 — Business and service claims — In progress at P5-04A
5. P5-05 — Photo and Media submission intake — Planned
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## Next

Complete P5-04A strict parsing, method-specific verification-request guards, scope/target consistency, review-safe projection, focused tests, schema validation, and documentation. Then proceed to P5-04B private intake integration.

## Blocked

No repository blocker is known. Verification adapters, protected relationship decisions, public Claim routing, configured review, and production checks remain separate later slices.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. A Claim Submission is never equivalent to a verified representative relationship.
