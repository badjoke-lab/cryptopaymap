# CryptoPayMap project status

**Last verified:** 2026-07-07

## Current phase

Phase 4 — Public core / MVP-A

## Active work

- P4-16 — MVP-A integration and quality audit
- P4-17A — Places contract and tracking correction
- P4-17F — State, responsive, accessibility, and final 17-point acceptance audit
- Branch: `work/places-ux-contract-correction`
- Pull request: #122

## Required Places references

Before continuing Places work, read:

1. `docs/PLACES_UX_ACCEPTANCE.md`
2. `docs/PLACES_RECOVERY_PLAN.md`
3. `docs/PLACES_UX_FINAL_AUDIT.md`
4. the P4-17 section of `docs/IMPLEMENTATION_PLAN.md`
5. `docs/PLACE_PUBLIC_PROFILE.md`

The complete 17-point recovery set remains required even when one pull request covers only part of it.

## Recovery sequence

- P4-17A — contract and tracking correction — In progress until final audit closes
- P4-17B — map presentation foundation recovery — Completed and validated
- P4-17C — Place information and public projection recovery — Completed and validated
- P4-17D — desktop selected panel and mobile sheet recovery — Completed; final cross-check in progress
- P4-17E — gallery, image enlargement, and external navigation — Completed; final cross-check in progress
- P4-17F — state, responsive, accessibility, and final 17-point acceptance audit — In progress

## Current P4-17F scope

- keep all 17 recovery requirements traceable to implementation and regression coverage;
- verify desktop selected-Place completeness including payment methods and restrictions;
- verify mobile peek/expanded role separation and direct drag-following behavior;
- verify Gallery, lightbox keyboard/touch/focus behavior, and public attribution display;
- verify Google Maps and Apple Maps navigation handoff;
- verify Current location ephemeral focus and distinct failure feedback;
- verify dynamic mobile map height, reduced-motion behavior, filters overlay, URL/history restoration, and deterministic selection semantics;
- require Foundation validation, Migration drift, and Staging review validation on the same final branch head.

## Next

1. Complete the 17-row audit in `docs/PLACES_UX_FINAL_AUDIT.md`.
2. Resolve any final workflow or regression failure on the current branch head.
3. Mark P4-17F complete only after all three repository workflows succeed on the same final head.
4. Update pull request #122 to reflect the complete recovery scope and validation result.

## Repository history relevant to this work

- Phase 3 repository work completed through #95.
- Public-core foundations P4-01 through P4-15 progressed through #119.
- P4-16A staging acceptance coverage completed through #120.
- P4-16B mobile List-to-Map synchronization completed through #121.
- P4-17B and P4-17C passed Foundation validation, Migration drift, and Staging review validation in #122.
- P4-17D and P4-17E implementation and regression coverage are present in #122 and are included in the final P4-17F validation head.
- #122 remains the active corrective Places work.

## Blocked

No repository blocker. Deferred live verification remains separate from repository completion work.

## Verification rule

Repository reality is determined by the current branch, merged pull requests, and CI results. Required Places completion behavior is determined by the revised Places acceptance contract, recovery plan, and final 17-point audit matrix.
