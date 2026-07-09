# CryptoPayMap project status

**Last verified:** 2026-07-09

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-01 — Shared submission foundation

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
- Phase 5 is active at P5-01.

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
6. `docs/P4_18_D5_CLOSURE_AND_ENVIRONMENT_INVENTORY.md`;
7. `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

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

## P5-01 active scope

P5-01 establishes the common private submission foundation before individual public submission forms are implemented.

Required boundaries include:

- common submission envelope;
- opaque public reference;
- private follow-up secret handling;
- workflow status model;
- contact privacy boundary;
- source submission privacy and non-public defaults;
- abuse-control contract and Turnstile boundary;
- strict runtime parsing and bounded payloads;
- idempotent intake behavior;
- durable private submission audit foundation;
- no direct canonical or public mutation from intake.

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

Execute P5-01 Shared submission foundation.

Do not begin individual submission-form implementation before the common submission envelope, privacy, workflow, abuse, idempotency, and audit foundations are explicit and validated.

## Blocked

No known repository blocker to P5-01.

Production restore completion remains a Launch gate rather than a P5-01 start blocker.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and actual CI results. Current work order is determined by `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active phase specification.

Do not claim live verification from repository checks alone. Do not claim visual acceptance from screenshot generation alone; relevant images must be inspected directly.
