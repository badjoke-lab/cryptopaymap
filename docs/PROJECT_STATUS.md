# CryptoPayMap project status

**Last verified:** 2026-07-11

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-02P — Public Suggest form and Turnstile browser wiring

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
- P5-02G bounded in_review→on_hold operation with 30/60/90 day next-review timing is complete through #162.
- P5-02H atomic accepted-as-Candidate transaction boundary is complete through #163.
- P5-02I Submission status-secret environment binding is complete through #167.
- P5-02J Submission contact protection is complete through #168.
- P5-02K opaque Submission rate-limit bucket derivation is complete through #169.
- P5-02L trusted Cloudflare edge identity extraction is complete through #170.
- P5-02M Durable Object distributed Submission rate limiting is complete through #171.
- P5-02N Turnstile environment binding is complete through #172.
- P5-02O public Suggest HTTP composition and safe response mapping are complete through #173.
- P5-02P public Suggest form, browser Turnstile wiring, and scoped CSP are in progress.

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
19. `docs/P5_02H_ACCEPTED_AS_CANDIDATE.md`;
20. `docs/P5_02I_SUBMISSION_STATUS_SECRET_ENVIRONMENT_BINDING.md`;
21. `docs/P5_02J_SUBMISSION_CONTACT_PROTECTION.md`;
22. `docs/P5_02K_OPAQUE_RATE_LIMIT_BUCKET_DERIVATION.md`;
23. `docs/P5_02L_CLOUDFLARE_EDGE_IDENTITY.md`;
24. `docs/P5_02M_DURABLE_OBJECT_RATE_LIMIT.md`;
25. `docs/P5_02N_TURNSTILE_ENVIRONMENT_BINDING.md`;
26. `docs/P5_02O_SUGGEST_HTTP_ROUTE.md`;
27. `docs/P5_02P_SUGGEST_FORM_TURNSTILE.md`;
28. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

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
P5-02G  Guarded time-bounded in_review→on_hold operation                  Completed #162
    ↓
P5-02H  Atomic accepted-as-Candidate outcome                              Completed #163
    ↓
P5-02I  Submission status-secret environment binding                     Completed #167
    ↓
P5-02J  Submission contact protection                                    Completed #168
    ↓
P5-02K  Opaque Submission rate-limit bucket derivation                    Completed #169
    ↓
P5-02L  Trusted Cloudflare edge identity extraction                       Completed #170
    ↓
P5-02M  Durable Object distributed Submission rate limiting               Completed #171
    ↓
P5-02N  Turnstile environment binding                                    Completed #172
    ↓
P5-02O  Public Suggest HTTP route and safe response mapping               Completed #173
    ↓
P5-02P  Public Suggest form and Turnstile browser wiring                  In progress
    ↓
configured-environment verification
    ↓
P5-02 integration and handoff audit
```

Exact later slice IDs are assigned when each bounded scope begins.

## Current active scope — public Suggest form and browser wiring

P5-02P must connect the completed HTTP route to a usable public browser experience without weakening the private/canonical/public boundaries.

The current form work must:

- expose `/contribute` and `/suggest` public entry paths;
- reuse the completed Suggest intake schema through a browser payload builder;
- avoid Asset-to-Network inference;
- render Turnstile explicitly with the configured public site key and action;
- submit to the same-origin `/api/suggest` route with a UUID idempotency key;
- show only bounded public errors and the private success receipt;
- keep challenge tokens in transient component state only;
- avoid browser persistence of the status secret;
- scope Turnstile CSP allowances to `/suggest`;
- verify built HTML does not contain server-only environment markers;
- preserve the rule that Suggest intake does not directly create Candidate, canonical, export, or publication state.

## Route and environment requirements before live public intake readiness

The repository now contains the route and form layers, but configured-environment verification must still prove:

- production database connectivity and migration state;
- concrete status-secret, contact encryption, and email-HMAC secrets;
- opaque rate-limit bucket secret;
- deployed SQLite-backed Durable Object worker;
- live Pages Durable Object namespace binding;
- configured rate-limit policy values;
- Turnstile secret/site key pair;
- exact Turnstile hostname and action behavior;
- successful end-to-end Suggest submission into private persistence;
- deterministic replay behavior;
- 429 Retry-After behavior under configured rate limiting;
- no logging of challenge token, raw remote IP, plaintext email, plaintext status secret, or provider secret.

Repository checks do not prove live deployment configuration.

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

Complete P5-02P public Suggest form and Turnstile browser wiring, then perform configured-environment verification of the complete Suggest route path. Close P5-02 with a bounded integration and handoff audit before P5-03 begins.

## Blocked

No known repository blocker to completing the P5-02P browser/form slice.

Live public intake readiness remains blocked on configured deployment verification. The P5-02M Durable Object worker and Pages binding must be deployed and verified; Turnstile hostname/action configuration and the complete private-persistence path must be exercised in a configured environment.

`CPM_USER_SUBMISSION_SOURCE_ID` and the Candidate-create allowlist remain required in configured environments for the accepted-as-Candidate transaction path.

Production restore completion remains a Launch gate rather than a P5-02 repository blocker.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
