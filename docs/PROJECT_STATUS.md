# CryptoPayMap project status

**Last verified:** 2026-07-14

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-04C — Business claim protected target context and read-only signals

## Current repository state

- Phase 0 through Phase 4 are complete for the Phase 5 handoff.
- P5-01 shared Submission foundation is complete through #150–#155.
- P5-02 Suggest Place and Online Service is complete through #156–#192.
- P5-03 Payment and problem reports is complete through #194–#202.
- P5-03I fixed-review deployment and live-audit receipts are complete for main commit `bd08118b63feab6349e125db300c6031f2653f84`.
- P5-04A business Claim contract and normalization were established in #203 and privacy/correction semantics were hardened in #206 at main commit `944773ad8a4c1bcc25de3f3f0745917d37def4e3`.
- P5-04B idempotent private business Claim intake integration completed in #207 at main commit `cb55ad961f213fd8a6e5f86e81a16abd486505cb`.
- Draft #204 was closed as superseded because it predated the #206 privacy boundary and tested nonexistent persistence metadata.
- P5-04C protected canonical target context and bounded read-only Claim review signals are now active.

## P5-04 completed foundations

P5-04A and P5-04B now provide:

- existing Entity or Location Claim targets only;
- owner, authorized representative, and authorized employee roles;
- representative, Entity-profile, Location-profile, and payment-information scopes;
- official-domain email, website-code, DNS TXT, official-social, and assisted-verification request methods;
- official-domain contact through the protected contact boundary rather than plaintext payload storage;
- bounded practical-profile and payment proposals;
- explicit changed-field semantics for omission, nullable clearing, and empty-list replacement;
- complete coordinate-pair requirements;
- review-safe normalization without contact email, proof URL, or assisted-verifier reference values;
- atomic private original and normalized payload persistence;
- separate encrypted and hashed contact persistence;
- deterministic status-secret replay and changed-content conflict;
- rate-limit and challenge composition before Claim intake;
- received-only workflow state without verified authority or editing permission;
- no automatic relationship approval, canonical mutation, export, or publication.

## P5-04C active scope

P5-04C adds:

- validated Entity or Location canonical target snapshots;
- target/parent consistency checks;
- bounded current Acceptance Claim context where payment proposals require it;
- official identity and proposed-change comparison signals;
- explicit incomplete-coverage semantics;
- fail-closed protected errors without private verification material;
- read-only behavior with no workflow, authority, canonical, export, or publication effects.

## Current references

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/P5_04A_BUSINESS_CLAIM_CONTRACT_AND_NORMALIZATION.md`
- `docs/P5_04B_BUSINESS_CLAIM_PRIVATE_INTAKE.md`
- `docs/P5_04C_BUSINESS_CLAIM_TARGET_CONTEXT.md`

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — Completed through #156–#192
3. P5-03 — Payment and problem reports — Completed through #194–#202
4. P5-04 — Business and service claims — In progress at P5-04C
5. P5-05 — Photo and Media submission intake — Planned
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## Next

Implement and validate P5-04C canonical target loading, strict response schemas, deterministic read-only comparison signals, private-value leakage rejection, focused tests, and executable schema validation. Then proceed to P5-04D protected Claim reviewer queue and detail entry.

## Blocked

No repository blocker is known. Ownership-verification adapters, protected relationship decisions, public Claim routing, configured review, and production checks remain separate later slices.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. A committed Claim Submission remains unverified and grants no editing right.
