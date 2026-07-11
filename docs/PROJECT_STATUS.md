# CryptoPayMap project status

**Last verified:** 2026-07-11

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-02Q — Configured Suggest review verification

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
- P5-02P public Suggest form, browser Turnstile wiring, and scoped CSP are complete through #174.
- P5-02Q configured Suggest review deployment and readiness verification are in progress.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

Deployment receipt state must be checked whenever review-environment state matters. A repository merge must not be assumed visible or configured correctly at the fixed URL until the receipt records the intended `main` commit and successful configured verification.

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
28. `docs/P5_02Q_CONFIGURED_SUGGEST_REVIEW_VERIFICATION.md`;
29. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

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
P5-02P  Public Suggest form and Turnstile browser wiring                  Completed #174
    ↓
P5-02Q  Configured Suggest review verification                           In progress
    ↓
P5-02 integration and handoff audit
```

Exact later slice IDs are assigned when each bounded scope begins.

## Current active scope — configured Suggest review verification

P5-02Q must make the fixed review environment verifiable without treating repository CI as proof of live deployment state.

The current work must:

- deploy the SQLite-backed Submission rate-limit Durable Object Worker before the Pages review deployment;
- bind `SUBMISSION_RATE_LIMIT_BUCKETS` to the separate Worker with an explicit `script_name`;
- synchronize the required Suggest runtime secrets and rate-limit policy into the Pages preview environment without logging secret values;
- remove build-time Turnstile configuration dependency from `/suggest`;
- expose only client-safe runtime Turnstile site key and action through a same-origin configuration endpoint;
- fail the browser form closed when runtime configuration is unavailable or malformed;
- provide a separately authenticated readiness route using a dedicated bearer token;
- verify complete Suggest runtime composition, a live lightweight database query, and a live Pages Function → Durable Object health request;
- verify the fixed review configuration endpoint, readiness route, and Turnstile CSP after deployment;
- record detailed deployment and configured-verification outcomes in the fixed review deployment receipt;
- preserve generic failure responses and the rule that Suggest intake does not directly create Candidate, canonical, export, or publication state.

## Evidence required before configured verification is complete

Repository CI may prove code, schema, build, tests, deployment-contract checks, and Worker dry-run compilation. It does not prove the fixed review deployment.

Configured verification is complete only when the deployment receipt for the intended `main` commit records:

```text
status: deployed
checks.credentials: success
checks.configuredInputs: success
checks.durableObjectWorker: success
checks.pagesSecrets: success
checks.pagesDeployment: success
checks.configuredVerification: success
```

P5-02Q readiness success proves configuration composition, database query reachability, Pages-to-Durable-Object binding reachability, DO health response, and deployed Suggest CSP/config availability. It does not prove a real human Turnstile challenge, Siteverify success for a live token, a real Suggest POST and private persistence, deterministic live replay, configured 429 behavior, or log-redaction inspection.

Those remaining claims require separate explicit evidence and must not be inferred from readiness success.

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

Complete P5-02Q repository work and obtain a successful fixed-review deployment receipt for the intended main commit. Then close P5-02 with a bounded integration and handoff audit before P5-03 begins.

## Blocked

No known repository blocker to implementing P5-02Q.

Configured live verification may still be blocked by missing GitHub secrets, Cloudflare deployment configuration, Neon connectivity, or Turnstile account configuration. Any such condition must be surfaced through the workflow outcome and deployment receipt rather than treated as success.

A successful readiness receipt still does not substitute for later real Turnstile-token and live Suggest POST evidence.

`CPM_USER_SUBMISSION_SOURCE_ID` and the Candidate-create allowlist remain required in configured environments for the accepted-as-Candidate transaction path.

Production restore completion remains a Launch gate rather than a P5-02 repository blocker.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
