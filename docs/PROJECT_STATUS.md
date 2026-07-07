# CryptoPayMap project status

**Last verified:** 2026-07-07

## Current phase

Phase 4 — Public core / MVP-A

## Active work

- P4-16 — MVP-A integration and quality audit
- P4-17A — Places contract and tracking correction
- P4-17D — Desktop selected panel and mobile sheet recovery
- Branch: `work/places-ux-contract-correction`
- Pull request: #122

## Required Places references

Before continuing Places work, read:

1. `docs/PLACES_UX_ACCEPTANCE.md`
2. `docs/PLACES_RECOVERY_PLAN.md`
3. the P4-17 section of `docs/IMPLEMENTATION_PLAN.md`
4. `docs/PLACE_PUBLIC_PROFILE.md`

The complete 17-point recovery set remains required even when one pull request covers only part of it.

## Recovery sequence

- P4-17A — contract and tracking correction — In progress
- P4-17B — map presentation foundation recovery — Completed and validated
- P4-17C — Place information and public projection recovery — Completed and validated
- P4-17D — desktop selected panel and mobile sheet recovery — In progress
- P4-17E — gallery, image enlargement, and external navigation — Planned
- P4-17F — state, responsive, accessibility, and final acceptance audit — Planned

## Current P4-17D scope

- make the desktop selected-Place panel useful without forcing routine navigation to the canonical detail page;
- show reviewed location, description, opening-hours text, amenities, phone, website, and social links when available;
- keep mobile peek concise and make expanded state information-complete for routine discovery;
- replace height-only sheet imitation with position-based sheet states;
- make active touch drag follow bounded finger movement directly;
- settle release to valid `peek` or `expanded` states while preserving visible button alternatives and reduced-motion behavior;
- add regression coverage for practical information and direct drag-following behavior.

## Next

1. Complete P4-17D implementation and validation in #122.
2. Execute P4-17E gallery, image enlargement, and external navigation work.
3. Run P4-17F and keep Phase 4 open until the full acceptance contract passes.
4. Add newly discovered Places defects to the acceptance contract and implementation tracking.

## Repository history relevant to this work

- Phase 3 repository work completed through #95.
- Public-core foundations P4-01 through P4-15 progressed through #119.
- P4-16A staging acceptance coverage completed through #120.
- P4-16B mobile List-to-Map synchronization completed through #121.
- P4-17B and P4-17C passed Foundation validation, Migration drift, and Staging review validation in #122.
- #122 remains the active corrective Places work.

## Blocked

No repository blocker. Deferred live verification remains separate from repository completion work.

## Verification rule

Repository reality is determined by the current branch, merged pull requests, and CI results. Required Places completion behavior is determined by the revised Places acceptance contract and recovery plan.
