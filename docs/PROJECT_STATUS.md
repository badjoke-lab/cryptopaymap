# CryptoPayMap project status

**Last verified:** 2026-07-10

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-02G — Time-bounded Suggest Hold boundary

## Current repository state

- Phase 0 public specifications and development control are complete.
- Phase 1 foundation repository work is complete.
- Phase 2 data core is complete.
- Phase 3 administration and review repository work is complete through P3-12.
- Phase 4 public MVP-A and P4-18 closure are complete for the Phase 5 handoff.
- P5-01 shared Submission foundation is complete through #150–#155.
- P5-02A Suggest contract and review-safe normalization is complete through #156.
- P5-02B Suggest private intake integration is complete through #157.
- P5-02C read-only Candidate overlap and canonical target signal generation is complete through #158.
- P5-02D protected Suggest reviewer queue and detail entry is complete through #159.
- P5-02E guarded received→triage and triage→in_review transitions are complete through #160.
- P5-02F bounded in_review→needs_information request boundary is complete through #161.
- P5-02G bounded in_review→on_hold operation with 30/60/90 day next-review timing is active.

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
13. `docs/P5_02B_SUGGEST_PRIVATE_INTAKE_INTEGRATION.md`;
14. `docs/P5_02C_SUGGEST_REVIEW_SIGNALS.md`;
15. `docs/P5_02D_SUGGEST_REVIEWER_ENTRY.md`;
16. `docs/P5_02E_GUARDED_SUGGEST_REVIEW_TRANSITIONS.md`;
17. `docs/P5_02F_SUGGEST_INFORMATION_REQUEST.md`;
18. `docs/P5_02G_TIME_BOUNDED_HOLD.md`;
19. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

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

## P5-02 execution sequence

```text
P5-02A  Suggest type-specific contract and review-safe normalization       Completed #156
    ↓
P5-02B  Suggest private intake integration                               Completed #157
    ↓
P5-02C  Duplicate Candidate and existing-target read-only signals        Completed #158
    ↓
P5-02D  Protected Suggest reviewer queue and detail entry                 Completed #159
    ↓
P5-02E  Guarded received→triage and triage→in_review transitions          Completed #160
    ↓
P5-02F  Guarded in_review→needs_information request                       Completed #161
    ↓
P5-02G  Guarded time-bounded in_review→on_hold operation                  In progress
    ↓
next bounded reviewer operation slice
    ↓
public Suggest route/form wiring with real environment-backed providers
    ↓
P5-02 integration and handoff audit
```

Exact later slice IDs are assigned when each bounded scope begins.

## P5-02G active scope

P5-02G establishes:

- one bounded `in_review → on_hold` operation;
- Hold periods limited to exactly 30, 60, or 90 days;
- server-computed `nextReviewAt` from commit time plus selected duration;
- exact `expectedUpdatedAt` concurrency guard;
- bounded internal Hold reason, required action, and public status message;
- durable `submission_hold_started` event history;
- strict versioned Hold event envelope;
- deterministic request UUID replay identity through the existing event primary key;
- changed-semantics UUID reuse conflict;
- concurrent identical commit replay recovery;
- Suggest-only operation isolation;
- protected `POST /admin/api/submissions/:submissionId/hold` endpoint;
- private submitter-status projection of required action, public message, and next review time only while `on_hold`;
- internal Hold reason exclusion from private status;
- reviewer detail Hold form available only for `in_review`;
- focused service/API/private-status tests, runtime checks, and staging artifact validation.

P5-02G does not add automatic expiry transitions, a scheduled review runner, submitter response intake, duplicate resolution, accepted-as-Candidate transactions, canonical target selection, Evidence acceptance, final resolution, canonical application, export, or publication.

## Route and environment requirements before public intake exposure

A public Suggest route must not be exposed with placeholder providers. It must wire and verify:

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

Complete P5-02G and merge it green. Then continue with the next bounded P5-02 reviewer operation without combining duplicate resolution, accepted-as-Candidate, and canonical application into one broad mutation endpoint.

## Blocked

No known repository blocker to P5-02G.

Production contact encryption, HMAC key environment binding, production distributed rate limiting, opaque bucket-key derivation, and Turnstile environment binding remain required before a public Suggest route is exposed.

Production restore completion remains a Launch gate rather than a P5-02 repository start blocker.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
