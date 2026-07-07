# CryptoPayMap project status

**Last verified:** 2026-07-07

## Current phase

Phase 4 — Public core / MVP-A

## Active branch state

- P4-16 — MVP-A integration and quality audit — Completed on branch
- P4-17A through P4-17F — Places UX recovery — Completed and validated on branch
- Branch: `work/places-ux-contract-correction`
- Pull request: #122
- Pull request remains draft until explicit review/merge decision.

## Required Places references

Before changing Places behavior, read:

1. `docs/PLACES_UX_ACCEPTANCE.md`
2. `docs/PLACES_RECOVERY_PLAN.md`
3. `docs/PLACES_UX_FINAL_AUDIT.md`
4. the P4-17 section of `docs/IMPLEMENTATION_PLAN.md`
5. `docs/PLACE_PUBLIC_PROFILE.md`

The complete 17-point recovery set remains the acceptance boundary for future Places changes.

## Recovery sequence

- P4-17A — contract and tracking correction — Completed
- P4-17B — map presentation foundation recovery — Completed and validated
- P4-17C — Place information and public projection recovery — Completed and validated
- P4-17D — desktop selected panel and mobile sheet recovery — Completed and validated
- P4-17E — gallery, image enlargement, and external navigation — Completed and validated
- P4-17F — state, responsive, accessibility, and final 17-point acceptance audit — Completed and validated

## Validated recovery result

The branch now includes:

- stable broad initial camera and street-map-oriented default style;
- explicit Place pin symbols distinct from aggregate clusters;
- reviewed practical Place profile fields from canonical model through public projection;
- near-complete desktop selected-Place information;
- compact mobile peek and practical expanded sheet;
- position-based direct drag-following sheet motion;
- Gallery and accessible enlarged-media viewer;
- Google Maps and Apple Maps navigation handoff;
- Current location ephemeral focus with explicit area commit and distinct error states;
- dynamic mobile map height and deterministic selection, URL, and history behavior;
- durable 17-point audit and regression coverage.

## Validation

The complete recovery branch passed:

1. Foundation validation
2. Migration drift
3. Staging review validation

The validation includes formatting, lint, Astro/TypeScript checks, runtime schema checks, migration history, unit and component tests, static build, accessibility foundation, Phase 1 file checks, and staging artifact checks.

## Next

1. Keep pull request #122 draft until the explicit review/merge decision.
2. Preserve the 17-point audit matrix during review changes.
3. After #122 is merged, continue from the next Phase 4/Phase 5 handoff determined by repository status and roadmap priorities.

## Repository history relevant to this work

- Phase 3 repository work completed through #95.
- Public-core foundations P4-01 through P4-15 progressed through #119.
- P4-16A staging acceptance coverage completed through #120.
- P4-16B mobile List-to-Map synchronization completed through #121.
- P4-17A through P4-17F are completed on branch in #122.
- #122 remains the active draft corrective Places pull request.

## Blocked

No repository blocker. Deferred live verification remains separate from repository completion work.

## Verification rule

Repository reality is determined by the current branch, merged pull requests, and CI results. Required Places completion behavior is determined by the revised Places acceptance contract, recovery plan, and final 17-point audit matrix.
