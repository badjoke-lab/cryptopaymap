# CryptoPayMap project status

**Last verified:** 2026-07-10

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-02A — Suggest Place and Online Service contract and normalization

## Current repository state

- Phase 0 public specifications and development control are complete.
- Phase 1 foundation repository work is complete.
- Phase 2 data core is complete.
- Phase 3 administration and review repository work is complete through P3-12.
- Phase 4 public MVP-A and P4-18 closure are complete for the Phase 5 handoff.
- P5-01 shared Submission foundation is complete through #150–#155.
- P5-02 Suggest Place and Online Service is active.
- P5-02A defines the type-specific Place/Online Suggest contract and review-safe normalization boundary.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

Deployment receipt state must be checked whenever review-environment state matters. A repository merge must not be assumed visible at the fixed URL until the receipt records the intended `main` commit.

## Required current references

Before P5-02 implementation or review, read:

1. `docs/IMPLEMENTATION_PLAN.md`;
2. `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`;
3. `docs/SUBMISSION_WORKFLOW.md`;
4. `docs/DATA_MODEL.md`;
5. `docs/SECURITY_AND_PRIVACY.md`;
6. `docs/P5_01A_SUBMISSION_CONTRACT_AND_PRIVACY_MODEL.md`;
7. `docs/P5_01B_SUBMISSION_PERSISTENCE_FOUNDATION.md`;
8. `docs/P5_01C_IDEMPOTENT_PRIVATE_INTAKE.md`;
9. `docs/P5_01D_ABUSE_CONTROL_AND_TURNSTILE.md`;
10. `docs/P5_01E_SUBMISSION_FOUNDATION_AUDIT.md`;
11. `docs/P5_01F_PRIVATE_FOLLOWUP_STATUS_READ.md`;
12. `docs/P5_02A_SUGGEST_CONTRACT_AND_NORMALIZATION.md`;
13. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

Media work must also read `docs/MEDIA_POLICY.md`.

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — In progress
3. P5-03 — Payment and problem reports — Planned
4. P5-04 — Business and service claims — Planned
5. P5-05 — Photo and Media submission intake — Planned
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## P5-01 completion result

P5-01 completed the common private Submission foundation through these slices:

1. P5-01A — submission contract and privacy model — #150
2. P5-01B — persistence and workflow-state foundation — #151
3. P5-01C — idempotent private intake service — #152
4. P5-01D — abuse-control and Turnstile boundary — #153
5. P5-01E — Audit integration and A–D foundation audit — #154
6. P5-01F — private follow-up status read boundary — #155

The completed foundation provides:

- strict common Submission envelope;
- bounded original payload rules;
- opaque public reference and private follow-up secret boundaries;
- durable private Submission, payload, protected-contact, and workflow-event persistence;
- guarded workflow transitions;
- canonical request fingerprinting;
- deterministic replay and changed-content conflict;
- HMAC-based status-secret re-derivation without plaintext secret persistence;
- protected contact provider boundary;
- provider-neutral rate-limit and challenge-verification contracts;
- Turnstile Siteverify adapter boundary;
- metadata-only Submission Audit history;
- private follow-up status retrieval through public reference plus valid secret;
- bounded safe status projection with no private reviewer, contact, payload, token, or internal identity leakage.

P5-01 repository completion does not claim that public route environment wiring is already complete.

## P5-02 execution direction

P5-02 must accept new physical Place and Online Service suggestions into protected review without direct Candidate, canonical, Evidence, export, or public mutation.

The current bounded sequence is:

```text
P5-02A  Suggest type-specific contract and review-safe normalization
    ↓
private Suggest intake integration
    ↓
duplicate Candidate and existing-target signals
    ↓
protected reviewer entry path
    ↓
public Suggest route/form wiring with real environment-backed providers
    ↓
P5-02 integration and handoff audit
```

Exact later slice IDs should be assigned when each bounded scope begins; P5-02A is the only active slice now.

## P5-02A active scope

P5-02A establishes:

- `physical_place` and `online_service` Suggest kinds;
- new-record-only Suggest boundary with no canonical target ID;
- required relationship disclosure;
- entity identity proposal;
- physical Place address/coordinate and practical-profile proposals;
- category proposals;
- payment Asset, Network, Route, Method, Processor, How-to-pay, and restriction proposals;
- explicit uncertainty for incomplete but useful proposals;
- no asset-to-network inference;
- review-safe normalization that excludes common private operational fields;
- focused contract tests and schema-check integration.

P5-02A does not add a public form, public route, Candidate creation, canonical mutation, Evidence acceptance, export, or publication.

## Route and environment requirements before public intake exposure

A public Submission route must not be exposed with placeholder providers. The first public Suggest route must wire and verify:

- concrete environment-backed contact encryption and email hashing;
- status-secret HMAC key environment binding;
- production distributed rate-limit provider;
- privacy-preserving opaque bucket-key derivation;
- Turnstile secret and site-key environment binding;
- exact hostname and expected-action configuration;
- route-level safe error mapping and Retry-After behavior;
- no logging of challenge token, raw remote IP, plaintext email, plaintext status secret, or provider secret;
- configured-environment verification of the complete route path.

## Retained Launch work

Starting or completing Phase 5 does not waive retained Launch work, including:

- live Cloudflare Access and identity verification;
- actual allowlist and deployed environment verification;
- live Neon migration-state verification;
- representative protected Admin journeys with configured data;
- canonical query → complete candidate generation → private upload → release-review handoff;
- corrected canonical value → generation → release → activation flow;
- concrete R2 publication conditional-write verification;
- production restore persistence, invocation, R2 adapter wiring, durable restore Audit source, reconciliation runbook, and drills.

Launch readiness must not be claimed until the relevant launch criteria and retained Launch work are complete.

## Next

Complete P5-02A contract and normalization work, merge it green, then begin the next bounded P5-02 slice for private Suggest intake integration and protected review entry preparation.

## Blocked

No known repository blocker to P5-02A.

Production contact encryption, HMAC key environment binding, production distributed rate limiting, opaque bucket-key derivation, and Turnstile environment binding remain required before a public Suggest route is exposed.

Production restore completion remains a Launch gate rather than a P5-02 repository start blocker.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
