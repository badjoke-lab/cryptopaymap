# P5-08C — Protected review and final-decision integration audit

## Purpose

P5-08C proves that all five public Submission families cross the protected review boundary only through their registered queue, detail, workspace, capability, and subject owners, and that every final decision is exact-state guarded, replay-safe, conflict-safe, and durably recorded before downstream application ownership begins.

## Family coverage

| Family | Protected review owners | Final-decision owners |
|---|---|---|
| Suggest | common review entry, Suggest reviewer entry, signals, information request, hold | accepted Candidate, duplicate/existing-target or terminal resolution |
| Payment Report | report reviewer entry, Evidence review workspace | positive payment Evidence or terminal resolution |
| Problem Report | report reviewer entry, report target context | correction, negative recheck, duplicate/no-change or terminal resolution |
| Business Claim | Business Claim reviewer entry, target context, verification execution | relationship, field, payment or terminal decisions |
| Photos | parent Submission review plus Media review workspace | child Media decisions and exact parent aggregate resolution |

## Required invariants

1. Protected review requires the exact registered capability and subject boundary.
2. Queue and detail routes cannot cross Submission-family ownership.
3. Follow-up actions are state-guarded and cannot manufacture a final decision.
4. Final decisions reject stale state, invalid transitions, changed-content replay, incomplete prerequisites, and duplicate execution.
5. Durable decision events or receipts exist before canonical application registration proceeds.
6. Review completion does not equal application completion or publication completion.
7. Review decisions cannot activate export, release, publication, or public state directly.
8. Photos child Media decisions remain separate from parent aggregate resolution.
9. Parent resolution requires the exact complete eligible child decision set.
10. Failure paths remain bounded and do not leak protected notes, identity, or backend details.

## Repository evidence

The executable audit verifies that the normal `schema:check` chain retains the common and family-specific owners for:

- protected review entry and follow-up;
- Suggest review transitions and accepted Candidate handling;
- Evidence decision and integration;
- Problem Report decisions and correction owners;
- Business Claim review transitions, verification, relationship, field, and payment decisions;
- Media review integration and photo parent resolution;
- application registration/lifecycle separation.

## Configured-environment evidence

Live Cloudflare Access identity, deployed capability allowlists, configured protected Admin journeys, live Neon transactions, and live Media/R2 behavior remain Phase 6 launch gates.

## Completion boundary

P5-08C is complete when the executable cross-family audit and normal repository workflows pass while preserving the P5-08A and P5-08B fixed audit receipts.

P5-08D remains the next owner for canonical application and publication-handoff integration.

## Explicit exclusions

No new runtime mutation, migration, canonical application owner, export/release activation, production deployment, live database/object-store mutation, DNS cutover, or launch-readiness claim is included.