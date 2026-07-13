# CryptoPayMap project status

**Last verified:** 2026-07-13

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-03F — Negative Evidence and priority-recheck decision boundary

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
- P5-02Q configured Suggest review deployment and readiness verification are complete through #175–#183.
- P5-02R Suggest integration and handoff audit is complete through #185–#192.
- P5-02 Suggest Place and Online Service is complete and handed off to P5-03.
- P5-03A payment/problem report contract and review-safe normalization is complete through #194.
- P5-03B idempotent payment/problem report private intake integration is complete through #195.
- P5-03C canonical report target snapshot and Claim-context signals are complete through #196.
- P5-03D protected report reviewer queue and detail entry is complete through #197.
- P5-03E positive payment Evidence and reconfirmation decision boundary is complete through #198.
- P5-03F negative Evidence and priority-recheck decision boundary is in progress.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

The current fixed-review deployment receipt for main commit:

`699cff048fa80113d3b05bcdf4f385c229a4d41d`

records `status: deployed` and success for credentials, configured inputs, Durable Object Worker deployment, Pages secret synchronization, Pages deployment, and configured verification. The bounded P5-02R live-audit receipt for the same commit records `status: complete`.

Deployment receipt state must still be checked whenever review-environment state matters. A later repository merge must not be assumed visible or configured correctly at the fixed URL until the receipt records the intended `main` commit and successful configured verification.

P5-03 repository implementation may continue while Cloudflare and Neon operator access is unavailable. P5-03 configured Access, deployed Functions, live Neon execution, and integrated public-route verification remain assigned to P5-03I and must not be inferred from repository checks.

## Required current references

Before P5-03 implementation or review, read:

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
29. `docs/P5_02R_SUGGEST_INTEGRATION_AND_HANDOFF_AUDIT.md`;
30. `docs/P5_03A_REPORT_CONTRACT_AND_NORMALIZATION.md`;
31. `docs/P5_03B_REPORT_PRIVATE_INTAKE_INTEGRATION.md`;
32. `docs/P5_03C_REPORT_TARGET_CONTEXT.md`;
33. `docs/P5_03D_REPORT_REVIEWER_ENTRY.md`;
34. `docs/P5_03E_POSITIVE_PAYMENT_EVIDENCE.md`;
35. `docs/P5_03F_NEGATIVE_EVIDENCE_AND_RECHECK_PRIORITY.md`;
36. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

Media work must also read `docs/MEDIA_POLICY.md`.

## Phase 5 sequence

1. P5-01 — Shared submission foundation — Completed through #150–#155
2. P5-02 — Suggest Place and Online Service — Completed through #156–#192
3. P5-03 — Payment and problem reports — In progress at P5-03F
4. P5-04 — Business and service claims — Planned
5. P5-05 — Photo and Media submission intake — Planned
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## P5-02 and P5-03 execution sequence

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
P5-02Q  Configured Suggest review verification                           Completed #175–#183
    ↓
P5-02R  Suggest integration and handoff audit                            Completed #185–#192
P5-03A  Payment/problem report contract and normalization                 Completed #194
P5-03B  Idempotent payment/problem report private intake                  Completed #195
P5-03C  Canonical report target snapshot and Claim-context signals        Completed #196
P5-03D  Protected report reviewer queue and detail entry                  Completed #197
P5-03E  Positive payment Evidence and reconfirmation decision             Completed #198
P5-03F  Negative Evidence and priority-recheck decision                   In progress
```

## P5-02Q completion evidence

The fixed-review receipt for commit `513dc7f543ac27fe512319a3cc24cc16c3de4302` proves:

- Cloudflare credentials accepted;
- configured review inputs present;
- stable review-secret derivation accepted;
- SQLite-backed rate-limit Durable Object Worker deployed;
- Pages preview secrets synchronized;
- Pages review deployment succeeded;
- runtime client configuration returned the expected site key and action;
- Neon accepted a lightweight query;
- Pages resolved and called the bound Durable Object health path;
- `/suggest` returned the required Function-applied Turnstile CSP.

P5-02Q does not prove a successful public Suggest POST, deterministic live replay, changed-content live conflict, configured live 429 behavior, or protected reviewer execution.

## P5-02R completion evidence

The fixed-review deployment receipt records `status: deployed` for main commit `699cff048fa80113d3b05bcdf4f385c229a4d41d`, with credentials, configured inputs, Durable Object Worker, Pages secrets, Pages deployment, and configured verification all successful.

The bounded live-audit receipt records `status: complete` for the same commit and proves:

- fixed-review Submission schema and migration ledger verification succeeded;
- first public Suggest POST returned HTTP 202 with the expected receipt shape;
- exact replay returned HTTP 202 with the same public reference and status secret;
- changed content under the same idempotency UUID returned HTTP 409 with the expected conflict shape;
- `/data/manifest.json` and `/version.json` were unchanged;
- no challenge token, returned status secret, private payload, contact data, raw edge identity, database value, or derived key entered the retained receipt.

The Cloudflare dummy-token metadata discrepancy is explicitly reclassified only inside the fixed-review official-test-key boundary. Production/default hostname and action verification remain strict.

## P5-02R handoff gate

P5-03 may begin only after:

1. P5-02 repository integration checks are green;
2. the configured fixed-review receipt remains successful;
3. the synthetic live intake path is accepted or an explicit approved retained gate exists;
4. exact replay and changed-content conflict are proven at the public route;
5. stable public artifacts remain unchanged by intake;
6. no private or secret leakage is found;
7. residual work is assigned to the correct later Phase 5 or Launch gate;
8. the P5-02R audit records an explicit handoff decision.

All eight conditions are satisfied by the deployment and live-audit receipts for commit `699cff048fa80113d3b05bcdf4f385c229a4d41d`. P5-02 hands off to P5-03.

## Retained Launch work

Starting or completing Phase 5 does not waive retained Launch work, including:

- live Cloudflare Access and identity verification;
- actual allowlist and deployed Admin environment verification;
- live Neon migration-state verification;
- representative protected Admin journeys with configured data;
- configured accepted-as-Candidate execution requiring source/capability configuration;
- canonical query → complete candidate generation → private upload → release-review handoff;
- corrected canonical value → generation → release → activation flow;
- concrete R2 publication conditional-write verification;
- production restore persistence, invocation, R2 adapter wiring, durable restore Audit source, reconciliation runbook, and drills.

Launch readiness must not be claimed until the relevant launch criteria and retained Launch work are complete.

## Current active scope — P5-03F negative Evidence and recheck priority

P5-03F adds a separately authorized, idempotent, atomic decision for reviewed failed-payment and no-longer-accepts reports to become accepted private or restricted contradicting Evidence. Reviewers may also create a durable recheck-priority signal without changing Claim status, visibility, canonical fields, publication, or `nextReviewAt`.

The protected reconfirmation queue derives priority from accepted contradicting Evidence plus its durable Submission decision event. A later Verification Event resolves the priority signal without deleting Evidence or rewriting history.

Repository implementation and GitHub validation proceed without Cloudflare or Neon operator actions. Configured Access, deployed Functions, live Neon execution, and integrated audit remain assigned to P5-03I.

## Next

Complete P5-03F authorization, request and event contracts, atomic negative Evidence persistence, recheck-priority integration, idempotent replay, protected API, focused tests, schema validation, and tracking. Then proceed to P5-03G correction and urgent visibility decision boundaries.

## Blocked

No repository blocker to P5-03F is known. Configured Cloudflare/Neon execution is intentionally deferred to P5-03I; retained Launch work remains unchanged and launch readiness is not claimed.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and the fixed-review deployment receipt. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
