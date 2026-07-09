# CryptoPayMap project status

**Last verified:** 2026-07-09

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-01C — Idempotent private intake service

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
- P5-01C idempotent private intake service is active.

## Fixed review environment

Review URL:

`https://review.cryptopaymap-staging.pages.dev`

Deployment receipt state must be checked whenever review-environment state matters. A repository merge must not be assumed visible at the fixed URL until the receipt records the intended `main` commit.

## Required current references

Before P5-01 implementation or review, read:

1. `docs/IMPLEMENTATION_PLAN.md`;
2. `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`;
3. `docs/SUBMISSION_WORKFLOW.md`;
4. `docs/DATA_MODEL.md`;
5. `docs/SECURITY_AND_PRIVACY.md`;
6. `docs/P5_01A_SUBMISSION_CONTRACT_AND_PRIVACY_MODEL.md`;
7. `docs/P5_01B_SUBMISSION_PERSISTENCE_FOUNDATION.md`;
8. `docs/P5_01C_IDEMPOTENT_PRIVATE_INTAKE.md`;
9. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

Media work must also read `docs/MEDIA_POLICY.md`.

## Phase 5 sequence

1. P5-01 — Shared submission foundation — In progress
2. P5-02 — Suggest Place and Online Service — Planned
3. P5-03 — Payment and problem reports — Planned
4. P5-04 — Business and service claims — Planned
5. P5-05 — Photo and Media submission intake — Planned
6. P5-06 — Review workflow extensions — Planned
7. P5-07 — Canonical application transactions and retention — Planned
8. P5-08 — MVP-B integration audit — Planned

## P5-01 execution slices

1. P5-01A — submission contract and privacy model — Completed through #150
2. P5-01B — persistence and workflow-state foundation — Completed through #151
3. P5-01C — idempotent private intake service — In progress
4. P5-01D — abuse-control and Turnstile boundary — Planned
5. P5-01E — Audit integration and Phase 5 foundation audit — Planned

## P5-01 active scope

P5-01 establishes the common private submission foundation before individual public submission forms are implemented.

P5-01A established:

- strict common submission envelope;
- bounded original-payload contract;
- submission workflow and resolution vocabulary;
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

P5-01C now establishes:

- canonical SHA-256 intake fingerprinting;
- identical retry replay and changed-content conflict;
- deterministic HMAC-based status-secret re-derivation without plaintext secret storage;
- replay integrity checks against durable token hashes;
- mandatory contact-protection provider injection;
- safe private intake receipts;
- concurrent create-conflict recovery as replay when durable state matches;
- failure-before-persistence behavior for invalid requests and contact-protection failures.

P5-01 must preserve the existing Candidate, canonical, Evidence, Media, verification, export, and publication boundaries.

## Phase 4 handoff result

P4-18E established that the Phase 5 handoff gate may close while keeping unavailable configured-environment checks explicit.

Verified handoff evidence includes:

- fixed review deployment receipt matched the intended handoff `main` commit;
- relevant staging validation succeeded;
- Foundation validation and Migration drift succeeded;
- representative screenshots were captured successfully;
- representative desktop/mobile and interactive-state images were inspected directly;
- no material visual Phase 5 handoff blocker was found.

Unavailable live checks remain explicit Launch work or configured-environment verification and are not treated as passed.

## Retained Launch work

Starting Phase 5 does not waive launch work recorded by P4-18D/E.

Retained work includes:

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

Complete P5-01C, then begin P5-01D abuse-control and Turnstile boundary.

Do not begin individual submission-form implementation before the common persistence, privacy, workflow, abuse-control, idempotency, and Audit foundations are explicit and validated.

## Blocked

No known repository blocker to P5-01C.

Production contact encryption and HMAC key environment binding remain required before a public intake route is exposed.

Production restore completion remains a Launch gate rather than a P5-01 start blocker.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
