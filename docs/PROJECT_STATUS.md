# CryptoPayMap project status

**Last verified:** 2026-07-07

## Current phase

Phase 4 — Public core / MVP-A — Repository work completed through pull request #122

## Current repository state

- P4-16 — MVP-A integration and quality audit — Completed
- P4-17A through P4-17F — Places UX recovery — Completed, validated, and merged
- Pull request #122 merged into `main`
- Merge commit: `ddd7265e095590c66af10b64c4679d3b2ab5669b`

## Required Places references

Before changing Places behavior, read:

1. `docs/PLACES_UX_ACCEPTANCE.md`
2. `docs/PLACES_RECOVERY_PLAN.md`
3. `docs/PLACES_UX_FINAL_AUDIT.md`
4. `docs/PLACES_VALIDATION_EVIDENCE.md`
5. the P4-17 section of `docs/IMPLEMENTATION_PLAN.md`
6. `docs/PLACE_PUBLIC_PROFILE.md`

The complete 17-point recovery set remains the acceptance boundary for future Places changes.

## Recovery sequence

- P4-17A — contract and tracking correction — Completed
- P4-17B — map presentation foundation recovery — Completed and validated
- P4-17C — Place information and public projection recovery — Completed and validated
- P4-17D — desktop selected panel and mobile sheet recovery — Completed and validated
- P4-17E — gallery, image enlargement, and external navigation — Completed and validated
- P4-17F — state, responsive, accessibility, and final 17-point acceptance audit — Completed and validated

## Validated recovery result

The merged implementation includes:

- stable broad initial camera and street-map-oriented default style;
- explicit Place pin symbols distinct from aggregate clusters;
- reviewed practical Place profile fields through canonical, promotion, public-schema, staging, and selected-surface boundaries;
- near-complete desktop selected-Place information;
- compact mobile peek and practical expanded sheet;
- position-based direct drag-following sheet motion with first-entry and same-Place reentry coverage;
- Gallery and enlarged-media viewer with keyboard, touch, focus containment, focus return, body scroll lock, and attribution behavior;
- Google Maps and Apple Maps navigation handoff;
- Current location ephemeral focus with explicit area commit and distinct error states;
- dynamic mobile map height and deterministic selection, URL, and history behavior;
- accessible mobile site-menu and mobile Filters focus containment;
- covered desktop Result List hidden from keyboard focus while selected details are active;
- durable 17-point audit and regression coverage.

## Validation

Validated implementation head:

`7f1c3f7c3d2efa9234584401a8984da23b0564ba`

The complete recovery implementation passed:

1. Foundation validation
2. Migration drift
3. Staging review validation

Foundation validation included formatting, lint, Astro/TypeScript checks, runtime schema checks, migration history, 126 passing test files with 505 passing tests, static build, accessibility foundation checks, Phase 1 file checks, and staging artifact checks.

The only commit after the validated implementation head within #122 updated validation documentation and did not change the validated implementation.

## Next

1. Treat the merged 17-point Places contract as the baseline for all future Places work.
2. Keep deferred live verification separate from repository completion status.
3. Determine the next repository work from the Phase 5 Public submissions / MVP-B handoff and current roadmap priorities before starting implementation.

## Repository history relevant to this work

- Phase 3 repository work completed through #95.
- Public-core foundations P4-01 through P4-15 progressed through #119.
- P4-16A staging acceptance coverage completed through #120.
- P4-16B mobile List-to-Map synchronization completed through #121.
- P4-17A through P4-17F completed and merged through #122.

## Blocked

No repository blocker. Deferred live verification remains separate from repository completion work.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, and CI results. Required Places behavior is determined by the merged Places acceptance contract, recovery plan, final 17-point audit matrix, and validation evidence.
