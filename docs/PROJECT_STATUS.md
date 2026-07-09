# CryptoPayMap project status

**Last verified:** 2026-07-09

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-01F — Private follow-up status read boundary

## Current repository state

- Phase 0 public specifications and development control are complete.
- Phase 1 foundation repository work is complete.
- Phase 2 data core is complete.
- Phase 3 administration and review repository work is complete through P3-12.
- Phase 4 public MVP-A surfaces are implemented.
- P4-17 Places recovery is complete through #122.
- P4-18A tracking and closure inventory is complete through #127.
- P4-18B practical Place operational parity is complete through #128–#138.
- P4-18C bounded UI residual closure and direct visual acceptance are complete through #139, #141, and #142.
- P4-18D administration workflow integration audit is complete through #143–#147.
- P4-18E live review and Phase 5 handoff audit is complete through #148.
- Phase 5 tracking handoff is complete through #149.
- P5-01A submission contract and privacy model is complete through #150.
- P5-01B submission persistence and workflow-state foundation is complete through #151.
- P5-01C idempotent private intake service is complete through #152.
- P5-01D abuse-control and Turnstile boundary is complete through #153.
- P5-01E Submission Audit integration and A–D foundation audit is complete through #154.
- A post-#154 sequence audit found that the P5-01 completion gate still required a private follow-up status read service.
- P5-01F closes that remaining requirement before P5-02 begins.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

Deployment receipt state must be checked whenever review-environment state matters. A repository merge must not be assumed visible at the fixed URL until the receipt records the intended `main` commit.

## Required current references

Before P5-01F implementation or review, read:

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
12. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

Media work must also read `docs/MEDIA_POLICY.md`.

## Phase 5 sequence

1. P5-01 — Shared submission foundation — In progress at P5-01F closure correction
2. P5-02 — Suggest Place and Online Service — Planned; blocked on P5-01F
3. P5-03 — Payment and problem reports — Planned
4. P5-04 — Business and service claims — Planned
5. P5-05 — Photo and Media submission intake — Planned
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## P5-01 execution slices

1. P5-01A — submission contract and privacy model — Completed through #150
2. P5-01B — persistence and workflow-state foundation — Completed through #151
3. P5-01C — idempotent private intake service — Completed through #152
4. P5-01D — abuse-control and Turnstile boundary — Completed through #153
5. P5-01E — Audit integration and A–D foundation audit — Completed through #154
6. P5-01F — private follow-up status read boundary — In progress

## P5-01 completed foundation before P5-01F

P5-01A established:

- strict common Submission envelope;
- bounded original-payload contract;
- Submission workflow and resolution vocabulary;
- opaque public reference format;
- 32-byte status secret issuance and one-way hash storage representation;
- purpose-built safe status projection;
- contact/public projection separation;
- evidence-link baseline safety checks.

P5-01B established:

- durable private Submission parent records;
- original/normalized/proposed payload separation;
- encrypted-contact persistence boundary;
- workflow event history;
- year-scoped public reference allocation;
- request identity and fingerprint persistence;
- guarded workflow transitions and stale-state conflict behavior;
- generated Drizzle migration `0023` and migration-drift closure.

P5-01C established:

- canonical SHA-256 intake fingerprinting;
- identical retry replay and changed-content conflict;
- deterministic HMAC-based status-secret re-derivation without plaintext secret storage;
- replay integrity checks against durable token hashes;
- mandatory contact-protection provider injection;
- safe private intake receipts;
- concurrent create-conflict recovery as replay when durable state matches;
- failure-before-persistence behavior for invalid requests and contact-protection failures.

P5-01D established:

- provider-neutral rate-limit and challenge-verification contracts;
- rate-limit-before-challenge ordering;
- fail-closed deny/unavailable behavior before durable intake;
- opaque rate-limit bucket-key boundary;
- bounded in-memory contract implementation for tests;
- Cloudflare Turnstile Siteverify adapter;
- request UUID Siteverify idempotency-key use;
- exact hostname and action validation;
- provider/network/response failure normalization without leaking provider internals.

P5-01E established:

- `submission` protected Audit domain;
- durable `submission_event` Audit source;
- opaque public Submission reference Audit target;
- metadata-only Drizzle projection excluding private payload, contact, token, fingerprint, internal note, and abuse-control data;
- submitter/reviewer/system actor normalization;
- A–D integration audit for commit, replay, changed-content conflict, abuse deny, and private receipt exclusion.

## P5-01F active scope

P5-01F adds the missing private follow-up read boundary required by the Phase 5 sequence completion gate:

```text
public Submission reference
+ status secret
↓
minimal status lookup
↓
secret verification
↓
strict safe status projection
```

P5-01F requires:

- persistence lookup by public reference;
- minimum-field Drizzle projection;
- same bounded failure for missing reference and wrong secret;
- safe public-facing status-label mapping;
- bounded permitted-action mapping;
- no private reviewer note, payload, contact, token hash, or internal identity leakage;
- focused tests and schema check coverage;
- correction of the premature P5-01E P5-02 gate statement.

P5-01 remains incomplete until P5-01F merges green.

## Route and environment requirements before public intake exposure

A public Submission route must not be exposed with placeholder providers. The first public intake route must wire and verify:

- concrete environment-backed contact encryption and email hashing;
- status-secret HMAC key environment binding;
- production distributed rate-limit provider;
- privacy-preserving opaque bucket-key derivation;
- Turnstile secret and site-key environment binding;
- exact hostname and expected-action configuration;
- route-level safe error mapping and Retry-After behavior;
- no logging of challenge token, raw remote IP, plaintext email, plaintext status secret, or provider secret;
- configured-environment verification of the complete route path.

## Phase 4 handoff and retained Launch work

P4-18E closed the Phase 5 handoff gate while keeping unavailable configured-environment checks explicit.

Starting Phase 5 does not waive retained work including:

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

Complete P5-01F. After it merges green, mark P5-01 completed and move to P5-02 Suggest Place and Online Service.

P5-02 must compose the P5-01 shared foundation and must not duplicate intake, persistence, secret, abuse-control, Audit, or status-projection logic.

## Blocked

No known repository blocker to P5-01F.

P5-02 is deliberately blocked until P5-01F closes the private follow-up status-read requirement.

Production contact encryption, HMAC key environment binding, production rate limiting, opaque bucket-key derivation, and Turnstile environment binding remain required before a public intake route is exposed.

Production restore completion remains a Launch gate rather than a P5-01/P5-02 repository start blocker.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
