# CryptoPayMap project status

**Last verified:** 2026-07-11

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-02O — Public Suggest HTTP route and safe response mapping

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
- P5-02O public Suggest HTTP composition and safe response mapping are in progress without a public Suggest form UI.

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
27. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

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
P5-02O  Public Suggest HTTP route and safe response mapping               In progress
    ↓
remaining Suggest form/browser widget/CSP and configured-environment slices
    ↓
P5-02 integration and handoff audit
```

Exact later slice IDs are assigned when each bounded scope begins.

## Current active scope — public Suggest route/form wiring

The next P5-02 work must connect the completed Suggest intake and review foundations to a public route and form without weakening the private/canonical/public boundaries.

The public Suggest route/form work must:

- reuse the completed P5-01 and P5-02A–H contracts rather than duplicate intake logic;
- expose only the intended new Place and Online Service Suggest flow;
- wire concrete environment-backed contact encryption and email hashing;
- bind the status-secret HMAC key from the environment;
- use a production distributed rate-limit provider;
- derive privacy-preserving opaque rate-limit bucket keys;
- wire Turnstile secret and site-key environment bindings;
- verify exact hostname and expected action;
- map route failures to bounded safe public responses and Retry-After behavior where applicable;
- avoid logging challenge tokens, raw remote IPs, plaintext email, plaintext status secrets, or provider secrets;
- verify the complete configured-environment route path before public intake exposure;
- preserve the rule that Suggest intake does not directly create canonical or public truth.

## Route and environment requirements before public intake exposure

The Suggest HTTP route must wire and verify:

- concrete environment-backed contact encryption and email hashing;
- status-secret HMAC key environment binding;
- production distributed rate-limit provider;
- privacy-preserving opaque bucket-key derivation;
- Turnstile secret and site-key environment binding;
- exact hostname and expected-action configuration;
- route-level safe error mapping and Retry-After behavior;
- no logging of challenge token, raw remote IP, plaintext email, plaintext status secret, or provider secret;
- configured-environment verification of the complete route path.

A repository route that fails closed when configuration is absent does not prove live intake readiness. The public Suggest form must not be enabled until the configured route path is verified.

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

Complete P5-02O public Suggest HTTP composition and safe response mapping, then continue Suggest form/browser Turnstile widget/CSP wiring and configured-environment verification. Close P5-02 with a bounded integration and handoff audit before P5-03 begins.

## Blocked

No known repository blocker to continuing the public Suggest route/form wiring.

Suggest form/browser widget/CSP wiring and configured deployment verification remain required before the public Suggest form is enabled. Status-secret HMAC binding is repository-complete through #167, contact protection through #168, opaque bucket derivation through #169, trusted edge identity extraction through #170, distributed rate limiting through #171, and Turnstile environment binding through #172.

The P5-02M Durable Object worker and Pages binding must be deployed and verified in a configured environment before route activation. Repository dry-run compilation does not prove that live binding.

`CPM_USER_SUBMISSION_SOURCE_ID` and the Candidate-create allowlist remain required in configured environments for the accepted-as-Candidate transaction path.

Production restore completion remains a Launch gate rather than a P5-02 repository blocker.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
